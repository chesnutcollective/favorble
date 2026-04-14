import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { cases, leads } from "@/db/schema";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Board Packet PDF",
};

export const dynamic = "force-dynamic";

/**
 * Reviewer landing page for board-packet PDF export. The reviewer subnav
 * doesn't carry a caseId, so this page lists recent open cases and provides
 * a direct link to the generating API route.
 */
export default async function BoardPacketPickerPage() {
  const session = await requireSession();

  const rows = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      status: cases.status,
      hearingDate: cases.hearingDate,
      claimantFirstName: leads.firstName,
      claimantLastName: leads.lastName,
    })
    .from(cases)
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .where(eq(cases.organizationId, session.organizationId))
    .orderBy(desc(cases.updatedAt))
    .limit(50);

  // Exclude terminal statuses from the picker — reviewers usually want to
  // export active or on-hold matters. Leaving closed cases off keeps the
  // short 50-row list focused on likely export candidates.
  const openCases = rows.filter(
    (r) => r.status === "active" || r.status === "on_hold",
  );

  return (
    <div className="flex flex-col gap-6 px-6 py-6 max-w-5xl mx-auto">
      <PageHeader
        title="Board Packet PDF"
        description="Pick a case to export a one-page executive summary, medical chronology, and key documents index as a PDF."
      />

      {openCases.length === 0 ? (
        <div className="text-sm text-[#666]">
          No open cases found in your organization.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-[#e6e7ea]">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f7f8fa] text-[11px] uppercase tracking-wider text-[#666]">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Case #</th>
                <th className="px-4 py-2 text-left font-semibold">Claimant</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-left font-semibold">Hearing</th>
                <th className="px-4 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {openCases.map((c) => {
                const claimant =
                  [c.claimantFirstName, c.claimantLastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "—";
                return (
                  <tr key={c.id} className="border-t border-[#e6e7ea]">
                    <td className="px-4 py-2 font-mono text-[12px]">
                      {c.caseNumber}
                    </td>
                    <td className="px-4 py-2">{claimant}</td>
                    <td className="px-4 py-2 text-[#666]">{c.status}</td>
                    <td className="px-4 py-2 text-[#666]">
                      {c.hearingDate
                        ? new Date(c.hearingDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/api/reviewer/board-packet/${c.id}/pdf`}
                        prefetch={false}
                        className="text-[#263c94] hover:underline"
                      >
                        Download PDF
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
