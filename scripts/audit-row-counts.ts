// Audit row counts for all public tables
import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
);

async function main() {
  const rows = await sql`
		SELECT relname AS table_name, n_live_tup AS row_count
		FROM pg_stat_user_tables
		WHERE schemaname = 'public'
		ORDER BY n_live_tup ASC, relname ASC
	`;
  console.log("table_name | row_count");
  console.log("---");
  for (const r of rows) {
    console.log(`${r.table_name} | ${r.row_count}`);
  }
  console.log(`\nTotal tables: ${rows.length}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
