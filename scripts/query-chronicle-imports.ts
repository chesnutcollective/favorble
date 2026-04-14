import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL as string);

  const rows = await sql<
    Array<{
      case_number: string;
      chronicle_claimant_id: string;
      chronicle_url: string;
      application_type_primary: string | null;
      application_type_secondary: string | null;
      hearing_office: string | null;
      admin_law_judge: string | null;
      hearing_date: Date | null;
      first_name: string;
      last_name: string;
      source: string | null;
      doc_count: number;
      real_pdf_count: number;
      stage_name: string | null;
    }>
  >`
    SELECT
      c.case_number,
      c.chronicle_claimant_id,
      c.chronicle_url,
      c.application_type_primary,
      c.application_type_secondary,
      c.hearing_office,
      c.admin_law_judge,
      c.hearing_date,
      l.first_name,
      l.last_name,
      l.source,
      (SELECT COUNT(*)::int FROM documents d WHERE d.case_id = c.id) as doc_count,
      (SELECT COUNT(*)::int FROM documents d WHERE d.case_id = c.id AND d.storage_path LIKE 'railway://%') as real_pdf_count,
      (SELECT name FROM case_stages s WHERE s.id = c.current_stage_id) as stage_name
    FROM cases c
    LEFT JOIN leads l ON l.id = c.lead_id
    WHERE c.chronicle_claimant_id IS NOT NULL
    ORDER BY c.case_number
  `;

  console.log(`\n=== Chronicle-imported cases (${rows.length}) ===\n`);
  for (const r of rows) {
    console.log(`${r.case_number}  ${r.first_name} ${r.last_name}`);
    console.log(`  chronicle_id: ${r.chronicle_claimant_id}`);
    console.log(`  stage: ${r.stage_name}`);
    console.log(
      `  app_type: ${r.application_type_primary ?? "—"}${r.application_type_secondary ? ` + ${r.application_type_secondary}` : ""}`,
    );
    if (r.hearing_office) console.log(`  hearing office: ${r.hearing_office}`);
    if (r.admin_law_judge) console.log(`  ALJ: ${r.admin_law_judge}`);
    if (r.hearing_date)
      console.log(`  hearing: ${r.hearing_date.toISOString().split("T")[0]}`);
    console.log(
      `  documents: ${r.doc_count} (${r.real_pdf_count} with real PDFs uploaded)`,
    );
    console.log();
  }

  // Summary of documents source counts
  const srcRows = await sql<Array<{ source: string | null; n: number }>>`
    SELECT source, COUNT(*)::int as n
    FROM documents
    GROUP BY source
    ORDER BY n DESC
  `;
  console.log("=== Documents by source ===");
  for (const r of srcRows) {
    console.log(`  ${r.source ?? "(null)"}: ${r.n}`);
  }

  // Show a few example Chronicle documents
  const docRows = await sql<
    Array<{
      case_number: string;
      file_name: string;
      category: string | null;
      description: string | null;
      storage_path: string;
    }>
  >`
    SELECT
      c.case_number,
      d.file_name,
      d.category,
      d.description,
      d.storage_path
    FROM documents d
    JOIN cases c ON c.id = d.case_id
    WHERE d.source = 'chronicle'
    ORDER BY c.case_number, d.file_name
    LIMIT 20
  `;
  console.log("\n=== First 20 Chronicle documents ===");
  for (const r of docRows) {
    const real = r.storage_path.startsWith("railway://")
      ? "[real PDF]"
      : "[metadata only]";
    console.log(`  ${r.case_number}  ${r.file_name}  ${real}`);
    if (r.category) console.log(`    category: ${r.category}`);
    if (r.description) console.log(`    description: ${r.description}`);
  }

  // Check extraction status
  const extractionRows = await sql<
    Array<{
      kind: string;
      total: number;
      processed: number;
      completed: number;
      failed: number;
    }>
  >`
    SELECT
      CASE WHEN storage_path LIKE 'railway://%' THEN 'real' ELSE 'stub' END AS kind,
      COUNT(*)::int AS total,
      COUNT(dpr.id)::int AS processed,
      COUNT(*) FILTER (WHERE dpr.status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE dpr.status = 'failed')::int AS failed
    FROM documents d
    LEFT JOIN document_processing_results dpr ON dpr.document_id = d.id
    WHERE d.source = 'chronicle'
    GROUP BY 1
  `;
  console.log("\n=== Chronicle docs extraction status ===");
  for (const r of extractionRows) {
    console.log(
      `  ${r.kind}: ${r.total} total, ${r.processed} processed (${r.completed} completed, ${r.failed} failed)`,
    );
  }

  // Show a few processed results
  const resultRows = await sql<
    Array<{
      file_name: string;
      status: string;
      document_category: string | null;
      provider_name: string | null;
      has_text: boolean;
    }>
  >`
    SELECT
      d.file_name,
      dpr.status,
      dpr.document_category,
      dpr.provider_name,
      (dpr.extracted_text IS NOT NULL AND length(dpr.extracted_text) > 0) AS has_text
    FROM documents d
    JOIN document_processing_results dpr ON dpr.document_id = d.id
    WHERE d.source = 'chronicle'
    ORDER BY dpr.created_at DESC
    LIMIT 10
  `;
  console.log("\n=== Recent processing results (chronicle docs) ===");
  for (const r of resultRows) {
    console.log(
      `  [${r.status}] ${r.file_name.slice(0, 60)}  cat=${r.document_category ?? "—"}  provider=${r.provider_name ?? "—"}  text=${r.has_text}`,
    );
  }
  if (resultRows.length === 0) {
    console.log("  (none — no Chronicle docs have been processed yet)");
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
