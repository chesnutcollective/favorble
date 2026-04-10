// Apply a SQL migration file to staging Postgres directly,
// bypassing drizzle-kit's interactive prompts.

import { readFileSync } from "node:fs";
import postgres from "postgres";

const MIGRATION_FILE = process.argv[2];
if (!MIGRATION_FILE) {
	console.error("Usage: tsx apply-migration.ts <path-to-sql>");
	process.exit(1);
}

const sql = postgres(
	"postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
);

async function main() {
	const content = readFileSync(MIGRATION_FILE, "utf-8");
	// Split on the drizzle statement-breakpoint marker
	const statements = content
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	console.log(`Applying ${statements.length} statements from ${MIGRATION_FILE}\n`);

	let applied = 0;
	let skipped = 0;

	for (const stmt of statements) {
		const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
		try {
			await sql.unsafe(stmt);
			console.log(`✓ ${preview}`);
			applied++;
		} catch (err: any) {
			// Skip "already exists" errors so the migration is idempotent
			if (
				err.code === "42P07" || // duplicate_table
				err.code === "42710" || // duplicate_object (enum, etc.)
				err.code === "42701" || // duplicate_column
				err.code === "42P06" || // duplicate_schema
				err.code === "42P16" || // duplicate index
				err.code === "23505"    // unique violation
			) {
				console.log(`↺ ${preview}  [already exists, skipped]`);
				skipped++;
			} else {
				console.error(`✗ ${preview}`);
				console.error(`  ${err.message}`);
				await sql.end();
				process.exit(1);
			}
		}
	}

	console.log(`\nDone. Applied: ${applied}, Skipped: ${skipped}`);
	await sql.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
