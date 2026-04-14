import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger/server";
import { promoteFeedbackByStatus } from "@/lib/feedback/service";
import { verifyAuthHeader } from "@/lib/feedback/export-token";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/lib/feedback/constants";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  from: z.enum(FEEDBACK_STATUSES).optional(),
  to: z.enum(FEEDBACK_STATUSES).optional(),
});

/**
 * POST /api/feedback/promote
 *
 * Auth: bearer token only. Bulk-shifts every item from one status to
 * another. Defaults to staging → production.
 */
export async function POST(request: NextRequest) {
  try {
    const token = verifyAuthHeader(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const fromStatus = (parsed.data.from ?? "staging") as FeedbackStatus;
    const toStatus = (parsed.data.to ?? "production") as FeedbackStatus;

    const promoted = await promoteFeedbackByStatus({
      organizationId: token.organizationId,
      fromStatus,
      toStatus,
      source: "promote-api",
    });

    logger.info("Feedback promote API", {
      organizationId: token.organizationId,
      fromStatus,
      toStatus,
      promoted,
    });

    return NextResponse.json({ promoted, fromStatus, toStatus });
  } catch (err) {
    logger.error("Feedback promote API error", { error: err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
