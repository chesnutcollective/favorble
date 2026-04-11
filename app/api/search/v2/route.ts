/**
 * /api/search/v2 — the polymorphic search endpoint backed by
 * `search_documents`. Replaces the previous ILIKE-based /api/search as
 * soon as the new CommandPalette is wired up.
 *
 * Pipeline:
 *   1. requireSession → principal + access filter
 *   2. parseQuery    → scope, direct-identifier hint, facets, date
 *   3. Run lexical and semantic queries in parallel
 *   4. Reciprocal Rank Fusion merge with per-type caps
 *   5. Apply entity-affinity boost (my cases / my leads)
 *   6. Fire-and-forget audit log insert
 *
 * Every SQL query goes through the same access-filter fragment so
 * organization + role + team-chat isolation is enforced uniformly.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { parseQuery, dateBucketBounds } from "@/lib/search/query-parser";
import {
  buildAccessFilter,
  principalFromSession,
} from "@/lib/search/access-filter";
import { reciprocalRankFusion, type RankedList } from "@/lib/search/rrf";
import { embedQuery, isEmbeddingConfigured } from "@/lib/search/embed-client";
import type {
  EntityType,
  SearchFacetCount,
  SearchMatchedField,
  SearchResponse,
  SearchResult,
} from "@/lib/search/types";

// ─── Route handler ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const started = Date.now();
  const session = await requireSession();
  const principal = principalFromSession(session);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "30"), 60);
  const includeTeamChat = url.searchParams.get("chat") === "1";
  const scopeOverride = url.searchParams.get("scope");

  if (!q) {
    return NextResponse.json<SearchResponse>({
      query: "",
      scope: "all",
      totalHits: 0,
      results: [],
      facets: [],
      typeCounts: {} as Record<EntityType, number>,
      latencyMs: Date.now() - started,
      semanticDisabled: !isEmbeddingConfigured(),
    });
  }

  const parsed = parseQuery(q);
  if (scopeOverride) {
    parsed.scope = scopeOverride as typeof parsed.scope;
  }

  const accessSql = buildAccessFilter(principal, { includeTeamChat });
  const scopeSql = buildScopeFilter(parsed.scope);
  const dateSql = buildDateFilter(parsed.dateBucket);

  // Use the parsed text if there's anything left after stripping
  // prefixes. Fall back to the raw query so `case:HS-22215` still
  // performs a lookup on the identifier.
  const textForSearch = parsed.text.length > 0 ? parsed.text : q;

  // Run lexical + identifier exact match + (optionally) semantic in
  // parallel. Each returns up to 60 rows, RRF merges, per-type caps
  // trim to the final limit.
  const [lexicalRows, exactRows, semanticRows] = await Promise.all([
    runLexicalQuery(textForSearch, accessSql, scopeSql, dateSql),
    parsed.directIdentifier
      ? runIdentifierLookup(parsed.directIdentifier.value, accessSql)
      : Promise.resolve([]),
    runSemanticQuery(textForSearch, accessSql, scopeSql, dateSql),
  ]);

  // Build ranked lists for RRF.
  const lexical: RankedList = lexicalRows.map((row) => ({
    id: `${row.entity_type}:${row.entity_id}`,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    row: {
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      title: row.title,
      subtitle: row.subtitle,
      snippet: row.snippet ?? null,
      matchedField: (row.matched_field as SearchMatchedField) ?? "body",
      href: hrefFor(row.entity_type as EntityType, row.entity_id, row.facets),
      facets: (row.facets as Record<string, unknown>) ?? {},
    },
  }));

  const semantic: RankedList = semanticRows.map((row) => ({
    id: `${row.entity_type}:${row.entity_id}`,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    row: {
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      title: row.title,
      subtitle: row.subtitle,
      snippet: row.snippet ?? null,
      matchedField: "body",
      href: hrefFor(row.entity_type as EntityType, row.entity_id, row.facets),
      facets: (row.facets as Record<string, unknown>) ?? {},
    },
  }));

  // Exact-identifier hits get a huge boost — they appear as their own
  // virtual ranker with the hit at position 1.
  const identifierList: RankedList = exactRows.map((row, i) => ({
    id: `${row.entity_type}:${row.entity_id}`,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    row: {
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      title: row.title,
      subtitle: row.subtitle,
      snippet: null,
      matchedField: "identifier",
      href: hrefFor(row.entity_type as EntityType, row.entity_id, row.facets),
      facets: (row.facets as Record<string, unknown>) ?? {},
    },
  }));

  // "My stuff" affinity boost. Cases I own, leads assigned to me, etc.
  const affinityBoosts = buildAffinityBoosts(lexicalRows, semanticRows, principal.userId);

  // Merge with RRF. We treat the identifier list as a lexical prepend:
  // exact-ID hits effectively land at rank 0, guaranteeing top slot.
  const fused = reciprocalRankFusion(
    [...identifierList, ...lexical],
    semantic,
    {
      k: 60,
      maxResults: limit,
      affinityBoosts,
    },
  );

  const typeCounts: Record<string, number> = {};
  for (const hit of fused) {
    typeCounts[hit.entityType] = (typeCounts[hit.entityType] ?? 0) + 1;
  }

  // Compute facet counts for the filtered set (keeps facet panels
  // consistent with the results the user can actually see).
  const facetCounts = await runFacetAggregation(
    textForSearch,
    accessSql,
    scopeSql,
    dateSql,
  );

  // Fire-and-forget audit log insert. Must not await — the hot path
  // owes the user a fast response, not a durable log write.
  logSearchAsync({
    organizationId: session.organizationId,
    userId: session.id,
    queryText: q,
    queryScope: parsed.scope,
    resultCount: fused.length,
    resultIds: fused.map((r) => r.entityId),
    latencyMs: Date.now() - started,
    clientIp: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
    filters: { facets: parsed.facets, dateBucket: parsed.dateBucket ?? null },
  });

  return NextResponse.json<SearchResponse>({
    query: q,
    scope: parsed.scope,
    totalHits: fused.length,
    results: fused,
    facets: facetCounts,
    typeCounts: typeCounts as Record<EntityType, number>,
    latencyMs: Date.now() - started,
    semanticDisabled: !isEmbeddingConfigured(),
  });
}

// ─── Internals ────────────────────────────────────────────────────

type RawRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  matched_field: string | null;
  facets: unknown;
  rank_score: number;
};

async function runLexicalQuery(
  text: string,
  accessSql: ReturnType<typeof buildAccessFilter>,
  scopeSql: ReturnType<typeof buildScopeFilter>,
  dateSql: ReturnType<typeof buildDateFilter>,
): Promise<RawRow[]> {
  // `websearch_to_tsquery` accepts the same syntax as a web search box
  // (quoted phrases, -exclusion, etc.) and is safer than to_tsquery()
  // because it never raises on malformed input.
  const rows = await db.execute<RawRow>(sql`
    SELECT
      id::text                                           AS id,
      entity_type                                        AS entity_type,
      entity_id::text                                    AS entity_id,
      title                                              AS title,
      subtitle                                           AS subtitle,
      ts_headline(
        'english',
        coalesce(body, subtitle, title),
        websearch_to_tsquery('english', ${text}),
        'StartSel=«, StopSel=», MaxFragments=1, MaxWords=20, MinWords=5'
      )                                                  AS snippet,
      'body'::text                                       AS matched_field,
      facets                                             AS facets,
      (
        ts_rank_cd(tsv, websearch_to_tsquery('english', ${text}))
        + CASE
            WHEN title % ${text} THEN 0.3
            ELSE 0
          END
        + CASE
            WHEN entity_updated_at > now() - interval '30 days' THEN 0.1
            ELSE 0
          END
      )                                                  AS rank_score
    FROM search_documents
    WHERE ${accessSql}
      AND ${scopeSql}
      AND ${dateSql}
      AND (
        tsv @@ websearch_to_tsquery('english', ${text})
        OR title % ${text}
        OR subtitle % ${text}
      )
    ORDER BY rank_score DESC
    LIMIT 60
  `);
  // drizzle-orm/postgres-js returns an array directly for db.execute.
  return rows as unknown as RawRow[];
}

async function runSemanticQuery(
  text: string,
  accessSql: ReturnType<typeof buildAccessFilter>,
  scopeSql: ReturnType<typeof buildScopeFilter>,
  dateSql: ReturnType<typeof buildDateFilter>,
): Promise<RawRow[]> {
  if (!isEmbeddingConfigured()) return [];
  const vec = await embedQuery(text);
  if (!vec) return [];
  const vecLiteral = `[${vec.join(",")}]`;
  const rows = await db.execute<RawRow>(sql`
    SELECT
      id::text                              AS id,
      entity_type                           AS entity_type,
      entity_id::text                       AS entity_id,
      title                                 AS title,
      subtitle                              AS subtitle,
      left(coalesce(body, subtitle, title), 160) AS snippet,
      'body'::text                          AS matched_field,
      facets                                AS facets,
      (1 - (embedding <=> ${vecLiteral}::vector)) AS rank_score
    FROM search_documents
    WHERE ${accessSql}
      AND ${scopeSql}
      AND ${dateSql}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT 60
  `);
  return rows as unknown as RawRow[];
}

async function runIdentifierLookup(
  identifier: string,
  accessSql: ReturnType<typeof buildAccessFilter>,
): Promise<RawRow[]> {
  const rows = await db.execute<RawRow>(sql`
    SELECT
      id::text                      AS id,
      entity_type                   AS entity_type,
      entity_id::text               AS entity_id,
      title                         AS title,
      subtitle                      AS subtitle,
      NULL::text                    AS snippet,
      'identifier'::text            AS matched_field,
      facets                        AS facets,
      1.0::float                    AS rank_score
    FROM search_documents
    WHERE ${accessSql}
      AND ${identifier} = ANY(identifiers)
    LIMIT 5
  `);
  return rows as unknown as RawRow[];
}

type FacetCountRow = { key: string; value: string; count: number };

async function runFacetAggregation(
  text: string,
  accessSql: ReturnType<typeof buildAccessFilter>,
  scopeSql: ReturnType<typeof buildScopeFilter>,
  dateSql: ReturnType<typeof buildDateFilter>,
): Promise<SearchFacetCount[]> {
  // Count rows per entity_type — the most broadly useful facet.
  // We deliberately DO NOT compute per-field facets here at phase 0
  // to keep the query fast. Phase 1 adds jsonb facet unpacking.
  try {
    const rows = await db.execute<FacetCountRow>(sql`
      SELECT
        'entity_type'::text AS key,
        entity_type          AS value,
        count(*)::int        AS count
      FROM search_documents
      WHERE ${accessSql}
        AND ${scopeSql}
        AND ${dateSql}
        AND (
          tsv @@ websearch_to_tsquery('english', ${text})
          OR title % ${text}
        )
      GROUP BY entity_type
      ORDER BY count DESC
      LIMIT 20
    `);
    return (rows as unknown as FacetCountRow[]).map((r) => ({
      key: r.key,
      value: r.value,
      count: r.count,
    }));
  } catch {
    return [];
  }
}

function buildScopeFilter(scope: string) {
  if (scope === "all" || !scope) return sql`TRUE`;
  const scopeToTypes: Record<string, string[]> = {
    case: ["case"],
    contact: ["contact"],
    lead: ["lead"],
    user: ["user"],
    document: ["document", "document_chunk"],
    chronology: ["chronology_entry"],
    calendar: ["calendar_event"],
    task: ["task"],
    communication: ["communication"],
    chat: ["chat_message"],
    mail: ["outbound_mail"],
    billing: ["invoice", "time_entry", "expense", "payment"],
    trust: ["trust_transaction"],
  };
  const types = scopeToTypes[scope];
  if (!types) return sql`TRUE`;
  return sql`entity_type = ANY(${types}::text[])`;
}

function buildDateFilter(bucket: ReturnType<typeof dateBucketBounds> extends infer _T ? Parameters<typeof dateBucketBounds>[0] : never) {
  const bounds = dateBucketBounds(bucket);
  if (!bounds) return sql`TRUE`;
  const from = bounds.from;
  const to = bounds.to;
  if (from && to) return sql`entity_updated_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz`;
  if (from) return sql`entity_updated_at >= ${from}::timestamptz`;
  if (to) return sql`entity_updated_at <= ${to}::timestamptz`;
  return sql`TRUE`;
}

/** Derive a deep link for each entity type. */
function hrefFor(
  type: EntityType,
  entityId: string,
  facets: unknown,
): string {
  const f = (facets ?? {}) as Record<string, unknown>;
  switch (type) {
    case "case":
      return `/cases/${entityId}`;
    case "contact":
      return `/contacts/${entityId}`;
    case "lead":
      return `/leads/${entityId}`;
    case "user":
      return `/admin/users`;
    case "document": {
      const caseId = typeof f.case_id === "string" ? f.case_id : null;
      return caseId
        ? `/cases/${caseId}/documents`
        : `/documents`;
    }
    case "document_chunk": {
      const caseId = typeof f.case_id === "string" ? f.case_id : null;
      const docId = typeof f.document_id === "string" ? f.document_id : null;
      const page = typeof f.page_number === "number" ? f.page_number : undefined;
      const pageQs = page ? `?page=${page}` : "";
      if (caseId && docId) {
        return `/cases/${caseId}/documents${pageQs}`;
      }
      return `/documents${pageQs}`;
    }
    case "chronology_entry": {
      const caseId = typeof f.case_id === "string" ? f.case_id : null;
      return caseId ? `/cases/${caseId}/chronology` : `/cases`;
    }
    case "calendar_event":
      return `/calendar`;
    case "task": {
      const caseId = typeof f.case_id === "string" ? f.case_id : null;
      return caseId ? `/cases/${caseId}/tasks` : `/queue`;
    }
    case "communication": {
      const commType = typeof f.type === "string" ? f.type : "";
      if (commType.startsWith("email")) return `/email`;
      return `/messages`;
    }
    case "chat_message":
      return `/team-chat`;
    case "outbound_mail":
      return `/mail`;
    case "invoice":
      return `/billing/invoices`;
    case "time_entry":
      return `/billing/time`;
    case "expense":
      return `/billing`;
    case "payment":
      return `/billing/invoices`;
    case "trust_transaction":
      return `/trust`;
    case "workflow":
      return `/admin/workflows`;
    case "document_template":
      return `/admin/templates`;
    case "audit_log_entry":
      return `/admin/audit-logs`;
    default:
      return `/`;
  }
}

