// Verify seed results
import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
);

async function main() {
  console.log("=== hearings by event_type ===");
  const ev =
    await sql`SELECT event_type, COUNT(*) FROM calendar_events GROUP BY event_type`;
  console.log(ev);

  console.log("\n=== cases with hearing_date ===");
  const hd =
    await sql`SELECT COUNT(*) FROM cases WHERE hearing_date IS NOT NULL`;
  console.log(hd);

  console.log("\n=== cases with hearing_office set ===");
  const ho =
    await sql`SELECT COUNT(*) FROM cases WHERE hearing_office IS NOT NULL`;
  console.log(ho);

  console.log("\n=== leads by pipeline_stage_group ===");
  const lg = await sql`
		SELECT pipeline_stage_group, COUNT(*)
		FROM leads
		GROUP BY pipeline_stage_group
		ORDER BY pipeline_stage_group
	`;
  console.log(lg);

  console.log("\n=== leads by pipeline_stage (distribution) ===");
  const lst = await sql`
		SELECT pipeline_stage, COUNT(*)
		FROM leads
		WHERE pipeline_stage IS NOT NULL
		GROUP BY pipeline_stage
		ORDER BY COUNT(*) DESC
	`;
  console.log(lst);

  console.log("\n=== outbound_mail by mail_type ===");
  const om =
    await sql`SELECT mail_type, COUNT(*) FROM outbound_mail GROUP BY mail_type`;
  console.log(om);

  console.log("\n=== documents tagged mail ===");
  const dm = await sql`SELECT COUNT(*) FROM documents WHERE 'mail' = ANY(tags)`;
  console.log(dm);

  console.log("\n=== rfc_requests by status ===");
  const rfc =
    await sql`SELECT status, COUNT(*) FROM rfc_requests GROUP BY status`;
  console.log(rfc);

  console.log("\n=== ere_jobs by status ===");
  const ere = await sql`SELECT status, COUNT(*) FROM ere_jobs GROUP BY status`;
  console.log(ere);

  console.log("\n=== audit_log by entity_type ===");
  const al =
    await sql`SELECT entity_type, COUNT(*) FROM audit_log GROUP BY entity_type`;
  console.log(al);

  console.log("\n=== communications by type ===");
  const cm = await sql`SELECT type, COUNT(*) FROM communications GROUP BY type`;
  console.log(cm);

  console.log("\n=== cases by application_type_primary ===");
  const at =
    await sql`SELECT application_type_primary, COUNT(*) FROM cases GROUP BY application_type_primary`;
  console.log(at);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
