import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";

/**
 * Webhook receiver for Case Status events.
 *
 * Handles:
 * - Inbound client messages
 * - Document uploads from clients
 * - Status updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate webhook signature if Case Status provides one
    // const signature = request.headers.get("x-casestatus-signature");
    // if (!verifySignature(signature, body)) {
    //   return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    // }

    const eventType = body.event ?? body.type;

    switch (eventType) {
      case "message.received": {
        logger.info("Case Status message received", {
          caseExternalId: body.caseId,
          from: body.from,
        });

        // TODO: Insert into communications table
        // await createCommunication({
        //   type: "message_inbound",
        //   sourceSystem: "case_status",
        //   externalMessageId: body.messageId,
        //   body: body.content,
        //   fromAddress: body.from,
        //   caseExternalId: body.caseId,
        // });
        break;
      }

      case "document.uploaded": {
        logger.info("Case Status document uploaded", {
          caseExternalId: body.caseId,
          fileName: body.fileName,
        });

        // TODO: Download and store the document
        // 1. Download from Case Status URL
        // 2. Upload to Supabase Storage
        // 3. Create document record
        break;
      }

      case "status.updated": {
        logger.info("Case Status update", {
          caseExternalId: body.caseId,
          status: body.status,
        });
        break;
      }

      default: {
        logger.warn("Unknown Case Status event type", { eventType });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Case Status webhook error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "case-status-webhook" });
}
