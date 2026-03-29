import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { exhibitPackets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ packetId: string }> };

/**
 * POST /api/exhibit-packets/[packetId]/build — Trigger packet compilation.
 */
export async function POST(
	_request: NextRequest,
	context: RouteContext,
) {
	try {
		const session = await requireSession();
		const { packetId } = await context.params;

		// Verify the packet exists and belongs to the user's organization
		const [packet] = await db
			.select({
				id: exhibitPackets.id,
				status: exhibitPackets.status,
				caseId: exhibitPackets.caseId,
			})
			.from(exhibitPackets)
			.where(
				and(
					eq(exhibitPackets.id, packetId),
					eq(exhibitPackets.organizationId, session.organizationId),
				),
			)
			.limit(1);

		if (!packet) {
			return NextResponse.json(
				{ error: "Packet not found" },
				{ status: 404 },
			);
		}

		if (packet.status === "building") {
			return NextResponse.json(
				{ error: "Packet is already being built" },
				{ status: 409 },
			);
		}

		// Update status to building
		await db
			.update(exhibitPackets)
			.set({
				status: "building",
				errorMessage: null,
				updatedAt: new Date(),
			})
			.where(eq(exhibitPackets.id, packetId));

		logger.info("Exhibit packet build triggered", {
			packetId,
			caseId: packet.caseId,
		});

		// TODO: Trigger actual packet compilation pipeline
		// This would typically enqueue a background job that:
		// 1. Collects all packet documents in order
		// 2. Generates table of contents
		// 3. Merges PDFs with exhibit labels
		// 4. Stores the compiled packet
		// 5. Updates status to "ready" with packetStoragePath

		return NextResponse.json({
			success: true,
			packetId,
			status: "building",
		});
	} catch (error) {
		logger.error("Exhibit packet build trigger error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
