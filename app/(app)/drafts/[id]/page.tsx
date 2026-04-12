import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { aiDrafts, cases, users, communications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { DraftReviewerClient } from "./reviewer-client";

export default async function DraftReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const [draft] = await db
    .select({
      id: aiDrafts.id,
      organizationId: aiDrafts.organizationId,
      caseId: aiDrafts.caseId,
      type: aiDrafts.type,
      status: aiDrafts.status,
      title: aiDrafts.title,
      body: aiDrafts.body,
      assignedReviewerId: aiDrafts.assignedReviewerId,
      sourceCommunicationId: aiDrafts.sourceCommunicationId,
      sourceTaskId: aiDrafts.sourceTaskId,
      structuredFields: aiDrafts.structuredFields,
      editDistance: aiDrafts.editDistance,
      createdAt: aiDrafts.createdAt,
      updatedAt: aiDrafts.updatedAt,
      errorMessage: aiDrafts.errorMessage,
      caseNumber: cases.caseNumber,
    })
    .from(aiDrafts)
    .leftJoin(cases, eq(aiDrafts.caseId, cases.id))
    .where(
      and(
        eq(aiDrafts.id, id),
        eq(aiDrafts.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!draft) notFound();

  let reviewerName: string | null = null;
  if (draft.assignedReviewerId) {
    const [u] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, draft.assignedReviewerId))
      .limit(1);
    if (u) reviewerName = `${u.firstName} ${u.lastName}`;
  }

  let sourceMessage: {
    id: string;
    body: string | null;
    fromAddress: string | null;
    createdAt: Date;
    subject: string | null;
  } | null = null;
  if (draft.sourceCommunicationId) {
    const [row] = await db
      .select({
        id: communications.id,
        body: communications.body,
        fromAddress: communications.fromAddress,
        createdAt: communications.createdAt,
        subject: communications.subject,
      })
      .from(communications)
      .where(eq(communications.id, draft.sourceCommunicationId))
      .limit(1);
    sourceMessage = row ?? null;
  }

  const isClientMessage = draft.type === "client_message";
  const canSend =
    isClientMessage &&
    draft.caseId &&
    draft.status !== "sent" &&
    draft.status !== "rejected" &&
    draft.status !== "error";

  return (
    <div className="space-y-4">
      <Link
        href="/drafts"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All drafts
      </Link>

      <PageHeader
        title={draft.title}
        description={`${draft.type} · ${draft.status}${
          draft.caseNumber ? ` · case ${draft.caseNumber}` : ""
        }`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{draft.type}</Badge>
        <Badge>{draft.status}</Badge>
        {reviewerName && (
          <Badge variant="secondary">Reviewer: {reviewerName}</Badge>
        )}
        {draft.editDistance != null && (
          <Badge variant="outline">
            {draft.editDistance} edit{draft.editDistance === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {/* SA-2: Download as PDF (printable HTML with letterhead) */}
      {draft.body && draft.status !== "error" && (
        <div className="flex justify-end">
          <a
            href={`/api/drafts/${draft.id}/pdf`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download as document
          </a>
        </div>
      )}

      {sourceMessage && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Responding to
            </p>
            <p className="text-xs text-muted-foreground">
              {sourceMessage.fromAddress ?? "client"} ·{" "}
              {sourceMessage.createdAt.toLocaleString()}
            </p>
            {sourceMessage.subject && (
              <p className="text-sm font-medium mt-1">
                {sourceMessage.subject}
              </p>
            )}
            {sourceMessage.body && (
              <p className="text-sm mt-2 whitespace-pre-wrap text-foreground">
                {sourceMessage.body}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {draft.status === "error" ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium text-destructive">
              Draft generation failed
            </p>
            {draft.errorMessage && (
              <p className="text-xs text-muted-foreground">
                {draft.errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <DraftReviewerClient
          draftId={draft.id}
          initialBody={draft.body}
          canSend={Boolean(canSend)}
          caseId={draft.caseId ?? undefined}
        />
      )}
    </div>
  );
}
