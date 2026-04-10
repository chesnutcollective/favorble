/**
 * MyCase bulk import script for Favorble.
 *
 * Pulls all cases, contacts, and leads from the MyCase REST API and
 * upserts them into the Favorble database. The script is idempotent —
 * it can safely be re-run. MyCase IDs are stored in the metadata jsonb
 * column for deduplication.
 *
 * Required env vars:
 *   MYCASE_API_KEY   — MyCase REST API key
 *   DATABASE_URL     — Postgres connection string
 *
 * Run with:
 *   npx tsx scripts/mycase-import.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql, and } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// We can't use the server-only mycase.ts directly in a script (no Next.js
// runtime), so we inline a minimal version of the API client here that
// reuses the same types and logic.
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.mycase.com/v2";
const PER_PAGE = 50;
const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRIES = 3;

function getApiKey(): string {
  const key = process.env.MYCASE_API_KEY;
  if (!key) {
    throw new Error("MYCASE_API_KEY environment variable is not set");
  }
  return key;
}

// ---------------------------------------------------------------------------
// Types (duplicated from lib/integrations/mycase.ts to avoid server-only)
// ---------------------------------------------------------------------------

interface MyCaseContact {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  company_name: string | null;
  contact_type: string | null;
  created_at: string;
  updated_at: string;
}

interface MyCaseCase {
  id: number;
  case_number: string;
  name: string;
  description: string | null;
  status: string;
  practice_area: string | null;
  open_date: string | null;
  close_date: string | null;
  statute_of_limitations: string | null;
  created_at: string;
  updated_at: string;
  contacts?: MyCaseContact[];
  custom_fields?: Record<string, string | null>;
}

interface MyCaseLead {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  practice_area: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  custom_fields?: Record<string, string | null>;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

// ---------------------------------------------------------------------------
// Minimal fetch helpers
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function myCaseFetch<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await rateLimit();

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : 5000 * (attempt + 1);
        log(`  Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (response.status >= 500) {
        const waitMs = 2000 * (attempt + 1);
        log(`  Server error ${response.status}, retrying in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `MyCase API ${response.status}: ${errorBody.slice(0, 500)}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  throw (
    lastError ?? new Error(`MyCase fetch failed after ${MAX_RETRIES} retries`)
  );
}

async function fetchAllPages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await myCaseFetch<PaginatedResponse<T>>(path, {
      page,
      per_page: PER_PAGE,
    });

    all.push(...response.data);
    totalPages = response.meta.total_pages;

    log(
      `  Fetched ${path} page ${page}/${totalPages} (${all.length}/${response.meta.total_count})`,
    );
    page++;
  } while (page <= totalPages);

  return all;
}

// ---------------------------------------------------------------------------
// Status mapping (duplicated from mycase.ts)
// ---------------------------------------------------------------------------

function mapCaseStatus(
  myCaseStatus: string,
): "active" | "on_hold" | "closed_won" | "closed_lost" | "closed_withdrawn" {
  const s = myCaseStatus.toLowerCase().trim();
  if (s === "open" || s === "active" || s === "pending") return "active";
  if (s === "on hold" || s === "on_hold" || s === "paused") return "on_hold";
  if (s === "closed" || s === "closed - won" || s === "won") return "closed_won";
  if (s === "closed - lost" || s === "lost") return "closed_lost";
  if (s === "closed - withdrawn" || s === "withdrawn") return "closed_withdrawn";
  return "active";
}

function mapLeadStatus(
  myCaseStatus: string,
): "new" | "contacted" | "intake_scheduled" | "intake_in_progress" | "contract_sent" | "contract_signed" | "converted" | "declined" | "unresponsive" | "disqualified" {
  const s = myCaseStatus.toLowerCase().trim();
  if (s === "new" || s === "pending") return "new";
  if (s === "contacted" || s === "in progress") return "contacted";
  if (s === "qualified") return "intake_scheduled";
  if (s === "converted" || s === "retained") return "converted";
  if (s === "declined" || s === "rejected") return "declined";
  if (s === "unresponsive" || s === "no response") return "unresponsive";
  if (s === "disqualified") return "disqualified";
  return "new";
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function logError(msg: string, error?: unknown): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ERROR: ${msg}`, error);
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

function getDb() {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "")
    .replace(/\\n$/, "")
    .replace(/\n$/, "")
    .trim();

  if (!url) {
    throw new Error("DATABASE_URL or POSTGRES_URL environment variable is required");
  }

  const client = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return { db: drizzle(client, { schema }), client };
}

// ---------------------------------------------------------------------------
// Import: Contacts
// ---------------------------------------------------------------------------

async function importContacts(
  db: ReturnType<typeof drizzle<typeof schema>>,
  organizationId: string,
  myCaseContacts: MyCaseContact[],
): Promise<Map<number, string>> {
  log(`Importing ${myCaseContacts.length} contacts...`);

  /** Maps MyCase contact ID → Favorble contact UUID */
  const idMap = new Map<number, string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const mc of myCaseContacts) {
    try {
      // Check for existing contact by MyCase ID in metadata
      const existing = await db
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.organizationId, organizationId),
            sql`${schema.contacts.metadata}->>'mycaseId' = ${String(mc.id)}`,
          ),
        )
        .limit(1);

      const contactData = {
        organizationId,
        firstName: mc.first_name || "Unknown",
        lastName: mc.last_name || "Unknown",
        email: mc.email,
        phone: mc.phone,
        address: mc.address,
        city: mc.city,
        state: mc.state,
        zip: mc.zip,
        contactType: mapContactType(mc.contact_type),
        metadata: {
          mycaseId: String(mc.id),
          mycaseContactType: mc.contact_type,
          mycaseCompanyName: mc.company_name,
          mycaseCreatedAt: mc.created_at,
          mycaseUpdatedAt: mc.updated_at,
          importedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(schema.contacts)
          .set(contactData)
          .where(eq(schema.contacts.id, existing[0].id));
        idMap.set(mc.id, existing[0].id);
        updated++;
      } else {
        const [inserted] = await db
          .insert(schema.contacts)
          .values({
            ...contactData,
            createdAt: mc.created_at ? new Date(mc.created_at) : new Date(),
          })
          .returning({ id: schema.contacts.id });
        idMap.set(mc.id, inserted.id);
        created++;
      }
    } catch (error) {
      logError(`Failed to import contact ${mc.id} (${mc.first_name} ${mc.last_name})`, error);
      skipped++;
    }

    if ((created + updated + skipped) % 500 === 0) {
      log(`  Contacts progress: ${created + updated + skipped}/${myCaseContacts.length}`);
    }
  }

  log(`Contacts done: ${created} created, ${updated} updated, ${skipped} skipped`);
  return idMap;
}

