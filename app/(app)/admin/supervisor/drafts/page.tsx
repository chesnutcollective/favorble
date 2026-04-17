import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { aiDrafts, cases, users } from "@/db/schema";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COLORS } from "@/lib/design-tokens";
import { SupervisorDraftsClient, type DraftRow } from "./client";

export const metadata: Metadata = {
  title: "Supervisor · Draft Inbox",
};

export const dynamic = "force-dynamic";

const SUPERVISOR_ROLES = new Set(["admin", "reviewer"]);

export default async function SupervisorDraftsPage() {
  const session = await requireSession();
  if (!SUPERVISOR_ROLES.has(session.role)) {
    notFound();
  }

  let rows: DraftRow[] = [];
  try {
    const raw = await db
      .select({
        id: aiDrafts.id,
        title: aiDrafts.title,
        type: aiDrafts.type,
        status: aiDrafts.status,
        caseId: aiDrafts.caseId,
        caseNumber: cases.caseNumber,
        reviewerFirstName: users.firstName,
        reviewerLastName: users.lastName,
        createdAt: aiDrafts.createdAt,
      })
      .from(aiDrafts)
      .leftJoin(cases, eq(aiDrafts.caseId, cases.id))
      .leftJoin(users, eq(aiDrafts.assignedReviewerId, users.id))
      .where(
        and(
          eq(aiDrafts.organizationId, session.organizationId),
          // Hide sent/approved from the supervisor queue — still
          // reachable via case detail if needed.
          inArray(aiDrafts.status, [
            "generating",
            "draft_ready",
            "in_review",
            "approved",
            "rejected",
            "error",
          ]),
        ),
      )
      .orderBy(desc(aiDrafts.createdAt))
      .limit(500);

    rows = raw.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      caseId: r.caseId,
      caseNumber: r.caseNumber ?? null,
      reviewerName:
        r.reviewerFirstName || r.reviewerLastName
          ? `${r.reviewerFirstName ?? ""} ${r.reviewerLastName ?? ""}`.trim()
          : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
    }));
  } catch {
    // DB unavailable — render empty state.
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Draft Inbox (Org-wide)"
        description="Every AI draft across the firm — filter by type and status, click through to review."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/supervisor">
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                size={14}
                className="mr-1"
                aria-hidden="true"
              />
              Supervisor hub
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-[13px]" style={{ color: COLORS.text2 }}>
              No drafts in the firm right now. New drafts appear here as soon as
              the generation worker writes them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SupervisorDraftsClient rows={rows} />
      )}
    </div>
  );
}
