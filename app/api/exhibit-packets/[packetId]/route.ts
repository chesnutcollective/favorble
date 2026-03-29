import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { exhibitPackets, exhibitPacketDocuments, documents } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ packetId: string }> };

/**
 * GET /api/exhibit-packets/[packetId] — Fetch packet detail with documents.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { packetId } = await context.params;

    const [packet] = await db
      .select()
      .from(exhibitPackets)
      .where(
        and(
          eq(exhibitPackets.id, packetId),
          eq(exhibitPackets.organizationId, session.organizationId),
        ),
      )
      .limit(1);

    if (!packet) {
      return NextResponse.json({ error: "Packet not found" }, { status: 404 });
    }

    // Fetch associated documents
    const packetDocs = await db
      .select({
        id: exhibitPacketDocuments.id,
        documentId: exhibitPacketDocuments.documentId,
        exhibitLabel: exhibitPacketDocuments.exhibitLabel,
        displayOrder: exhibitPacketDocuments.displayOrder,
        startPage: exhibitPacketDocuments.startPage,
        endPage: exhibitPacketDocuments.endPage,
        notes: exhibitPacketDocuments.notes,
        fileName: documents.fileName,
        fileType: documents.fileType,
        fileSizeBytes: documents.fileSizeBytes,
      })
      .from(exhibitPacketDocuments)
      .innerJoin(documents, eq(exhibitPacketDocuments.documentId, documents.id))
      .where(eq(exhibitPacketDocuments.packetId, packetId))
      .orderBy(asc(exhibitPacketDocuments.displayOrder));

    return NextResponse.json({
      packet: {
        id: packet.id,
        caseId: packet.caseId,
        title: packet.title,
        description: packet.description,
        status: packet.status,
        packetStoragePath: packet.packetStoragePath,
        packetSizeBytes: packet.packetSizeBytes,
        tableOfContents: packet.tableOfContents,
        metadata: packet.metadata,
        builtAt: packet.builtAt,
        submittedAt: packet.submittedAt,
        errorMessage: packet.errorMessage,
        createdAt: packet.createdAt,
        updatedAt: packet.updatedAt,
      },
      documents: packetDocs,
    });
  } catch (error) {
    logger.error("Exhibit packet fetch error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/exhibit-packets/[packetId] — Update packet metadata.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { packetId } = await context.params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const [updated] = await db
      .update(exhibitPackets)
      .set(updateData)
      .where(
        and(
          eq(exhibitPackets.id, packetId),
          eq(exhibitPackets.organizationId, session.organizationId),
        ),
      )
      .returning({
        id: exhibitPackets.id,
        title: exhibitPackets.title,
        description: exhibitPackets.description,
        status: exhibitPackets.status,
        updatedAt: exhibitPackets.updatedAt,
      });

    if (!updated) {
      return NextResponse.json({ error: "Packet not found" }, { status: 404 });
    }

    logger.info("Exhibit packet updated", { packetId });

    return NextResponse.json({ packet: updated });
  } catch (error) {
    logger.error("Exhibit packet update error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/exhibit-packets/[packetId] — Delete a packet.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { packetId } = await context.params;

    // Delete associated packet documents first
    await db
      .delete(exhibitPacketDocuments)
      .where(eq(exhibitPacketDocuments.packetId, packetId));

    // Delete the packet
    const [deleted] = await db
      .delete(exhibitPackets)
      .where(
        and(
          eq(exhibitPackets.id, packetId),
          eq(exhibitPackets.organizationId, session.organizationId),
        ),
      )
      .returning({ id: exhibitPackets.id });

    if (!deleted) {
      return NextResponse.json({ error: "Packet not found" }, { status: 404 });
    }

    logger.info("Exhibit packet deleted", { packetId });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Exhibit packet delete error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
