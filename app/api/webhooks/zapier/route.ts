import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { leads, users, organizations } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

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
 *   organizationSlug?: string,
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

    // Resolve organization: try slug from payload/header, else fall back to first org
    let organizationId: string | null = null;
    const orgSlug =
      body.organizationSlug ?? request.headers.get("x-organization-slug");

    if (orgSlug) {
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, orgSlug))
        .limit(1);
      if (org) organizationId = org.id;
    }

    if (!organizationId) {
      // Fallback: use the first (default) organization
      const [defaultOrg] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(isNull(organizations.deletedAt))
        .limit(1);
      if (!defaultOrg) {
        return NextResponse.json(
          { error: "No organization found" },
          { status: 400 },
        );
      }
      organizationId = defaultOrg.id;
    }

    // Round-robin assignment: find intake team user with fewest active leads
    let assignedToId: string | null = null;
    try {
      const intakeUsers = await db
        .select({
          id: users.id,
          leadCount: sql<number>`coalesce((
            select count(*) from leads
            where leads.assigned_to_id = ${users.id}
              and leads.status not in ('converted', 'declined', 'unresponsive', 'disqualified')
              and leads.deleted_at is null
          ), 0)`.as("lead_count"),
        })
        .from(users)
        .where(
          and(
            eq(users.organizationId, organizationId),
            eq(users.isActive, true),
            eq(users.team, "intake"),
          ),
        )
        .orderBy(sql`lead_count asc`)
        .limit(1);

      if (intakeUsers.length > 0) {
        assignedToId = intakeUsers[0].id;
      }
    } catch {
      // Assignment is best-effort; continue without it
    }

    // Extract known fields, store everything else in sourceData
    const {
      firstName,
      lastName,
      email,
      phone,
      source,
      organizationSlug: _os,
      ...additionalFields
    } = body;

    const [lead] = await db
      .insert(leads)
      .values({
        organizationId,
        firstName,
        lastName,
        email: email ?? null,
        phone: phone ?? null,
        source: source ?? "website",
        sourceData: additionalFields,
        assignedToId,
      })
      .returning();

    logger.info("Zapier webhook: lead created", {
      leadId: lead.id,
      assignedToId,
      source: source ?? "website",
    });

    return NextResponse.json(
      { success: true, leadId: lead.id, assignedToId },
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
