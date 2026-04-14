/**
 * Build the SQL WHERE fragment that enforces row-level access control
 * on `search_documents`. This is applied as a HARD pre-filter inside
 * the query — never a post-filter on returned rows, because post-
 * filtering leaks information through result counts, facet counts, and
 * pagination.
 *
 * Rules:
 *   1. Organization isolation is unconditional.
 *   2. Role must be in `allowed_roles[]` OR the user must be explicitly
 *      listed in `allowed_user_ids[]`.
 *   3. Team chat (`entity_type = 'chat_message'`) never federates with
 *      client communications. It is only returned when the caller
 *      explicitly opts in via `includeTeamChat`. This is enforced by
 *      excluding it from the default query at the parser level AND
 *      here as a second line of defence.
 *   4. Admin-only entity types (`audit_log_entry`, `workflow`,
 *      `document_template`) are excluded unless the caller has the
 *      `admin` role in their effective role set.
 */

import { sql, type SQL } from "drizzle-orm";

export type Principal = {
  userId: string;
  organizationId: string;
  /**
   * Effective role set for the search. Multiple roles OR together for
   * visibility purposes. "admin" is treated as a superset that grants
   * visibility to admin-only entity types.
   */
  roles: string[];
};

/**
 * Returns a Drizzle `SQL` fragment you can pass to `.where(sql\`...\`)`.
 * The caller is responsible for ANDing it with any other constraints.
 */
export function buildAccessFilter(
  principal: Principal,
  opts: { includeTeamChat?: boolean } = {},
): SQL {
  const { organizationId, userId, roles } = principal;
  const includeTeamChat = opts.includeTeamChat === true;
  const isAdmin = roles.includes("admin");

  // Admin-only entity types — hidden from everyone but admins.
  const adminOnly = sql`entity_type NOT IN ('audit_log_entry', 'workflow', 'document_template')`;

  // Team chat is excluded by default. Even if the caller has the role,
  // they must opt in explicitly so a regular "Martinez" search never
  // leaks an internal chat message that mentions the client.
  const chatExclusion = includeTeamChat
    ? sql`TRUE`
    : sql`entity_type <> 'chat_message'`;

  // Role / ACL membership.
  const roleOrAcl = sql`(
    allowed_roles && ${sql.raw(`ARRAY[${roles.map((r) => `'${r.replace(/'/g, "''")}'`).join(",")}]::text[]`)}
    OR ${userId}::uuid = ANY(allowed_user_ids)
  )`;

  return sql`
    organization_id = ${organizationId}::uuid
    AND deleted_at IS NULL
    AND ${roleOrAcl}
    AND ${isAdmin ? sql`TRUE` : adminOnly}
    AND ${chatExclusion}
  `;
}

/**
 * Convenience: derive the effective principal from a Clerk / session
 * user. The session user in this app currently exposes a single `role`
 * string; this helper normalizes it into the `roles[]` shape the
 * access filter expects and layers in common aliases (e.g. an admin
 * also counts as an attorney for visibility purposes).
 */
export function principalFromSession(session: {
  id: string;
  organizationId: string;
  role?: string | null;
}): Principal {
  const roles = new Set<string>();
  const role = (session.role ?? "viewer").toLowerCase();
  roles.add(role);
  // Admins inherit visibility to everything non-admin roles can see.
  if (role === "admin") {
    for (const r of [
      "attorney",
      "case_manager",
      "intake_agent",
      "intake",
      "medical_records",
      "filing",
      "phi_sheet_writer",
      "reviewer",
      "billing_owner",
    ]) {
      roles.add(r);
    }
  }
  // Attorneys can see everything case_managers and below can see.
  if (role === "attorney") {
    roles.add("case_manager");
    roles.add("reviewer");
  }
  return {
    userId: session.id,
    organizationId: session.organizationId,
    roles: Array.from(roles),
  };
}