function mapContactType(myCaseType: string | null): string {
  if (!myCaseType) return "claimant";
  const t = myCaseType.toLowerCase().trim();

  if (t.includes("client") || t.includes("claimant")) return "claimant";
  if (t.includes("attorney") || t.includes("lawyer")) return "attorney";
  if (t.includes("doctor") || t.includes("medical") || t.includes("provider"))
    return "medical_provider";
  if (t.includes("judge")) return "judge";
  if (t.includes("expert") || t.includes("witness")) return "expert";
  if (t.includes("ssa") || t.includes("social security")) return "ssa_office";
  if (t.includes("insurance")) return "insurance";
  if (t.includes("employer")) return "employer";
  if (t.includes("court")) return "court";
  if (t.includes("referral")) return "referral_source";

  return "other";
}

// ---------------------------------------------------------------------------
// Import: Cases
// ---------------------------------------------------------------------------

async function importCases(
  db: ReturnType<typeof drizzle<typeof schema>>,
  organizationId: string,
  myCaseCases: MyCaseCase[],
  defaultStageId: string,
): Promise<Map<number, string>> {
  log(`Importing ${myCaseCases.length} cases...`);

  const idMap = new Map<number, string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const mc of myCaseCases) {
    try {
      // Check for existing case by MyCase ID stored in metadata
      // We use a raw SQL query against the cases table. The cases table
      // doesn't have a metadata column, so we match on caseNumber instead
      // and additionally check for a match marker.
      const existing = await db
        .select({ id: schema.cases.id })
        .from(schema.cases)
        .where(
          and(
            eq(schema.cases.organizationId, organizationId),
            eq(schema.cases.caseNumber, mc.case_number || `MC-${mc.id}`),
          ),
        )
        .limit(1);

      const status = mapCaseStatus(mc.status);
      const closedAt =
        status.startsWith("closed") && mc.close_date
          ? new Date(mc.close_date)
          : status.startsWith("closed")
            ? new Date()
            : null;

      const caseData = {
        organizationId,
        caseNumber: mc.case_number || `MC-${mc.id}`,
        status,
        currentStageId: defaultStageId,
        stageEnteredAt: mc.open_date ? new Date(mc.open_date) : new Date(),
        closedAt,
        closedReason: status.startsWith("closed") ? `Imported from MyCase (${mc.status})` : null,
        // Store MyCase ID in the Case Status external ID field for reference
        caseStatusExternalId: `mycase:${mc.id}`,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(schema.cases)
          .set(caseData)
          .where(eq(schema.cases.id, existing[0].id));
        idMap.set(mc.id, existing[0].id);
        updated++;
      } else {
        const [inserted] = await db
          .insert(schema.cases)
          .values({
            ...caseData,
            createdAt: mc.created_at ? new Date(mc.created_at) : new Date(),
          })
          .returning({ id: schema.cases.id });
        idMap.set(mc.id, inserted.id);
        created++;
      }
    } catch (error) {
      logError(`Failed to import case ${mc.id} (${mc.case_number})`, error);
      skipped++;
    }

    if ((created + updated + skipped) % 500 === 0) {
      log(`  Cases progress: ${created + updated + skipped}/${myCaseCases.length}`);
    }
  }

  log(`Cases done: ${created} created, ${updated} updated, ${skipped} skipped`);
  return idMap;
}

