"use server";

import { db } from "@/db/drizzle";
import { leads, cases, contacts, caseContacts, caseStageTransitions } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { executeStageWorkflows } from "@/lib/workflow-engine";
import { eq, and, isNull, desc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Get leads grouped by status for the kanban board.
 */
export async function getLeads(statusFilter?: string) {
	const session = await requireSession();
	const conditions = [
		eq(leads.organizationId, session.organizationId),
		isNull(leads.deletedAt),
	];

	if (statusFilter) {
		conditions.push(
			eq(
				leads.status,
				statusFilter as
					| "new"
					| "contacted"
					| "intake_scheduled"
					| "intake_in_progress"
					| "contract_sent"
					| "contract_signed"
					| "converted"
					| "declined"
					| "unresponsive"
					| "disqualified",
			),
		);
	}

	const result = await db
		.select()
		.from(leads)
		.where(and(...conditions))
		.orderBy(desc(leads.createdAt));

	return result;
}

/**
 * Get a single lead by ID.
 */
export async function getLeadById(id: string) {
	const session = await requireSession();
	const [lead] = await db
		.select()
		.from(leads)
		.where(
			and(
				eq(leads.id, id),
				eq(leads.organizationId, session.organizationId),
				isNull(leads.deletedAt),
			),
		)
		.limit(1);
	return lead ?? null;
}

/**
 * Create a new lead.
 */
export async function createLead(data: {
	firstName: string;
	lastName: string;
	email?: string;
	phone?: string;
	source?: string;
	notes?: string;
}) {
	const session = await requireSession();
	const [lead] = await db
		.insert(leads)
		.values({
			organizationId: session.organizationId,
			firstName: data.firstName,
			lastName: data.lastName,
			email: data.email,
			phone: data.phone,
			source: data.source ?? "website",
			notes: data.notes,
			createdBy: session.id,
		})
		.returning();

	logger.info("Lead created", { leadId: lead.id });
	revalidatePath("/leads");
	return lead;
}

/**
 * Update a lead's status (for kanban drag-and-drop).
 */
export async function updateLeadStatus(
	id: string,
	status: string,
) {
	await db
		.update(leads)
		.set({
			status: status as
				| "new"
				| "contacted"
				| "intake_scheduled"
				| "intake_in_progress"
				| "contract_sent"
				| "contract_signed"
				| "converted"
				| "declined"
				| "unresponsive"
				| "disqualified",
			updatedAt: new Date(),
		})
		.where(eq(leads.id, id));
	revalidatePath("/leads");
}

/**
 * Convert a lead to a case.
 */
export async function convertLeadToCase(
	leadId: string,
	data: {
		initialStageId: string;
		ssaOffice?: string;
	},
) {
	const session = await requireSession();

	const [lead] = await db
		.select()
		.from(leads)
		.where(eq(leads.id, leadId));

	if (!lead) throw new Error("Lead not found");

	// Generate case number
	const [lastCase] = await db
		.select({ caseNumber: cases.caseNumber })
		.from(cases)
		.where(eq(cases.organizationId, session.organizationId))
		.orderBy(desc(cases.createdAt))
		.limit(1);

	const nextNum = lastCase
		? Number.parseInt(lastCase.caseNumber.replace(/\D/g, ""), 10) + 1
		: 1001;
	const caseNumber = `CF-${nextNum}`;

	// Create contact from lead data
	const [contact] = await db
		.insert(contacts)
		.values({
			organizationId: session.organizationId,
			firstName: lead.firstName,
			lastName: lead.lastName,
			email: lead.email,
			phone: lead.phone,
			contactType: "claimant",
			createdBy: session.id,
		})
		.returning();

	// Create case
	const [newCase] = await db
		.insert(cases)
		.values({
			organizationId: session.organizationId,
			caseNumber,
			leadId,
			currentStageId: data.initialStageId,
			ssaOffice: data.ssaOffice,
			createdBy: session.id,
			updatedBy: session.id,
		})
		.returning();

	// Link contact
	await db.insert(caseContacts).values({
		caseId: newCase.id,
		contactId: contact.id,
		relationship: "claimant",
		isPrimary: true,
	});

	// Update lead
	await db
		.update(leads)
		.set({
			status: "converted",
			convertedToCaseId: newCase.id,
			convertedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(leads.id, leadId));

	// Log transition
	await db.insert(caseStageTransitions).values({
		caseId: newCase.id,
		toStageId: data.initialStageId,
		transitionedBy: session.id,
	});

	// Execute workflows
	await executeStageWorkflows(
		newCase.id,
		data.initialStageId,
		session.id,
		session.organizationId,
	);

	logger.info("Lead converted to case", {
		leadId,
		caseId: newCase.id,
		caseNumber,
	});

	revalidatePath("/leads");
	revalidatePath("/cases");
	return newCase;
}

/**
 * Get lead counts by status for the pipeline header.
 */
export async function getLeadCountsByStatus() {
	const session = await requireSession();
	const result = await db
		.select({
			status: leads.status,
			count: count(),
		})
		.from(leads)
		.where(
			and(
				eq(leads.organizationId, session.organizationId),
				isNull(leads.deletedAt),
			),
		)
		.groupBy(leads.status);

	return result;
}