function buildAffinityBoosts(
  lexical: RawRow[],
  semantic: RawRow[],
  userId: string,
): Record<string, number> {
  const boosts: Record<string, number> = {};
  const apply = (rows: RawRow[]) => {
    for (const row of rows) {
      const f = (row.facets ?? {}) as Record<string, unknown>;
      if (f.owner_user_id === userId) boosts[row.entity_id] = 0.03;
      else if (f.assigned_to_id === userId) boosts[row.entity_id] = 0.015;
    }
  };
  apply(lexical);
  apply(semantic);
  return boosts;
}

async function logSearchAsync(entry: {
  organizationId: string;
  userId: string;
  queryText: string;
  queryScope: string;
  resultCount: number;
  resultIds: string[];
  latencyMs: number;
  clientIp: string | null;
  userAgent: string | null;
  filters: Record<string, unknown>;
}): Promise<void> {
  // Fire and forget — swallow errors so a broken audit table never
  // breaks search. Log to server console as a fallback.
  try {
    await db.execute(sql`
      INSERT INTO search_audit_log (
        organization_id, user_id, query_text, query_scope,
        filters, result_count, result_ids, latency_ms,
        client_ip, user_agent
      ) VALUES (
        ${entry.organizationId}::uuid,
        ${entry.userId}::uuid,
        ${entry.queryText},
        ${entry.queryScope},
        ${JSON.stringify(entry.filters)}::jsonb,
        ${entry.resultCount},
        ${entry.resultIds.length ? sql.raw(`ARRAY[${entry.resultIds.map((id) => `'${id}'::uuid`).join(",")}]`) : sql`NULL::uuid[]`},
        ${entry.latencyMs},
        ${entry.clientIp ?? null},
        ${entry.userAgent ?? null}
      )
    `);
  } catch (err) {
    console.warn("[search] audit log insert failed", err);
  }
}
