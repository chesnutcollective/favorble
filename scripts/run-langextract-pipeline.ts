// Direct end-to-end test: pulls documents from staging DB,
// sends them to LangExtract, writes results back. Bypasses server-only.

import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
);
const LANGEXTRACT_URL = "https://langextract-worker-staging.up.railway.app";

async function main() {
  // Pick the first 3 medical record documents
  const docs = await sql<
    Array<{
      id: string;
      file_name: string;
      organization_id: string;
      case_id: string;
    }>
  >`
    SELECT id, file_name, organization_id, case_id
    FROM documents
    WHERE file_name ILIKE '%Medical%' OR file_name ILIKE '%MRI%' OR file_name ILIKE '%Psychiatric%'
    LIMIT 3
  `;

  console.log(`Processing ${docs.length} documents through LangExtract...`);

  for (const doc of docs) {
    console.log(`\n→ ${doc.file_name}`);

    // Use a realistic medical record text since we don't have the actual file
    const documentText = simulatedTextFor(doc.file_name);

    // Insert processing result row
    const [proc] = await sql<Array<{ id: string }>>`
      INSERT INTO document_processing_results (organization_id, document_id, case_id, status)
      VALUES (${doc.organization_id}, ${doc.id}, ${doc.case_id}, 'extracting')
      RETURNING id
    `;

    const startTime = Date.now();

    try {
      const response = await fetch(
        `${LANGEXTRACT_URL}/extract/medical-record`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_text: documentText }),
        },
      );

      if (!response.ok) {
        console.log(`  ✗ HTTP ${response.status}`);
        await sql`
          UPDATE document_processing_results
          SET status = 'failed', error_message = ${`HTTP ${response.status}`},
              processing_time_ms = ${Date.now() - startTime}, updated_at = now()
          WHERE id = ${proc.id}
        `;
        continue;
      }

      const result = await response.json();
      const extractions = result.extractions || [];
      console.log(
        `  ✓ ${extractions.length} extractions in ${result.elapsed_ms}ms`,
      );

      const provider = extractions.find(
        (e: any) => e.extraction_class === "provider",
      );
      const encounter = extractions.find(
        (e: any) => e.extraction_class === "encounter_date",
      );
      const diagnoses = extractions
        .filter((e: any) => e.extraction_class === "diagnosis")
        .map((e: any) => e.extraction_text);
      const meds = extractions
        .filter((e: any) => e.extraction_class === "medication")
        .map((e: any) => e.extraction_text);
      const treatments = extractions
        .filter((e: any) => e.extraction_class === "treatment")
        .map((e: any) => e.extraction_text);

      // Update processing result
      await sql`
        UPDATE document_processing_results
        SET status = 'completed',
            extracted_text = ${documentText.slice(0, 50000)},
            document_category = 'medical_record',
            provider_name = ${provider?.extraction_text || null},
            ai_classification = ${sql.json({ model: result.model, mock: result.mock, extractions })},
            ai_confidence = 80,
            processing_time_ms = ${Date.now() - startTime},
            updated_at = now()
        WHERE id = ${proc.id}
      `;

      // Create chronology entry if we found anything meaningful
      if (provider || encounter || diagnoses.length > 0) {
        const summary = [
          provider ? `Visit with ${provider.extraction_text}` : null,
          encounter ? `on ${encounter.extraction_text}` : null,
          diagnoses.length > 0 ? `for ${diagnoses.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" ");

        await sql`
          INSERT INTO medical_chronology_entries (
            organization_id, case_id, source_document_id, entry_type,
            event_date, provider_name, summary, details, diagnoses, medications, treatments,
            ai_generated, is_verified
          ) VALUES (
            ${doc.organization_id}, ${doc.case_id}, ${doc.id}, 'office_visit',
            ${encounter?.extraction_text ? new Date(encounter.extraction_text) : null},
            ${provider?.extraction_text || null},
            ${summary || "Medical record processed"},
            ${extractions.map((e: any) => `${e.extraction_class}: ${e.extraction_text}`).join("\n")},
            ${diagnoses.length > 0 ? diagnoses : null},
            ${meds.length > 0 ? meds : null},
            ${treatments.length > 0 ? treatments : null},
            true, false
          )
        `;
        console.log(`  ✓ chronology entry created: ${summary}`);
      }
    } catch (err: any) {
      console.log(`  ✗ ${err.message}`);
      await sql`
        UPDATE document_processing_results
        SET status = 'failed', error_message = ${err.message},
            processing_time_ms = ${Date.now() - startTime}, updated_at = now()
        WHERE id = ${proc.id}
      `;
    }
  }

  const totalChron = await sql`SELECT count(*) FROM medical_chronology_entries`;
  const totalProc = await sql`SELECT count(*) FROM document_processing_results`;
  console.log(`\nTotal chronology entries: ${totalChron[0].count}`);
  console.log(`Total processing results: ${totalProc[0].count}`);

  await sql.end();
}

function simulatedTextFor(fileName: string): string {
  if (fileName.includes("MRI")) {
    return "MRI Lumbar Spine Report. Patient: Jane Doe. Examined by Dr. Marcus Reed, Radiologist, on 10/02/2026. Findings: Severe disc herniation at L4-L5 with nerve root impingement (M51.16). Recommended: Surgical consultation, NSAIDs (naproxen 500mg BID), physical therapy 3x/week.";
  }
  if (fileName.includes("Psychiatric")) {
    return "Psychiatric Evaluation Report. Patient assessed by Dr. Sarah Goldstein, MD, on 10/03/2026. Diagnosis: Major depressive disorder, recurrent, severe (F33.2). Treatment plan: sertraline 100mg daily, weekly cognitive behavioral therapy. GAF score: 45.";
  }
  return "Primary care visit notes. Patient seen by Dr. Amelia Chen, MD, on 10/01/2026 for follow-up of chronic lumbar radiculopathy (M54.16) and hypertension (I10). Continue gabapentin 300mg TID, lisinopril 10mg daily. Refer to physical therapy 2x/week.";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
