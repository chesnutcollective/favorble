import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { contacts, caseContacts, cases, caseStages } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";

async function getContact(contactId: string, organizationId: string) {
  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.organizationId, organizationId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getContactCases(contactId: string) {
  return db
    .select({
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      status: cases.status,
      stageName: caseStages.name,
      relationship: caseContacts.relationship,
      isPrimary: caseContacts.isPrimary,
      updatedAt: cases.updatedAt,
    })
    .from(caseContacts)
    .innerJoin(cases, eq(caseContacts.caseId, cases.id))
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .where(eq(caseContacts.contactId, contactId))
    .limit(50);
}

function formatType(t: string) {
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: contactId } = await params;
  const user = await requireSession();

  let contact: Awaited<ReturnType<typeof getContact>> | null = null;
  let linkedCases: Awaited<ReturnType<typeof getContactCases>> = [];

  try {
    [contact, linkedCases] = await Promise.all([
      getContact(contactId, user.organizationId),
      getContactCases(contactId),
    ]);
  } catch {
    // DB unavailable
  }

  if (!contact) notFound();

  const fullName = `${contact.firstName} ${contact.lastName}`;
  const initials = `${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader title={fullName} description={formatType(contact.contactType)} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Info Card */}
        <div className="lg:col-span-1">
          <div className="rounded-md border border-[#EAEAEA] bg-white p-5">
            <div className="flex items-center gap-4 mb-5 pb-5 border-b border-[#EAEAEA]">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
                style={{ backgroundColor: "#1C1C1E" }}
              >
                {initials}
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-[#171717]">{fullName}</h2>
                <p className="text-[12px] text-[#999]">{formatType(contact.contactType)}</p>
              </div>
            </div>

            <div className="space-y-4">
              {contact.email && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">Email</p>
                  <a href={`mailto:${contact.email}`} className="text-[13px] text-[#171717] hover:underline">
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.phone && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">Phone</p>
                  <a href={`tel:${contact.phone}`} className="text-[13px] text-[#171717] hover:underline">
                    {contact.phone}
                  </a>
                </div>
              )}
              {(contact.address || contact.city || contact.state) && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">Address</p>
                  <p className="text-[13px] text-[#171717]">
                    {[contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(", ")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">Created</p>
                <p className="text-[12px] font-mono text-[#666]">
                  {contact.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Linked Cases */}
        <div className="lg:col-span-2">
          <div className="rounded-md border border-[#EAEAEA] bg-white p-5">
            <h3 className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#666] mb-4">
              Associated Cases ({linkedCases.length})
            </h3>

            {linkedCases.length === 0 ? (
              <p className="text-[13px] text-[#999] py-8 text-center">
                No cases associated with this contact.
              </p>
            ) : (
              <div className="divide-y divide-[#EAEAEA]">
                {linkedCases.map((c) => (
                  <Link
                    key={c.caseId}
                    href={`/cases/${c.caseId}`}
                    className="flex items-center justify-between py-3 px-1 hover:bg-[#FAFAFA] transition-colors duration-200 rounded-md"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-mono text-[#999]">{c.caseNumber}</span>
                      <span className="text-[13px] text-[#171717]">
                        {c.stageName ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[#999] border border-[#EAEAEA] rounded px-1.5 py-0.5">
                        {formatType(c.relationship)}
                      </span>
                      <span className="text-[11px] font-mono text-[#999]">
                        {c.updatedAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? ""}
                      </span>
                      <span className="text-[#CCC]">&rsaquo;</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
