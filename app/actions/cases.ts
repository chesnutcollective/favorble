"use server";

import { db } from "@/db/drizzle";
import {
	cases,
	caseStages,
	caseStageGroups,
	caseAssignments,
	caseStageTransitions,
	users,
	contacts,
	caseContacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { executeStageWorkflows } from "@/lib/workflow-engine";
import { eq, and, isNull, desc, asc, ilike, or, sql, count, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export type CaseFilters = {
	search?: string;
	status?: string;
	stageId?: string;
	stageGroupId?: string;
	assignedToId?: string;
	team?: string;
};

export type Pagination = {
	page: number;
	pageSize: number;
};

/**
 * Get paginated cases with filters.
 */
export async function getCases(
	filters: CaseFilters = {},
	pagination: Pagination = { page: 1, pageSize: 50 },
) {
	const session = await requireSession();
	const conditions = [
		eq(cases.organizationId, session.organizationId),
		isNull(cases.deletedAt),
	];

	if (filters.status) {
		conditions.push(
			eq(
				cases.status,
				filters.status as
					| "active"
					| "on_hold"
					| "closed_won"
					| "closed_lost"
					| "closed_withdrawn",
			),
		);
	}

	if (filters.stageId) {
		conditions.push(eq(cases.currentStageId, filters.stageId));
	}

	if (filters.search) {
		const searchTerm = `%${filters.search}%`;
		conditions.push(
			or(
				ilike(cases.caseNumber, searchTerm),
				ilike(cases.ssaClaimNumber, searchTerm),
			)!,
		);
	}

	const offset = (pagination.page - 1) * pagination.pageSize;

	const [caseRows, totalResult] = await Promise.all([
		db
			.select({
				id: cases.id,
				caseNumber: cases.caseNumber,
				status: cases.status,
				currentStageId: cases.currentStageId,
				stageName: caseStages.name,
				stageCode: caseStages.code,
				stageGroupId: caseStages.stageGroupId,
				stageGroupName: caseStageGroups.name,
				stageGroupColor: caseStageGroups.color,
				ssaOffice: cases.ssaOffice,
				createdAt: cases.createdAt,
				updatedAt: cases.updatedAt,
			})
			.from(cases)
			.leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
			.leftJoin(
				caseStageGroups,
				eq(caseStages.stageGroupId, caseStageGroups.id),
			)
			.where(and(...conditions))
			.orderBy(desc(cases.updatedAt))
			.limit(pagination.pageSize)
			.offset(offset),
		db
			.select({ total: count() })
			.from(cases)
			.where(and(...conditions)),
	]);

	// Get primary contacts for these cases
	const caseIds = caseRows.map((c) => c.id);
	const primaryContacts =
		caseIds.length > 0
			? await db
					.select({
						caseId: caseContacts.caseId,
						firstName: contacts.firstName,
						lastName: contacts.lastName,
						relationship: caseContacts.relationship,
					})
					.from(caseContacts)
					.innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
					.where(
						and(
							inArray(caseContacts.caseId, caseIds),
							eq(caseContacts.isPrimary, true),
						),
					)
			: [];

	// Get primary assignments for these cases
	const assignments =
		caseIds.length > 0
			? await db
					.select({
						caseId: caseAssignments.caseId,
						userId: caseAssignments.userId,
						role: caseAssignments.role,
						firstName: users.firstName,
						lastName: users.lastName,
					})
					.from(caseAssignments)
					.innerJoin(users, eq(caseAssignments.userId, users.id))
					.where(
						and(
							inArray(caseAssignments.caseId, caseIds),
							eq(caseAssignments.isPrimary, true),
							isNull(caseAssignments.unassignedAt),
						),
					)
			: [];

	// Prefer claimant contacts; fall back to any primary contact
	const contactMap = new Map<
		string,
		{ firstName: string; lastName: string }
	>();
	for (const c of primaryContacts) {
		const existing = contactMap.get(c.caseId);
		if (!existing || c.relationship === "claimant") {
			contactMap.set(c.caseId, {
				firstName: c.firstName,
				lastName: c.lastName,
			});
		}
	}
	const assignmentMap = new Map<
		string,
		{ userId: string; firstName: string; lastName: string; role: string }[]
	>();
	for (const a of assignments) {
		if (!assignmentMap.has(a.caseId)) assignmentMap.set(a.caseId, []);
		assignmentMap.get(a.caseId)!.push(a);
	}

	const enrichedCases = caseRows.map((c) => ({
		...c,
		claimant: contactMap.get(c.id) ?? null,
		assignedStaff: assignmentMap.get(c.id) ?? [],
	}));

	return {
		cases: enrichedCases,
		total: totalResult[0]?.total ?? 0,
		page: pagination.page,
		pageSize: pagination.pageSize,
	};
}

/**
 * Get a single case by ID with full details.
 */
export async function getCaseById(id: string) {
	const session = await requireSession();

	const [caseRow] = await db
		.select({
			id: cases.id,
			caseNumber: cases.caseNumber,
			status: cases.status,
			currentStageId: cases.currentStageId,
			stageEnteredAt: cases.stageEnteredAt,
			stageName: caseStages.name,
			stageCode: caseStages.code,
			stageGroupId: caseStages.stageGroupId,
			stageGroupName: caseStageGroups.name,
			stageGroupColor: caseStageGroups.color,
			ssnEncrypted: cases.ssnEncrypted,
			dateOfBirth: cases.dateOfBirth,
			ssaClaimNumber: cases.ssaClaimNumber,
			ssaOffice: cases.ssaOffice,
			applicationTypePrimary: cases.applicationTypePrimary,
			applicationTypeSecondary: cases.applicationTypeSecondary,
			allegedOnsetDate: cases.allegedOnsetDate,
			dateLastInsured: cases.dateLastInsured,
			hearingOffice: cases.hearingOffice,
			adminLawJudge: cases.adminLawJudge,
			chronicleClaimantId: cases.chronicleClaimantId,
			chronicleUrl: cases.chronicleUrl,
			chronicleLastSyncAt: cases.chronicleLastSyncAt,
			caseStatusExternalId: cases.caseStatusExternalId,
			closedAt: cases.closedAt,
			closedReason: cases.closedReason,
			createdAt: cases.createdAt,
			updatedAt: cases.updatedAt,
		})
		.from(cases)
		.leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
		.leftJoin(
			caseStageGroups,
			eq(caseStages.stageGroupId, caseStageGroups.id),
		)
		.where(
			and(
				eq(cases.id, id),
				eq(cases.organizationId, session.organizationId),
				isNull(cases.deletedAt),
			),
		)
		.limit(1);

	if (!caseRow) return null;

	// Get primary contact
	const [primaryContact] = await db
		.select({
			contactId: contacts.id,
			firstName: contacts.firstName,
			lastName: contacts.lastName,
			email: contacts.email,
			phone: contacts.phone,
			address: contacts.address,
			city: contacts.city,
			state: contacts.state,
			zip: contacts.zip,
		})
		.from(caseContacts)
		.innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
		.where(
			and(
				eq(caseContacts.caseId, id),
				eq(caseContacts.isPrimary, true),
				eq(caseContacts.relationship, "claimant"),
			),
		)
		.limit(1);

	// Get assignments
	const assignedStaff = await db
		.select({
			id: caseAssignments.id,
			userId: caseAssignments.userId,
			role: caseAssignments.role,
			isPrimary: caseAssignments.isPrimary,
			firstName: users.firstName,
			lastName: users.lastName,
			avatarUrl: users.avatarUrl,
			team: users.team,
		})
		.from(caseAssignments)
		.innerJoin(users, eq(caseAssignments.userId, users.id))
		.where(
			and(
				eq(caseAssignments.caseId, id),
				isNull(caseAssignments.unassignedAt),
			),
		);

	// Get stage groups for the progress bar
	const stageGroups = await db
		.select({
			id: caseStageGroups.id,
			name: caseStageGroups.name,
			color: caseStageGroups.color,
			displayOrder: caseStageGroups.displayOrder,
		})
		.from(caseStageGroups)
		.where(eq(caseStageGroups.organizationId, session.organizationId))
		.orderBy(asc(caseStageGroups.displayOrder));

	return {
		...caseRow,
		claimant: primaryContact ?? null,
		assignedStaff,
		stageGroups,
	};
}

/**
 * Create a new case.
 */
export async function createCase(data: {
	firstName: string;
	lastName: string;
	email?: string;
	phone?: string;
	initialStageId: string;
	ssaOffice?: string;
	applicationTypePrimary?: string;
	leadId?: string;
}) {
	const session = await requireSession();

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

	// Create contact
	const [contact] = await db
		.insert(contacts)
		.values({
			organizationId: session.organizationId,
			firstName: data.firstName,
			lastName: data.lastName,
			email: data.email,
			phone: data.phone,
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
			currentStageId: data.initialStageId,
			ssaOffice: data.ssaOffice,
			applicationTypePrimary: data.applicationTypePrimary,
			leadId: data.leadId,
			createdBy: session.id,
			updatedBy: session.id,
		})
		.returning();

	// Link contact to case
	await db.insert(caseContacts).values({
		caseId: newCase.id,
		contactId: contact.id,
		relationship: "claimant",
		isPrimary: true,
	});

	// Log stage transition
	await db.insert(caseStageTransitions).values({
		caseId: newCase.id,
		toStageId: data.initialStageId,
		transitionedBy: session.id,
	});

	// Execute stage workflows
	await executeStageWorkflows(
		newCase.id,
		data.initialStageId,
		session.id,
		session.organizationId,
	);

	logger.info("Case created", { caseId: newCase.id, caseNumber });
	revalidatePath("/cases");
	return newCase;
}

/**
 * Change a case's stage and trigger workflows.
 */
export async function changeCaseStage(data: {
	caseId: string;
	newStageId: string;
	notes?: string;
}) {
	const session = await requireSession();

	const [currentCase] = await db
		.select({ currentStageId: cases.currentStageId })
		.from(cases)
		.where(eq(cases.id, data.caseId));

	if (!currentCase) throw new Error("Case not found");

	// Update case stage
	await db
		.update(cases)
		.set({
			currentStageId: data.newStageId,
			stageEnteredAt: new Date(),
			updatedAt: new Date(),
			updatedBy: session.id,
		})
		.where(eq(cases.id, data.caseId));

	// Log transition
	await db.insert(caseStageTransitions).values({
		caseId: data.caseId,
		fromStageId: currentCase.currentStageId,
		toStageId: data.newStageId,
		transitionedBy: session.id,
		notes: data.notes,
	});

	// Execute workflows for the new stage
	await executeStageWorkflows(
		data.caseId,
		data.newStageId,
		session.id,
		session.organizationId,
	);

	logger.info("Case stage changed", {
		caseId: data.caseId,
		fromStageId: currentCase.currentStageId,
		toStageId: data.newStageId,
	});

	revalidatePath(`/cases/${data.caseId}`);
	revalidatePath("/cases");
	revalidatePath("/queue");
}

/**
 * Update case details.
 */
export async function updateCase(
	id: string,
	data: {
		status?: string;
		ssaClaimNumber?: string;
		ssaOffice?: string;
		chronicleUrl?: string;
		hearingOffice?: string;
		adminLawJudge?: string;
	},
) {
	const session = await requireSession();

	const updateData: Record<string, unknown> = {
		updatedAt: new Date(),
		updatedBy: session.id,
	};

	if (data.status)
		updateData.status = data.status as
			| "active"
			| "on_hold"
			| "closed_won"
			| "closed_lost"
			| "closed_withdrawn";
	if (data.ssaClaimNumber !== undefined)
		updateData.ssaClaimNumber = data.ssaClaimNumber;
	if (data.ssaOffice !== undefined) updateData.ssaOffice = data.ssaOffice;
	if (data.chronicleUrl !== undefined)
		updateData.chronicleUrl = data.chronicleUrl;
	if (data.hearingOffice !== undefined)
		updateData.hearingOffice = data.hearingOffice;
	if (data.adminLawJudge !== undefined)
		updateData.adminLawJudge = data.adminLawJudge;

	await db.update(cases).set(updateData).where(eq(cases.id, id));
	revalidatePath(`/cases/${id}`);
}

/**
 * Assign a staff member to a case.
 */
export async function assignStaffToCase(
	caseId: string,
	userId: string,
	role: string,
	isPrimary = false,
) {
	await db.insert(caseAssignments).values({
		caseId,
		userId,
		role,
		isPrimary,
	});
	revalidatePath(`/cases/${caseId}`);
}

/**
 * Get case activity (stage transitions).
 */
export async function getCaseActivity(caseId: string) {
	const transitions = await db
		.select({
			id: caseStageTransitions.id,
			fromStageId: caseStageTransitions.fromStageId,
			toStageId: caseStageTransitions.toStageId,
			transitionedAt: caseStageTransitions.transitionedAt,
			notes: caseStageTransitions.notes,
			isAutomatic: caseStageTransitions.isAutomatic,
			userName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
		})
		.from(caseStageTransitions)
		.leftJoin(
			users,
			eq(caseStageTransitions.transitionedBy, users.id),
		)
		.where(eq(caseStageTransitions.caseId, caseId))
		.orderBy(desc(caseStageTransitions.transitionedAt));

	return transitions;
}

/**
 * Get counts of cases by stage for dashboard.
 */
export async function getCaseCountsByStage() {
	const session = await requireSession();

	const result = await db
		.select({
			stageId: cases.currentStageId,
			stageName: caseStages.name,
			stageCode: caseStages.code,
			stageGroupName: caseStageGroups.name,
			stageGroupColor: caseStageGroups.color,
			count: count(),
		})
		.from(cases)
		.innerJoin(caseStages, eq(cases.currentStageId, caseStages.id))
		.innerJoin(
			caseStageGroups,
			eq(caseStages.stageGroupId, caseStageGroups.id),
		)
		.where(
			and(
				eq(cases.organizationId, session.organizationId),
				eq(cases.status, "active"),
				isNull(cases.deletedAt),
			),
		)
		.groupBy(
			cases.currentStageId,
			caseStages.name,
			caseStages.code,
			caseStageGroups.name,
			caseStageGroups.color,
		);

	return result;
}

/**
 * Get total active cases count.
 */
export async function getActiveCaseCount() {
	const session = await requireSession();
	const [result] = await db
		.select({ total: count() })
		.from(cases)
		.where(
			and(
				eq(cases.organizationId, session.organizationId),
				eq(cases.status, "active"),
				isNull(cases.deletedAt),
			),
		);
	return result?.total ?? 0;
}
