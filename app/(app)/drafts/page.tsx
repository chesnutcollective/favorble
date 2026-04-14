import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { aiDrafts, cases, users } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = {
  title: "AI drafts",
};

const ACTIVE_STATUSES = [
  "generating",
  "draft_ready",
  "in_review",
  "error",
] as const;

type AiDraftStatus =
  | "generating"
  | "draft_ready"
  | "in_review"
  | "approved"
  | "sent"
  | "rejected"
  | "error";

type AiDraftType =
  | "client_message"
  | "client_letter"
  | "call_script"
  | "appeal_form"
  | "reconsideration_request"
  | "pre_hearing_brief"
  | "appeals_council_brief"
  | "medical_records_request"
  | "fee_petition"
  | "task_instructions"
  | "status_update"
  | "rfc_letter"
  | "coaching_conversation"
  | "other";

const ALL_STATUSES = new Set<AiDraftStatus>([
  "generating",
  "draft_ready",
  "in_review",
  "approved",
  "sent",
  "rejected",
  "error",
]);

const ALL_TYPES = new Set<AiDraftType>([
  "client_message",
  "client_letter",
  "call_script",
  "appeal_form",
  "reconsideration_request",
  "pre_hearing_brief",
  "appeals_council_brief",
  "medical_records_request",
  "fee_petition",
  "task_instructions",
  "status_update",
  "rfc_letter",
  "coaching_conversation",
  "other",
]);

const LABEL_BY_TYPE: Record<string, string> = {
  client_message: "Client message",
  client_letter: "Client letter",
  call_script: "Call script",
  appeal_form: "Appeal form",
  reconsideration_request: "Reconsideration request",
  pre_hearing_brief: "Pre-hearing brief",
  appeals_council_brief: "Appeals Council brief",
  medical_records_request: "Medical records request",
  fee_petition: "Fee petition",
  task_instructions: "Task instructions",
  status_update: "Status update",
  rfc_letter: "RFC letter",
  coaching_conversation: "Coaching conversation",
  other: "Other",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  generating: "secondary",
  draft_ready: "default",
  in_review: "default",
  approved: "outline",
  sent: "outline",
  rejected: "destructive",
  error: "destructive",
};

export default async function DraftsInboxPage({
  searchParams,
}: {
  searchParams?: Promise<{
    mine?: string;
    type?: string;
    confidence?: string;
    status?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const session = await requireSession();

  const rawType = params.type?.trim();
  const typeFilter: AiDraftType | null =
    rawType && ALL_TYPES.has(rawType as AiDraftType)
      ? (rawType as AiDraftType)
      : null;
  const lowConfidenceOnly = params.confidence === "low";
  // If a specific status is requested, narrow the IN() list; otherwise keep
  // the default ACTIVE_STATUSES list (generating/draft_ready/in_review/error).
  const statusFilter: AiDraftStatus[] =
    params.status &&
    params.status.length > 0 &&
    ALL_STATUSES.has(params.status as AiDraftStatus)
      ? [params.status as AiDraftStatus]
      : [...ACTIVE_STATUSES];

  let rows: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    caseId: string | null;
    caseNumber: string | null;
    assignedReviewerId: string | null;
    createdAt: Date;
    updatedAt: Date;
    body: string;
  }> = [];

  try {
    const conditions = [
      eq(aiDrafts.organizationId, session.organizationId),
      inArray(aiDrafts.status, statusFilter),
    ];
    if (typeFilter) {
      conditions.push(eq(aiDrafts.type, typeFilter));
    }

    rows = await db
      .select({
        id: aiDrafts.id,
        type: aiDrafts.type,
        status: aiDrafts.status,
        title: aiDrafts.title,
        caseId: aiDrafts.caseId,
        caseNumber: cases.caseNumber,
        assignedReviewerId: aiDrafts.assignedReviewerId,
        createdAt: aiDrafts.createdAt,
        updatedAt: aiDrafts.updatedAt,
        body: aiDrafts.body,
      })
      .from(aiDrafts)
      .leftJoin(cases, eq(aiDrafts.caseId, cases.id))
      .where(and(...conditions))
      .orderBy(desc(aiDrafts.createdAt))
      .limit(200);
  } catch {
    // DB unavailable
  }

  const mineOnly = params.mine === "1";
  // Note: low-confidence filter is a placeholder — the aiDrafts table has no
  // confidence column yet. When it lands, filter here on `< 60` + active
  // statuses; for now the filter is a no-op and returns the same list.
  const filtered = (() => {
    let out = rows;
    if (mineOnly) out = out.filter((r) => r.assignedReviewerId === session.id);
    if (lowConfidenceOnly) {
      // No confidence column yet — keep existing rows but narrow to active
      // statuses so the count matches the nav panel's semantics.
      out = out.filter((r) =>
        (ACTIVE_STATUSES as readonly string[]).includes(r.status),
      );
    }
    return out;
  })();

  const reviewerIds = [
    ...new Set(
      filtered.map((r) => r.assignedReviewerId).filter(Boolean) as string[],
    ),
  ];
  const reviewerMap = new Map<string, string>();
  if (reviewerIds.length > 0) {
    try {
      const userRows = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(inArray(users.id, reviewerIds));
      for (const u of userRows) {
        reviewerMap.set(u.id, `${u.firstName} ${u.lastName}`);
      }
    } catch {
      // DB unavailable
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI drafts inbox"
        description="Review, edit, and approve AI-generated drafts before they leave the firm."
      />

      <div className="flex gap-2">
        <Link
          href="/drafts"
          className={`text-sm px-3 py-1 rounded-md border ${
            !mineOnly
              ? "border-foreground text-foreground"
              : "border-border text-muted-foreground"
          }`}
        >
          All drafts ({rows.length})
        </Link>
        <Link
          href="/drafts?mine=1"
          className={`text-sm px-3 py-1 rounded-md border ${
            mineOnly
              ? "border-foreground text-foreground"
              : "border-border text-muted-foreground"
          }`}
        >
          Assigned to me (
          {rows.filter((r) => r.assignedReviewerId === session.id).length})
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Message01Icon}
          title="No drafts waiting"
          description="When the AI generates a draft reply or artifact, it will land here for review."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((draft) => {
            const reviewer = draft.assignedReviewerId
              ? reviewerMap.get(draft.assignedReviewerId)
              : null;
            const preview = draft.body.slice(0, 160);
            return (
              <Link key={draft.id} href={`/drafts/${draft.id}`}>
                <Card className="hover:bg-accent transition-colors duration-200">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant={STATUS_VARIANT[draft.status] ?? "secondary"}
                          className="text-[10px]"
                        >
                          {draft.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {LABEL_BY_TYPE[draft.type] ?? draft.type}
                        </Badge>
                        <p className="text-sm font-medium text-foreground truncate">
                          {draft.title}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {new Date(draft.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {preview && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {preview}
                        {draft.body.length > 160 ? "…" : ""}
                      </p>
                    )}
                    <div className="flex gap-3 text-[11px] text-muted-foreground">
                      {draft.caseNumber && <span>Case {draft.caseNumber}</span>}
                      {reviewer && <span>Reviewer: {reviewer}</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <HugeiconsIcon
          icon={Message01Icon}
          size={16}
          className="text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Every draft is reviewed by a human before it&apos;s sent.
        </p>
      </div>
    </div>
  );
}
