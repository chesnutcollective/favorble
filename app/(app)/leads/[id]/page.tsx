import { notFound } from "next/navigation";
import {
  getLeadById,
  getIntakeFormFields,
  getLeadSignatureRequests,
} from "@/app/actions/leads";
import { getAllStages } from "@/app/actions/stages";
import { LeadDetailClient } from "./client";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let lead: Awaited<ReturnType<typeof getLeadById>> | null = null;
  let stages: Awaited<ReturnType<typeof getAllStages>> = [];
  let intakeFields: Awaited<ReturnType<typeof getIntakeFormFields>> = [];
  let signatureRequests: Awaited<ReturnType<typeof getLeadSignatureRequests>> =
    [];

  try {
    [lead, stages, intakeFields, signatureRequests] = await Promise.all([
      getLeadById(id),
      getAllStages(),
      getIntakeFormFields(),
      getLeadSignatureRequests(id),
    ]);
  } catch {
    // DB unavailable
  }

  if (!lead) {
    notFound();
  }

  return (
    <LeadDetailClient
      lead={{
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        notes: lead.notes,
        assignedToId: lead.assignedToId,
        convertedToCaseId: lead.convertedToCaseId,
        convertedAt: lead.convertedAt?.toISOString() ?? null,
        intakeData: lead.intakeData as Record<string, unknown> | null,
        lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
      }}
      stages={stages}
      intakeFields={intakeFields.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        placeholder: f.placeholder,
        helpText: f.helpText,
        options: f.options as { label: string; value: string }[] | null,
        intakeFormScript: f.intakeFormScript,
      }))}
      signatureRequests={signatureRequests.map((sr) => ({
        id: sr.id,
        signerEmail: sr.signerEmail,
        signerName: sr.signerName,
        contractType: sr.contractType,
        status: sr.status,
        sentAt: sr.sentAt?.toISOString() ?? null,
        signedAt: sr.signedAt?.toISOString() ?? null,
        createdAt: sr.createdAt.toISOString(),
      }))}
    />
  );
}