// ---------------------------------------------------------------------------
// Import: Leads
// ---------------------------------------------------------------------------

async function importLeads(
  db: ReturnType<typeof drizzle<typeof schema>>,
  organizationId: string,
  myCaseLeads: MyCaseLead[],
): Promise<Map<number, string>> {
  log(`Importing ${myCaseLeads.length} leads...`);

  const idMap = new Map<number, string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const mc of myCaseLeads) {
    try {
      // Check for existing lead by MyCase ID in sourceData
      const existing = await db
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.organizationId, organizationId),
            sql`${schema.leads.sourceData}->>'mycaseId' = ${String(mc.id)}`,
          ),
        )
        .limit(1);

      const leadData = {
        organizationId,
        firstName: mc.first_name || "Unknown",
        lastName: mc.last_name || "Unknown",
        email: mc.email,
        phone: mc.phone,
        status: mapLeadStatus(mc.status),
        source: mc.source || "mycase",
        sourceData: {
          mycaseId: String(mc.id),
          mycaseStatus: mc.status,
          mycasePracticeArea: mc.practice_area,
          mycaseDescription: mc.description,
          mycaseCustomFields: mc.custom_fields ?? {},
          mycaseCreatedAt: mc.created_at,
          mycaseUpdatedAt: mc.updated_at,
          importedAt: new Date().toISOString(),
        },
        notes: mc.description,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(schema.leads)
          .set(leadData)
          .where(eq(schema.leads.id, existing[0].id));
        idMap.set(mc.id, existing[0].id);
        updated++;
      } else {
        const [inserted] = await db
          .insert(schema.leads)
          .values({
            ...leadData,
            createdAt: mc.created_at ? new Date(mc.created_at) : new Date(),
          })
          .returning({ id: schema.leads.id });
        idMap.set(mc.id, inserted.id);
        created++;
      }
    } catch (error) {
      logError(`Failed to import lead ${mc.id} (${mc.first_name} ${mc.last_name})`, error);
      skipped++;
    }

    if ((created + updated + skipped) % 500 === 0) {
      log(`  Leads progress: ${created + updated + skipped}/${myCaseLeads.length}`);
    }
  }

  log(`Leads done: ${created} created, ${updated} updated, ${skipped} skipped`);
  return idMap;
}

// ---------------------------------------------------------------------------
// Ensure default stage exists
// ---------------------------------------------------------------------------

async function ensureDefaultStage(
  db: ReturnType<typeof drizzle<typeof schema>>,
  organizationId: string,
): Promise<string> {
  // Try to find an existing initial stage
  const existingStage = await db
    .select({ id: schema.caseStages.id })
    .from(schema.caseStages)
    .where(
      and(
        eq(schema.caseStages.organizationId, organizationId),
        eq(schema.caseStages.isInitial, true),
      ),
    )
    .limit(1);

  if (existingStage.length > 0) {
    return existingStage[0].id;
  }

  // Fall back to any stage
  const anyStage = await db
    .select({ id: schema.caseStages.id })
    .from(schema.caseStages)
    .where(eq(schema.caseStages.organizationId, organizationId))
    .limit(1);

  if (anyStage.length > 0) {
    return anyStage[0].id;
  }

  // Create a minimal stage group and stage for import
  log("No case stages found. Creating default stage group and stage for import...");

  const [group] = await db
    .insert(schema.caseStageGroups)
    .values({
      organizationId,
      name: "Imported",
      displayOrder: 0,
      color: "#6B7280",
    })
    .returning({ id: schema.caseStageGroups.id });

  const [stage] = await db
    .insert(schema.caseStages)
    .values({
      organizationId,
      stageGroupId: group.id,
      name: "Imported from MyCase",
      code: "mycase_import",
      description: "Default stage for cases imported from MyCase",
      displayOrder: 0,
      isInitial: true,
    })
    .returning({ id: schema.caseStages.id });

  return stage.id;
}

