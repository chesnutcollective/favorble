import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { ereCredentials } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/ere/credentials/[id] — Soft-delete a credential (set isActive=false).
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;

    const [updated] = await db
      .update(ereCredentials)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ereCredentials.id, id),
          eq(ereCredentials.organizationId, session.organizationId),
        ),
      )
      .returning({ id: ereCredentials.id });

    if (!updated) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 },
      );
    }

    logger.info("ERE credential soft-deleted", {
      credentialId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("ERE credential delete error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/ere/credentials/[id] — Update credential label or isActive.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.label !== undefined) {
      updateData.label = body.label;
    }
    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive;
    }

    const [updated] = await db
      .update(ereCredentials)
      .set(updateData)
      .where(
        and(
          eq(ereCredentials.id, id),
          eq(ereCredentials.organizationId, session.organizationId),
        ),
      )
      .returning({
        id: ereCredentials.id,
        label: ereCredentials.label,
        isActive: ereCredentials.isActive,
        lastUsedAt: ereCredentials.lastUsedAt,
        lastErrorMessage: ereCredentials.lastErrorMessage,
        updatedAt: ereCredentials.updatedAt,
      });

    if (!updated) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 },
      );
    }

    logger.info("ERE credential updated", {
      credentialId: id,
    });

    return NextResponse.json({ credential: updated });
  } catch (error) {
    logger.error("ERE credential update error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
