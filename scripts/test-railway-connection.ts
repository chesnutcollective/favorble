import postgres from "postgres";

const url =
  process.argv[2] ||
  "postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway";

const sql = postgres(url, {
  connect_timeout: 10,
});

async function main() {
  try {
    const result = await sql`SELECT version()`;
    console.log("SUCCESS:", result[0].version);

    // Enable pgvector
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log("pgvector extension enabled");

    // Check extensions
    const exts = await sql`SELECT extname FROM pg_extension ORDER BY extname`;
    console.log("Extensions:", exts.map((e) => e.extname).join(", "));
  } catch (e: any) {
    console.error("Error:", e.message);
  }
  await sql.end();
}

main();
