// Wave 1 — Activate LangExtract pipeline against all seeded medical documents.
// Creates document_processing_results + medical_chronology_entries for each.
// Skips documents that already have completed processing results.

import postgres from "postgres";

const sql = postgres(
	"postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway",
);
const LANGEXTRACT_URL = "https://langextract-worker-staging.up.railway.app";

// Realistic mock document text by file name pattern. Used because the
// actual seeded documents only have file names, not content.
function simulatedTextFor(fileName: string): string {
	const lower = fileName.toLowerCase();

	if (lower.includes("mri")) {
		return `MRI Lumbar Spine Report. Patient examined by Dr. Marcus Reed, Radiologist, on ${randomDate(2025)}. Findings: Severe disc herniation at L4-L5 with significant nerve root impingement (M51.16). Mild facet arthropathy noted at L3-L4. Recommended surgical consultation. Continue current pain management with naproxen 500mg BID and gabapentin 300mg TID. Physical therapy 3x weekly recommended.`;
	}
	if (lower.includes("psych")) {
		return `Psychiatric Evaluation Report. Patient assessed by Dr. Sarah Goldstein, MD, Board Certified Psychiatrist, on ${randomDate(2025)}. Presenting complaints: persistent depressed mood, anhedonia, sleep disturbance, fatigue. Diagnosis: Major depressive disorder, recurrent, severe (F33.2). Generalized anxiety disorder (F41.1). Treatment plan: sertraline 100mg daily, weekly cognitive behavioral therapy with Dr. Lin. Patient instructed on medication compliance. GAF score: 45. Follow-up in 4 weeks.`;
	}
	if (lower.includes("consult")) {
		return `Specialist Consultation Notes. Patient seen by Dr. Jennifer Park, Rheumatologist, on ${randomDate(2025)}. Chief complaint: bilateral hand pain, morning stiffness lasting 2+ hours. Examination reveals synovial swelling in MCP and PIP joints bilaterally. Lab results: RF positive, anti-CCP positive, ESR elevated (45). Diagnosis: Rheumatoid arthritis, seropositive (M05.79). Started on methotrexate 15mg weekly with folic acid 1mg daily. Prednisone 10mg daily for 30 days. Follow-up in 6 weeks.`;
	}
	if (lower.includes("lab")) {
		return `Laboratory Results Report. Patient: results reviewed by Dr. Emily Chen on ${randomDate(2025)}. Comprehensive metabolic panel: glucose 142 (H), creatinine 1.4 (H), GFR 52 (L). HbA1c: 8.2% (poor diabetic control). Lipid panel: total cholesterol 245 (H), LDL 168 (H), triglycerides 220 (H). Diagnosis: Type 2 diabetes mellitus uncontrolled (E11.65), Hyperlipidemia (E78.5), Chronic kidney disease stage 3a (N18.31). Recommended: increase metformin to 1000mg BID, add atorvastatin 40mg daily, dietary consultation, follow-up in 3 months.`;
	}
	if (lower.includes("medical_records") || lower.includes("medical-records")) {
		return `Primary Care Visit Notes. Patient seen by Dr. Amelia Chen, MD, on ${randomDate(2025)} for follow-up of multiple chronic conditions. Active diagnoses: Chronic lumbar radiculopathy (M54.16), Hypertension stage 2 (I10), Type 2 diabetes mellitus (E11.9), Major depressive disorder (F32.1). Current medications: gabapentin 300mg TID, lisinopril 20mg daily, metformin 500mg BID, sertraline 50mg daily. Patient reports increased back pain limiting ability to sit or stand longer than 20 minutes. Referred to physical therapy 2x weekly and pain management consultation.`;
	}
	if (lower.includes("hearing") || lower.includes("disability") || lower.includes("ssa")) {
		return `Disability Examination Report. Claimant evaluated by Dr. Robert Kim, MD, Independent Medical Examiner, on ${randomDate(2025)}. Functional capacity assessment: claimant can sit for 30 minutes, stand for 15 minutes, lift 10 pounds occasionally. Cannot perform sustained work activity at any exertional level. Diagnoses contributing to disability: Chronic pain syndrome (G89.4), Major depressive disorder severe recurrent (F33.2), Lumbar disc disease (M51.36). Opinion: claimant meets criteria for total disability based on combination of impairments.`;
	}
	// Generic fallback
	return `Medical record reviewed by Dr. James Morrison, MD, on ${randomDate(2025)}. Patient with chronic conditions requiring ongoing management. Diagnoses include osteoarthritis (M19.90) and hypertension (I10). Current medications: ibuprofen 400mg PRN, hydrochlorothiazide 25mg daily. Continue current regimen with follow-up in 3 months.`;
}

function randomDate(year: number): string {
	const month = Math.floor(Math.random() * 12) + 1;
	const day = Math.floor(Math.random() * 28) + 1;
	return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
}

