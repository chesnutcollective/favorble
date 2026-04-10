import postgres from "postgres";

const sql = postgres(
	"postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
);

async function main() {
	const docs = await sql`
    SELECT id, file_name, organization_id, case_id, storage_path
    FROM documents
    WHERE source = 'ere' OR source = 'upload'
    LIMIT 3
  `;
	console.log("Sample documents:");
	for (const d of docs) {
		console.log(`  ${d.id} | ${d.file_name}`);
	}

	// Check chronology entries
	const chronCount = await sql`SELECT count(*) FROM medical_chronology_entries`;
	const procCount = await sql`SELECT count(*) FROM document_processing_results`;
	console.log(`\nChronology entries: ${chronCount[0].count}`);
	console.log(`Processing results: ${procCount[0].count}`);

	await sql.end();
}

main();
