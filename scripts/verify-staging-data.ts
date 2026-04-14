import postgres from "postgres";

const sql = postgres(
  process.env.DATABASE_URL ||
    "postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
  { connect_timeout: 10 },
);

async function main() {
  const tables = [
    "organizations",
    "users",
    "cases",
    "contacts",
    "tasks",
    "leads",
    "communications",
    "documents",
    "calendar_events",
    "audit_log",
  ];
  for (const t of tables) {
    const r = await sql.unsafe(`SELECT count(*) FROM ${t}`);
    console.log(`${t.padEnd(20)} ${r[0].count}`);
  }
  await sql.end();
}

main();
