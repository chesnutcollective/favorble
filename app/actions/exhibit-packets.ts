"use server";

import { db } from "@/db/drizzle";
import {
	exhibitPackets,
	exhibitPacketDocuments,
	documents,
	cases,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, desc, asc, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Create a new exhibit packet for a case.
 */
export async function createExhibitPacket(data: {
	caseId: string;
	title: string;
	description?: string;
}) {
	const session = await requireSession();

	// Verify case belongs to org
	const [caseRow] = await db
		.select({ id: cases.id })
		.from(cases)
		.where(
			and(
				eq(cases.id, data.caseId),
				eq(cases.organizationId, session.organizationId),
			),
		)
		.limit(1);

	if (!caseRow) throw new Error("Case not found");

	const [packet] = await db
		.insert(exhibitPackets)
		.values({
			organizationId: session.organizationId,
			caseId: data.caseId,
			title: data.title,
			description: data.description,
			createdBy: session.id,
		})
		.returning();

	logger.info("Exhibit packet created", {
		packetId: packet.id,
		caseId: data.caseId,
	});
	revalidatePath(`/cases/${data.caseId}`);
	return packet;
}

/**
 * List exhibit packets for a case.
 */
export async function getExhibitPackets(caseId: string) {
	await requireSession();

	return db
		.select()
		.from(exhibitPackets)
		.where(eq(exhibitPackets.caseId, caseId))
		.orderBy(desc(exhibitPackets.createdAt));
}

/**
 * Get a single exhibit packet with its documents joined.
 */
export async function getExhibitPacketDetail(packetId: string) {
	await requireSession();

	const [packet] = await db
		.select()
		.from(exhibitPackets)
		.where(eq(exhibitPackets.id, packetId))
		.limit(1);

	if (!packet) return null;

	const packetDocs = await db
		.select({
			id: exhibitPacketDocuments.id,
			packetId: exhibitPacketDocuments.packetId,
			documentId: exhibitPacketDocuments.documentId,
			exhibitLabel: exhibitPacketDocuments.exhibitLabel,
			displayOrder: exhibitPacketDocuments.displayOrder,
			startPage: exhibitPacketDocuments.startPage,
			endPage: exhibitPacketDocuments.endPage,
			notes: exhibitPacketDocuments.notes,
			createdAt: exhibitPacketDocuments.createdAt,
			fileName: documents.fileName,
			fileType: documents.fileType,
			fileSizeBytes: documents.fileSizeBytes,
			category: documents.category,
		})
		.from(exhibitPacketDocuments)
		.innerJoin(
			documents,
			eq(exhibitPacketDocuments.documentId, documents.id),
		)
		.where(eq(exhibitPacketDocuments.packetId, packetId))
		.orderBy(asc(exhibitPacketDocuments.displayOrder));

	return { ...packet, documents: packetDocs };
}

/**
 * Add a document to an exhibit packet.
 */
export async function addDocumentToPacket(data: {
	packetId: string;
	documentId: string;
	exhibitLabel?: string;
	displayOrder?: number;
}) {
	await requireSession();

	let order = data.displayOrder;

	if (order === undefined) {
		// Auto-increment: find the current max displayOrder in this packet
		const [maxRow] = await db
			.select({ maxOrder: max(exhibitPacketDocuments.displayOrder) })
			.from(exhibitPacketDocuments)
			.where(eq(exhibitPacketDocuments.packetId, data.packetId));

		order = (maxRow?.maxOrder ?? -1) + 1;
	}

	const [row] = await db
		.insert(exhibitPacketDocuments)
		.values({
			packetId: data.packetId,
			documentId: data.documentId,
			exhibitLabel: data.exhibitLabel,
			displayOrder: order,
		})
		.returning();

	// Look up the packet to revalidate the case path
	const [packet] = await db
		.select({ caseId: exhibitPackets.caseId })
		.from(exhibitPackets)
		.where(eq(exhibitPackets.id, data.packetId))
		.limit(1);

	if (packet) {
		revalidatePath(`/cases/${packet.caseId}`);
	}

	return row;
}

/**
 * Remove a document from an exhibit packet.
 */
export async function removeDocumentFromPacket(id: string) {
	await requireSession();

	const [row] = await db
		.select({ packetId: exhibitPacketDocuments.packetId })
		.from(exhibitPacketDocuments)
		.where(eq(exhibitPacketDocuments.id, id))
		.limit(1);

	if (!row) throw new Error("Packet document not found");

	await db
		.delete(exhibitPacketDocuments)
		.where(eq(exhibitPacketDocuments.id, id));

	const [packet] = await db
		.select({ caseId: exhibitPackets.caseId })
		.from(exhibitPackets)
		.where(eq(exhibitPackets.id, row.packetId))
		.limit(1);

	if (packet) {
		revalidatePath(`/cases/${packet.caseId}`);
	}
}

/**
 * Reorder documents within a packet.
 */
export async function reorderPacketDocuments(
	packetId: string,
	orderedIds: string[],
) {
	await requireSession();

	for (let i = 0; i < orderedIds.length; i++) {
		await db
			.update(exhibitPacketDocuments)
			.set({ displayOrder: i })
			.where(
				and(
					eq(exhibitPacketDocuments.id, orderedIds[i]),
					eq(exhibitPacketDocuments.packetId, packetId),
				),
			);
	}

	const [packet] = await db
		.select({ caseId: exhibitPackets.caseId })
		.from(exhibitPackets)
		.where(eq(exhibitPackets.id, packetId))
		.limit(1);

	if (packet) {
		revalidatePath(`/cases/${packet.caseId}`);
	}
}

/**
 * Update exhibit packet metadata.
 */
export async function updateExhibitPacket(
	packetId: string,
	data: { title?: string; description?: string },
) {
	await requireSession();

	const updateData: Record<string, unknown> = {
		updatedAt: new Date(),
	};

	if (data.title !== undefined) updateData.title = data.title;
	if (data.description !== undefined)
		updateData.description = data.description;

	await db
		.update(exhibitPackets)
		.set(updateData)
		.where(eq(exhibitPackets.id, packetId));

	const [packet] = await db
		.select({ caseId: exhibitPackets.caseId })
		.from(exhibitPackets)
		.where(eq(exhibitPackets.id, packetId))
		.limit(1);

	if (packet) {
		revalidatePath(`/cases/${packet.caseId}`);
	}
}

/**
 * Build the exhibit packet (compile into a single PDF).
 */
export async function buildExhibitPacket(packetId: string) {
	const session = await requireSession();

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

	if (!packet) throw new Error("Packet not found");

	// Mark as building
	await db
		.update(exhibitPackets)
		.set({ status: "building", updatedAt: new Date() })
		.where(eq(exhibitPackets.id, packetId));

	try {
		const { buildExhibitPacket: buildPacket } = await import(
			"@/lib/services/exhibit-packets"
		);
		const result = await buildPacket(packetId);
		logger.info("Exhibit packet build initiated", {
			packetId,
			caseId: packet.caseId,
		});
		revalidatePath(`/cases/${packet.caseId}`);
		return result;
	} catch (err) {
		// Revert status on failure
		await db
			.update(exhibitPackets)
			.set({
				status: "failed",
				errorMessage:
					err instanceof Error ? err.message : "Build service unavailable",
				updatedAt: new Date(),
			})
			.where(eq(exhibitPackets.id, packetId));

		logger.warn("Exhibit packet build service not available", {
			packetId,
			error: err,
		});
		throw new Error("Exhibit packet build service is not available");
	}
}

/**
 * Delete an exhibit packet and its document associations.
 */
export async function deleteExhibitPacket(packetId: string) {
	const session = await requireSession();

	const [packet] = await db
		.select({
			caseId: exhibitPackets.caseId,
			organizationId: exhibitPackets.organizationId,
		})
		.from(exhibitPackets)
		.where(eq(exhibitPackets.id, packetId))
		.limit(1);

	if (!packet) throw new Error("Packet not found");
	if (packet.organizationId !== session.organizationId)
		throw new Error("Packet not found");

	// Delete document associations first
	await db
		.delete(exhibitPacketDocuments)
		.where(eq(exhibitPacketDocuments.packetId, packetId));

	// Delete the packet
	await db
		.delete(exhibitPackets)
		.where(eq(exhibitPackets.id, packetId));

	logger.info("Exhibit packet deleted", { packetId });
	revalidatePath(`/cases/${packet.caseId}`);
}
