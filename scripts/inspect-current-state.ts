// Inspect current data to understand what we're working with
import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
);

async function main() {
  console.log("=== organizations ===");
  const orgs = await sql`SELECT id, name FROM organizations`;
  console.log(orgs);

  console.log("\n=== users ===");
  const users =
    await sql`SELECT id, email, first_name, last_name, role FROM users`;
  console.log(users);

  console.log("\n=== cases (sample 5) ===");
  const cases = await sql`
		SELECT id, case_number, organization_id, status, ssa_claim_number, hearing_office, admin_law_judge, hearing_date, phi_sheet_status
		FROM cases
		LIMIT 5
	`;
  console.log(cases);

  console.log("\n=== cases with hearing_date count ===");
  const hdc =
    await sql`SELECT COUNT(*) FROM cases WHERE hearing_date IS NOT NULL`;
  console.log(hdc);

  console.log("\n=== cases with ssa_claim_number count ===");
  const ssnc =
    await sql`SELECT COUNT(*) FROM cases WHERE ssa_claim_number IS NOT NULL`;
  console.log(ssnc);

  console.log("\n=== calendar_events (by type) ===");
  const ce =
    await sql`SELECT event_type, COUNT(*) FROM calendar_events GROUP BY event_type`;
  console.log(ce);

  console.log("\n=== leads (sample with pipeline) ===");
  const leads = await sql`
		SELECT id, first_name, last_name, status, pipeline_stage, pipeline_stage_group, pipeline_stage_order
		FROM leads
		LIMIT 20
	`;
  console.log(leads);

  console.log("\n=== case_assignments per case (distribution) ===");
  const ca = await sql`
		SELECT COUNT(*) AS total_assignments, COUNT(DISTINCT case_id) AS distinct_cases
		FROM case_assignments
	`;
  console.log(ca);

  console.log("\n=== audit_log distinct entity_types ===");
  const al =
    await sql`SELECT entity_type, COUNT(*) FROM audit_log GROUP BY entity_type`;
  console.log(al);

  console.log("\n=== documents tag distribution ===");
  const docs =
    await sql`SELECT tags, COUNT(*) FROM documents GROUP BY tags LIMIT 10`;
  console.log(docs);

  console.log("\n=== contacts sample ===");
  const contacts =
    await sql`SELECT id, type, first_name, last_name, organization_name FROM contacts LIMIT 5`;
  console.log(contacts);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
