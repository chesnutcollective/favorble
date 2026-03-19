import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";

/**
 * Webhook receiver for Zapier-forwarded website lead form submissions.
 *
 * Expected payload:
 * {
 *   firstName: string,
 *   lastName: string,
 *   email?: string,
 *   phone?: string,
 *   source?: string,
 *   ...additionalFields
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic validation
    if (!body.firstName || !body.lastName) {
      return NextResponse.json(
        { error: "firstName and lastName are required" },
        { status: 400 },
      );
    }

    // TODO: When schema is ready, insert lead into database via createLead action
    // For now, log the incoming lead data
    logger.info("Zapier webhook received", {
      firstName: body.firstName,
      lastName: body.lastName,
      source: body.source ?? "website",
    });

    // TODO: Implement lead creation
    // const lead = await createLead({
    //   organizationId: ORG_ID, // Will need org resolution from webhook secret/header
    //   firstName: body.firstName,
    //   lastName: body.lastName,
    //   email: body.email,
    //   phone: body.phone,
    //   source: body.source ?? "website",
    //   sourceData: body,
    // });

    return NextResponse.json(
      { success: true, message: "Lead received" },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Zapier webhook error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Health check for Zapier to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "zapier-webhook" });
}
