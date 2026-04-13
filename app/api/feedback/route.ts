import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import { getFeedbackList } from "@/lib/feedback/service";
import { verifyAuthHeader } from "@/lib/feedback/export-token";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/feedback/constants";

export const dynamic = "force-dynamic";

/**
 * GET /api/feedback?status=open&category=bug
 *
 * Auth: bearer token (export token) OR an admin Clerk session.
 * Returns: { items: FeedbackRow[] } scoped to the org.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? undefined;
    const categoryParam = url.searchParams.get("category") ?? undefined;

    let organizationId: string | null = null;

    const tokenResult = verifyAuthHeader(request.headers.get("authorization"));
    if (tokenResult) {
      organizationId = tokenResult.organizationId;
    } else {
      const session = await getSession();
      if (session && session.role === "admin") {
        organizationId = session.organizationId;
      }
    }

    if (!organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      statusParam &&
      !FEEDBACK_STATUSES.includes(statusParam as FeedbackStatus)
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (
      categoryParam &&
      !FEEDBACK_CATEGORIES.includes(categoryParam as FeedbackCategory)
    ) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const items = await getFeedbackList({
      organizationId,
      status: statusParam as FeedbackStatus | undefined,
      category: categoryParam as FeedbackCategory | undefined,
    });

    return NextResponse.json({
      items: items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      count: items.length,
    });
  } catch (err) {
    logger.error("Feedback list API error", { error: err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
