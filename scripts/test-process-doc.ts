// Quick end-to-end test of the document processing pipeline.
// Bypasses the API route and calls the service directly so we can run it
// from the CLI without needing auth.

process.env.DATABASE_URL =
	"postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway";
process.env.LANGEXTRACT_URL =
	"https://langextract-worker-staging.up.railway.app";

import { db } from "@/db/drizzle";
import { documents, medicalChronologyEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processDocument } from "@/lib/services/document-processor";

async function main() {
	// Pick the first medical record document
	const [doc] = await db
		.select({
			id: documents.id,
			fileName: documents.fileName,
			organizationId: documents.organizationId,
			caseId: documents.caseId,
		})
		.from(documents)
		.where(eq(documents.fileName, "Medical_Records_Primary_Care_20261001.pdf"))
		.limit(1);

	if (!doc) {
		console.error("No test document found");
		process.exit(1);
	}

	console.log(`Processing document: ${doc.fileName} (${doc.id})`);

	const result = await processDocument({
		documentId: doc.id,
		organizationId: doc.organizationId,
		extractionType: "medical_record",
	});

	console.log("Result:", JSON.stringify(result, null, 2));

	// Show any chronology entry created
	const entries = await db
		.select()
		.from(medicalChronologyEntries)
		.where(eq(medicalChronologyEntries.sourceDocumentId, doc.id));

	console.log(`\nChronology entries created: ${entries.length}`);
	for (const e of entries) {
		console.log(`  - ${e.summary}`);
		if (e.diagnoses) console.log(`    Diagnoses: ${e.diagnoses.join(", ")}`);
		if (e.medications)
			console.log(`    Medications: ${e.medications.join(", ")}`);
		if (e.providerName) console.log(`    Provider: ${e.providerName}`);
	}

	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
