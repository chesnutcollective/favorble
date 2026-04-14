import { type NextRequest } from "next/server";
import { db } from "@/db/drizzle";
import { feedback } from "@/db/schema/feedback";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import {
  verifyAuthHeader,
  verifyExportToken,
} from "@/lib/feedback/export-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/feedback/[id]/screenshot?token=<export-token>
 *
 * Serves the captured screenshot bytes for a feedback item as a JPEG.
 * Auth: bearer token in Authorization header, OR `?token=` query param
 * (so URLs embedded in the Claude export prompt work in a browser without
 * extra auth setup), OR an admin Clerk session.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    let organizationId: string | null = null;

    // Header bearer
    const headerToken = verifyAuthHeader(request.headers.get("authorization"));
    if (headerToken) {
      organizationId = headerToken.organizationId;
    }

    // ?token=
    if (!organizationId) {
      const url = new URL(request.url);
      const queryToken = url.searchParams.get("token");
      if (queryToken) {
        const verified = verifyExportToken(queryToken);
        if (verified) organizationId = verified.organizationId;
      }
    }

    // Admin session fallback
    if (!organizationId) {
      const session = await getSession();
      if (session?.role === "admin") {
        organizationId = session.organizationId;
      }
    }

    if (!organizationId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const [row] = await db
      .select({ context: feedback.context })
      .from(feedback)
      .where(
        and(
          eq(feedback.id, id),
          eq(feedback.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!row) {
      return new Response("Not found", { status: 404 });
    }

    const ctx = row.context as
      | { screenshot?: { base64?: string } }
      | null;
    const base64 = ctx?.screenshot?.base64;
    if (!base64) {
      return new Response("No screenshot available", { status: 404 });
    }

    const buffer = Buffer.from(base64, "base64");
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600, must-revalidate",
        "Content-Disposition": `inline; filename="feedback-${id}.jpg"`,
      },
    });
  } catch (err) {
    logger.error("Screenshot serve error", { error: err });
    return new Response("Internal server error", { status: 500 });
  }
}
