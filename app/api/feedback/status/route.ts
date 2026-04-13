import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger/server";
import { updateFeedbackStatus } from "@/lib/feedback/service";
import { verifyAuthHeader } from "@/lib/feedback/export-token";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/lib/feedback/constants";

export const dynamic = "force-dynamic";

const singleSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(FEEDBACK_STATUSES),
  link: z.string().max(2000).optional(),
  notes: z.string().max(10000).optional(),
});

const batchSchema = z.object({
  items: z.array(singleSchema).min(1).max(500),
});

const bodySchema = z.union([singleSchema, batchSchema]);

/**
 * POST /api/feedback/status
 *
 * Auth: bearer token only (export token).
 * Body: a single { itemId, status, link?, notes? } or batch { items: [...] }.
 */
export async function POST(request: NextRequest) {
  try {
    const token = verifyAuthHeader(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const items = "items" in parsed.data ? parsed.data.items : [parsed.data];

    let updated = 0;
    let notFound = 0;
    for (const it of items) {
      const row = await updateFeedbackStatus({
        organizationId: token.organizationId,
        id: it.itemId,
        status: it.status as FeedbackStatus,
        adminNotes: it.notes ?? undefined,
        resolvedLink: it.link ?? undefined,
        source: "api",
      });
      if (row) updated++;
      else notFound++;
    }

    logger.info("Feedback status API update", {
      organizationId: token.organizationId,
      updated,
      notFound,
    });

    return NextResponse.json({ updated, notFound });
  } catch (err) {
    logger.error("Feedback status API error", { error: err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

