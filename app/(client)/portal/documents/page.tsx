import { cookies } from "next/headers";
import { FileText } from "lucide-react";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { listActiveSharesForContact } from "@/lib/services/portal-document-shares";
import { PORTAL_IMPERSONATE_COOKIE } from "../../layout";
import {
  DocShareCard,
  type DocShareCardItem,
} from "@/components/portal/doc-share-card";
import { PortalUploadForm } from "./upload-form";

/**
 * /portal/documents — lists every document the firm has actively shared with
 * this claimant, plus a simple "Uploads from you" section at the top so the
 * claimant can send medical records / ID docs back the other way.
 *
 * Impersonating staff see the list but the DocShareCard disables its download
 * anchor (read-only preview).
 */
export default async function PortalDocumentsPage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  await logPortalActivity("view_document_list");

  const shares = await listActiveSharesForContact(session.contact.id);
  const cardItems: DocShareCardItem[] = shares.map((s) => ({
    shareId: s.shareId,
    fileName: s.fileName,
    fileType: s.fileType,
    fileSizeBytes: s.fileSizeBytes,
    sharedByName: s.sharedByName,
    sharedAt: s.sharedAt,
    expiresAt: s.expiresAt,
    canDownload: s.canDownload,
    isMetadataOnly: s.isMetadataOnly,
  }));

  const primaryCase = session.cases[0] ?? null;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-[24px]">
          Documents
        </h1>
        <p className="mt-1 text-[15px] text-foreground/70">
          Files your team has shared with you, plus anything you&apos;ve sent
          back to them.
        </p>
      </header>

      {/* Uploads from you — client-facing upload surface. */}
      <section
        aria-labelledby="uploads-from-you-heading"
        className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]"
      >
        <h2
          id="uploads-from-you-heading"
          className="text-[14px] font-semibold uppercase tracking-wide text-foreground/70"
        >
          Uploads from you
        </h2>
        <p className="mt-1 text-[14px] text-foreground/70">
          Send medical records, ID documents, or anything else your team
          requested. Your attorney will be notified when you upload.
        </p>
        <div className="mt-4">
          <PortalUploadForm
            caseId={primaryCase?.id ?? null}
            organizationId={session.portalUser.organizationId}
          />
        </div>
      </section>

      {/* Shared with you — downloads. */}
      <section aria-labelledby="shared-with-you-heading" className="space-y-3">
        <h2
          id="shared-with-you-heading"
          className="px-1 text-[14px] font-semibold uppercase tracking-wide text-foreground/70"
        >
          Shared with you
        </h2>

        {cardItems.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-[#104e60]/10 text-[#104e60]">
              <FileText className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-[15px] font-medium text-foreground">
              No documents shared yet.
            </p>
            <p className="mt-1 text-[14px] text-foreground/70">
              When your team shares a file with you it will show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {cardItems.map((item) => (
              <li key={item.shareId}>
                <DocShareCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
