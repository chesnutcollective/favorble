"use server";

import { db } from "@/db/drizzle";
import {
	leads,
	cases,
	contacts,
	caseContacts,
	caseStageTransitions,
	customFieldDefinitions,
	customFieldValues,
	leadSignatureRequests,
	users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { executeStageWorkflows } from "@/lib/workflow-engine";
import { eq, and, isNull, desc, count, asc, sql } from "drizzle-orm";
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
 * Round-robin assignment: find the intake-team user with fewest active leads.
 */
async function findRoundRobinAssignee(organizationId: string): Promise<string | null> {
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

		return intakeUsers.length > 0 ? intakeUsers[0].id : null;
	} catch {
		return null;
	}
}

/**
 * Create a new lead with round-robin assignment.
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

	// Auto-assign via round-robin
	const assignedToId = await findRoundRobinAssignee(session.organizationId);

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
			assignedToId,
			createdBy: session.id,
		})
		.returning();

	logger.info("Lead created", { leadId: lead.id, assignedToId });
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
 * Get intake form field definitions (fields with showInIntakeForm=true).
 */
export async function getIntakeFormFields() {
	const session = await requireSession();

	return db
		.select()
		.from(customFieldDefinitions)
		.where(
			and(
				eq(customFieldDefinitions.organizationId, session.organizationId),
				eq(customFieldDefinitions.isActive, true),
				eq(customFieldDefinitions.showInIntakeForm, true),
			),
		)
		.orderBy(
			asc(customFieldDefinitions.intakeFormOrder),
			asc(customFieldDefinitions.displayOrder),
		);
}

/**
 * Save intake form answers to lead.intakeData.
 */
export async function saveIntakeData(
	leadId: string,
	intakeData: Record<string, unknown>,
) {
	const session = await requireSession();

	// Merge with existing intake data
	const [lead] = await db
		.select({ intakeData: leads.intakeData })
		.from(leads)
		.where(
			and(
				eq(leads.id, leadId),
				eq(leads.organizationId, session.organizationId),
			),
		)
		.limit(1);

	const existingData = (lead?.intakeData as Record<string, unknown>) ?? {};
	const merged = { ...existingData, ...intakeData };

	await db
		.update(leads)
		.set({
			intakeData: merged,
			updatedAt: new Date(),
		})
		.where(eq(leads.id, leadId));

	logger.info("Intake data saved", { leadId, fieldCount: Object.keys(intakeData).length });
	revalidatePath(`/leads/${leadId}`);
	revalidatePath("/leads");
}

/**
 * Convert a lead to a case, auto-populating custom field values from intakeData.
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

	// Auto-populate custom field values from intake data
	const intakeData = (lead.intakeData as Record<string, unknown>) ?? {};
	if (Object.keys(intakeData).length > 0) {
		try {
			// Get intake form field definitions to map slug -> id and determine value columns
			const intakeFields = await db
				.select()
				.from(customFieldDefinitions)
				.where(
					and(
						eq(customFieldDefinitions.organizationId, session.organizationId),
						eq(customFieldDefinitions.isActive, true),
						eq(customFieldDefinitions.showInIntakeForm, true),
					),
				);

			const fieldsBySlug = new Map(intakeFields.map((f) => [f.slug, f]));

			for (const [slug, value] of Object.entries(intakeData)) {
				const fieldDef = fieldsBySlug.get(slug);
				if (!fieldDef || value === undefined || value === null || value === "") continue;

				const valueData: {
					caseId: string;
					fieldDefinitionId: string;
					textValue?: string | null;
					numberValue?: number | null;
					dateValue?: Date | null;
					booleanValue?: boolean | null;
					jsonValue?: unknown;
					updatedBy: string;
				} = {
					caseId: newCase.id,
					fieldDefinitionId: fieldDef.id,
					updatedBy: session.id,
				};

				// Map value to the correct column based on field type
				switch (fieldDef.fieldType) {
					case "number":
					case "currency":
						valueData.numberValue = typeof value === "number" ? value : Number(value);
						break;
					case "date":
						valueData.dateValue = new Date(String(value));
						break;
					case "boolean":
						valueData.booleanValue = Boolean(value);
						break;
					case "multi_select":
						valueData.jsonValue = value;
						break;
					default:
						// text, textarea, select, phone, email, url, ssn, calculated
						valueData.textValue = String(value);
						break;
				}

				await db.insert(customFieldValues).values(valueData);
			}

			logger.info("Intake data mapped to custom fields", {
				caseId: newCase.id,
				fieldsPopulated: Object.keys(intakeData).length,
			});
		} catch (error) {
			// Don't fail the conversion if field mapping has issues
			logger.error("Error mapping intake data to custom fields", { error, caseId: newCase.id });
		}
	}

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

// ─── eSignature placeholder ────────────────────────────────────────────

/**
 * Send a contract (create a signature request record) for a lead.
 */
export async function sendLeadContract(
	leadId: string,
	data: {
		signerEmail: string;
		signerName: string;
		contractType?: string;
	},
) {
	const session = await requireSession();

	const [sigReq] = await db
		.insert(leadSignatureRequests)
		.values({
			leadId,
			signerEmail: data.signerEmail,
			signerName: data.signerName,
			contractType: data.contractType ?? "retainer",
			status: "sent",
			sentAt: new Date(),
			createdBy: session.id,
		})
		.returning();

	// Also advance lead status to contract_sent if it's earlier in pipeline
	const [lead] = await db
		.select({ status: leads.status })
		.from(leads)
		.where(eq(leads.id, leadId))
		.limit(1);

	const earlyStatuses = ["new", "contacted", "intake_scheduled", "intake_in_progress"];
	if (lead && earlyStatuses.includes(lead.status)) {
		await db
			.update(leads)
			.set({ status: "contract_sent", updatedAt: new Date() })
			.where(eq(leads.id, leadId));
	}

	logger.info("Lead contract sent", { leadId, signatureRequestId: sigReq.id });
	revalidatePath(`/leads/${leadId}`);
	revalidatePath("/leads");
	return sigReq;
}

/**
 * Get signature requests for a lead.
 */
export async function getLeadSignatureRequests(leadId: string) {
	await requireSession();

	return db
		.select()
		.from(leadSignatureRequests)
		.where(eq(leadSignatureRequests.leadId, leadId))
		.orderBy(desc(leadSignatureRequests.createdAt));
}

/**
 * Update a lead signature request status (webhook or manual).
 */
export async function updateLeadSignatureStatus(
	signatureRequestId: string,
	status: "pending" | "sent" | "viewed" | "signed" | "declined" | "expired",
) {
	const session = await requireSession();

	const updateData: Record<string, unknown> = { status };
	if (status === "viewed") updateData.viewedAt = new Date();
	if (status === "signed") updateData.signedAt = new Date();

	const [updated] = await db
		.update(leadSignatureRequests)
		.set(updateData)
		.where(eq(leadSignatureRequests.id, signatureRequestId))
		.returning();

	// If signed, advance lead to contract_signed
	if (status === "signed" && updated) {
		await db
			.update(leads)
			.set({ status: "contract_signed", updatedAt: new Date() })
			.where(eq(leads.id, updated.leadId));
	}

	logger.info("Lead signature status updated", { signatureRequestId, status });
	revalidatePath("/leads");
	return updated;
}