// ---------------------------------------------------------------------------
// Ensure organization exists
// ---------------------------------------------------------------------------

async function ensureOrganization(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<string> {
  // Look for existing org (Hogan Smith Law)
  const existing = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create a default org
  log("No organization found. Creating Hogan Smith Law...");
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "Hogan Smith Law",
      slug: "hogan-smith-law",
    })
    .returning({ id: schema.organizations.id });

  return org.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("=== MyCase Import Starting ===");
  const startTime = Date.now();

  // Validate env
  if (!process.env.MYCASE_API_KEY) {
    console.error(
      "ERROR: MYCASE_API_KEY environment variable is required.\n" +
        "Set it in .env.local or pass it inline:\n" +
        "  MYCASE_API_KEY=your_key npx tsx scripts/mycase-import.ts",
    );
    process.exit(1);
  }

  const { db, client } = getDb();

  try {
    // Resolve organization
    const organizationId = await ensureOrganization(db);
    log(`Using organization: ${organizationId}`);

    // Ensure we have a default stage for case imports
    const defaultStageId = await ensureDefaultStage(db, organizationId);
    log(`Using default stage: ${defaultStageId}`);

    // -----------------------------------------------------------------------
    // Phase 1: Fetch from MyCase API
    // -----------------------------------------------------------------------
    log("\n--- Phase 1: Fetching data from MyCase API ---");

    log("Fetching contacts...");
    const myCaseContacts = await fetchAllPages<MyCaseContact>("/contacts");
    log(`Fetched ${myCaseContacts.length} contacts`);

    log("Fetching cases...");
    const myCaseCases = await fetchAllPages<MyCaseCase>("/cases");
    log(`Fetched ${myCaseCases.length} cases`);

    log("Fetching leads...");
    const myCaseLeads = await fetchAllPages<MyCaseLead>("/leads");
    log(`Fetched ${myCaseLeads.length} leads`);

    // -----------------------------------------------------------------------
    // Phase 2: Import into Favorble database
    // -----------------------------------------------------------------------
    log("\n--- Phase 2: Importing into Favorble database ---");

    // Import contacts first (cases may reference them)
    const contactIdMap = await importContacts(db, organizationId, myCaseContacts);

    // Import cases
    const caseIdMap = await importCases(db, organizationId, myCaseCases, defaultStageId);

    // Import leads
    const leadIdMap = await importLeads(db, organizationId, myCaseLeads);

    // -----------------------------------------------------------------------
    // Phase 3: Link contacts to cases via case_contacts join table
    // -----------------------------------------------------------------------
    log("\n--- Phase 3: Linking contacts to cases ---");
    let linked = 0;
    let linkSkipped = 0;

    for (const mc of myCaseCases) {
      if (!mc.contacts || mc.contacts.length === 0) continue;

      const favorbleCaseId = caseIdMap.get(mc.id);
      if (!favorbleCaseId) continue;

      for (const contact of mc.contacts) {
        const favorbleContactId = contactIdMap.get(contact.id);
        if (!favorbleContactId) continue;

        try {
          await db
            .insert(schema.caseContacts)
            .values({
              caseId: favorbleCaseId,
              contactId: favorbleContactId,
              relationship: mapContactType(contact.contact_type),
              isPrimary: contact.contact_type?.toLowerCase().includes("client") ?? false,
            })
            .onConflictDoNothing();
          linked++;
        } catch {
          linkSkipped++;
        }
      }
    }
    log(`Case-contact links: ${linked} created, ${linkSkipped} skipped (duplicates)`);

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n=== MyCase Import Complete in ${elapsed}s ===`);
    log(`  Contacts: ${contactIdMap.size} imported`);
    log(`  Cases:    ${caseIdMap.size} imported`);
    log(`  Leads:    ${leadIdMap.size} imported`);
    log(`  Links:    ${linked} case-contact associations`);
  } catch (error) {
    logError("Import failed", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
