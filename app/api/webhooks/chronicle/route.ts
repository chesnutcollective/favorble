import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";

/**
 * Webhook receiver for Chronicle (SSA data sync) events.
 *
 * Handles:
 * - New SSA documents available
 * - Claim status changes
 * - Sync completion notifications
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const eventType = body.event ?? body.type;

    switch (eventType) {
      case "document.available": {
        logger.info("Chronicle document available", {
          claimantId: body.claimantId,
          documentType: body.documentType,
        });

        // TODO: When Chronicle API is available:
        // 1. Download document from Chronicle
        // 2. Upload to Supabase Storage
        // 3. Create document record with source = "chronicle"
        // 4. Update case's chronicleLastSyncAt
        break;
      }

      case "claim.status_changed": {
        logger.info("Chronicle claim status changed", {
          claimantId: body.claimantId,
          oldStatus: body.oldStatus,
          newStatus: body.newStatus,
        });

        // TODO: Map SSA status changes to case stage transitions
        // This is a future enhancement pending Chronicle API availability
        break;
      }

      case "sync.completed": {
        logger.info("Chronicle sync completed", {
          claimantId: body.claimantId,
          documentsFound: body.documentCount,
        });

        // TODO: Update case's chronicleLastSyncAt timestamp
        break;
      }

      default: {
        logger.warn("Unknown Chronicle event type", { eventType });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Chronicle webhook error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "chronicle-webhook" });
}
