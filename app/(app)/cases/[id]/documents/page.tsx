import { requireSession } from "@/lib/auth/session";
import { getCaseDocuments, getDocumentTemplates } from "@/app/actions/documents";
import { getCaseById } from "@/app/actions/cases";
import { CaseDocumentsClient } from "./client";

export default async function CaseDocumentsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: caseId } = await params;
	const user = await requireSession();

	let docs: Awaited<ReturnType<typeof getCaseDocuments>> = [];
	let templates: Awaited<ReturnType<typeof getDocumentTemplates>> = [];
	let caseData: Awaited<ReturnType<typeof getCaseById>> = null;

	try {
		[docs, templates, caseData] = await Promise.all([
			getCaseDocuments(caseId),
			getDocumentTemplates(user.organizationId),
			getCaseById(caseId),
		]);
	} catch {
		// DB unavailable
	}

	const claimantName = caseData?.claimant
		? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
		: "Unknown Claimant";

	return (
		<CaseDocumentsClient
			caseId={caseId}
			organizationId={user.organizationId}
			userId={user.id}
			initialDocuments={docs.map((d) => ({
				id: d.id,
				fileName: d.fileName,
				fileType: d.fileType,
				fileSizeBytes: d.fileSizeBytes,
				category: d.category,
				source: d.source,
				createdAt: d.createdAt.toISOString(),
			}))}
			templates={templates.map((t) => ({
				id: t.id,
				name: t.name,
				description: t.description,
				category: t.category,
				mergeFields: t.mergeFields,
				templateContent: t.templateContent,
			}))}
			caseData={{
				claimantName,
				caseNumber: caseData?.caseNumber ?? "",
				dateOfBirth: caseData?.dateOfBirth?.toLocaleDateString() ?? null,
				ssaClaimNumber: caseData?.ssaClaimNumber ?? null,
				ssaOffice: caseData?.ssaOffice ?? null,
				allegedOnsetDate: caseData?.allegedOnsetDate?.toLocaleDateString() ?? null,
				hearingOffice: caseData?.hearingOffice ?? null,
				adminLawJudge: caseData?.adminLawJudge ?? null,
			}}
		/>
	);
}