async function main() {
	console.log("Wave 1: Seeding chronology from LangExtract\n");

	// Get all medical-ish documents that haven't been processed yet
	const docs = await sql<
		Array<{
			id: string;
			file_name: string;
			organization_id: string;
			case_id: string;
		}>
	>`
		SELECT d.id, d.file_name, d.organization_id, d.case_id
		FROM documents d
		LEFT JOIN document_processing_results dpr
			ON dpr.document_id = d.id AND dpr.status = 'completed'
		WHERE dpr.id IS NULL
			AND (
				d.file_name ILIKE '%medical%' OR
				d.file_name ILIKE '%MRI%' OR
				d.file_name ILIKE '%psych%' OR
				d.file_name ILIKE '%consult%' OR
				d.file_name ILIKE '%lab%' OR
				d.file_name ILIKE '%report%' OR
				d.file_name ILIKE '%examination%' OR
				d.file_name ILIKE '%treatment%' OR
				d.file_name ILIKE '%hearing%' OR
				d.file_name ILIKE '%disability%' OR
				d.file_name ILIKE '%ssa%'
			)
		LIMIT 30
	`;

	console.log(`Found ${docs.length} unprocessed medical documents\n`);

	let success = 0;
	let failed = 0;
	let chronCreated = 0;

	for (const doc of docs) {
		const text = simulatedTextFor(doc.file_name);
		console.log(`→ ${doc.file_name}`);

		// Insert pending row
		const [proc] = await sql<Array<{ id: string }>>`
			INSERT INTO document_processing_results
				(organization_id, document_id, case_id, status)
			VALUES
				(${doc.organization_id}, ${doc.id}, ${doc.case_id}, 'extracting')
			RETURNING id
		`;

		const startTime = Date.now();

		// Retry up to 3 times on 502/503 (Gemini temporary overload)
		let response: Response | null = null;
		let lastErr: string | null = null;
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				response = await fetch(
					`${LANGEXTRACT_URL}/extract/medical-record`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ document_text: text }),
					},
				);
				if (response.ok) break;
				if (response.status === 502 || response.status === 503 || response.status === 429) {
					await new Promise((r) => setTimeout(r, 2000 * attempt));
					continue;
				}
				break;
			} catch (e: any) {
				lastErr = e.message;
				await new Promise((r) => setTimeout(r, 2000 * attempt));
			}
		}

		try {
			if (!response || !response.ok) {
				console.log(`  ✗ ${lastErr || `HTTP ${response?.status}`}`);
				await sql`
					UPDATE document_processing_results
					SET status = 'failed',
						error_message = ${lastErr || `HTTP ${response?.status ?? "unknown"}`},
						processing_time_ms = ${Date.now() - startTime},
						updated_at = now()
					WHERE id = ${proc.id}
				`;
				failed++;
				continue;
			}

			const result = (await response.json()) as {
				model: string;
				mock: boolean;
				elapsed_ms: number;
				extractions: Array<{
					extraction_class: string;
					extraction_text: string;
					attributes?: Record<string, unknown> | null;
				}>;
			};

			const extractions = result.extractions || [];
			console.log(`  ✓ ${extractions.length} fields in ${result.elapsed_ms}ms`);

			const provider = extractions.find((e) => e.extraction_class === "provider");
			const encounter = extractions.find(
				(e) => e.extraction_class === "encounter_date",
			);
			const diagnoses = extractions
				.filter((e) => e.extraction_class === "diagnosis")
				.map((e) => e.extraction_text);
			const meds = extractions
				.filter((e) => e.extraction_class === "medication")
				.map((e) => e.extraction_text);
			const treatments = extractions
				.filter((e) => e.extraction_class === "treatment")
				.map((e) => e.extraction_text);

			await sql`
				UPDATE document_processing_results
				SET status = 'completed',
					extracted_text = ${text.slice(0, 50000)},
					document_category = 'medical_record',
					provider_name = ${provider?.extraction_text || null},
					ai_classification = ${sql.json({ model: result.model, mock: result.mock, extractions } as any)},
					ai_confidence = 80,
					processing_time_ms = ${Date.now() - startTime},
					updated_at = now()
				WHERE id = ${proc.id}
			`;

			if (provider || encounter || diagnoses.length > 0) {
				const summary = [
					provider ? `Visit with ${provider.extraction_text}` : null,
					encounter ? `on ${encounter.extraction_text}` : null,
					diagnoses.length > 0 ? `for ${diagnoses[0]}` : null,
				]
					.filter(Boolean)
					.join(" ");

				await sql`
					INSERT INTO medical_chronology_entries (
						organization_id, case_id, source_document_id, entry_type,
						event_date, provider_name, summary, details,
						diagnoses, medications, treatments,
						ai_generated, is_verified
					) VALUES (
						${doc.organization_id}, ${doc.case_id}, ${doc.id}, 'office_visit',
						${encounter?.extraction_text ? new Date(encounter.extraction_text) : null},
						${provider?.extraction_text || null},
						${summary || "Medical record processed"},
						${extractions.map((e) => `${e.extraction_class}: ${e.extraction_text}`).join("\n")},
						${diagnoses.length > 0 ? diagnoses : null},
						${meds.length > 0 ? meds : null},
						${treatments.length > 0 ? treatments : null},
						true, false
					)
				`;
				chronCreated++;
				console.log(`  ✓ chronology: ${summary}`);
			}
			success++;
		} catch (err: any) {
			console.log(`  ✗ ${err.message}`);
			await sql`
				UPDATE document_processing_results
				SET status = 'failed',
					error_message = ${err.message},
					processing_time_ms = ${Date.now() - startTime},
					updated_at = now()
				WHERE id = ${proc.id}
			`;
			failed++;
		}

		// Pause longer between calls to avoid Gemini overload (502s)
		await new Promise((r) => setTimeout(r, 1500));
	}

	const totalChron =
		await sql`SELECT count(*)::int as n FROM medical_chronology_entries`;
	const totalProc =
		await sql`SELECT count(*)::int as n FROM document_processing_results`;

	console.log(`\n=== Summary ===`);
	console.log(`Processed: ${success} success, ${failed} failed`);
	console.log(`New chronology entries: ${chronCreated}`);
	console.log(`Total chronology entries: ${totalChron[0].n}`);
	console.log(`Total processing results: ${totalProc[0].n}`);

	await sql.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
