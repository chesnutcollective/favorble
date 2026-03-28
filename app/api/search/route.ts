import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { cases, contacts, caseContacts, tasks, caseStages } from "@/db/schema";
import { eq, and, isNull, ilike, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
	const session = await requireSession();
	const q = request.nextUrl.searchParams.get("q")?.trim();

	if (!q || q.length < 2) {
		return NextResponse.json({ cases: [], contacts: [], tasks: [] });
	}

	const pattern = `%${q}%`;

	// Search cases: by case number or claimant name (via join)
	const caseResults = await db
		.select({
			id: cases.id,
			caseNumber: cases.caseNumber,
			status: cases.status,
			stageName: caseStages.name,
			claimantFirstName: contacts.firstName,
			claimantLastName: contacts.lastName,
		})
		.from(cases)
		.leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
		.leftJoin(
			caseContacts,
			and(
				eq(caseContacts.caseId, cases.id),
				eq(caseContacts.isPrimary, true),
				eq(caseContacts.relationship, "claimant"),
			),
		)
		.leftJoin(contacts, eq(caseContacts.contactId, contacts.id))
		.where(
			and(
				eq(cases.organizationId, session.organizationId),
				isNull(cases.deletedAt),
				or(
					ilike(cases.caseNumber, pattern),
					ilike(
						sql`COALESCE(${contacts.firstName}, '') || ' ' || COALESCE(${contacts.lastName}, '')`,
						pattern,
					),
				),
			),
		)
		.limit(5);

	// Search contacts: by name
	const contactResults = await db
		.select({
			id: contacts.id,
			firstName: contacts.firstName,
			lastName: contacts.lastName,
			email: contacts.email,
			contactType: contacts.contactType,
		})
		.from(contacts)
		.where(
			and(
				eq(contacts.organizationId, session.organizationId),
				isNull(contacts.deletedAt),
				or(
					ilike(contacts.firstName, pattern),
					ilike(contacts.lastName, pattern),
					ilike(
						sql`${contacts.firstName} || ' ' || ${contacts.lastName}`,
						pattern,
					),
				),
			),
		)
		.limit(5);

	// Search tasks: by title
	const taskResults = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			status: tasks.status,
			caseId: tasks.caseId,
		})
		.from(tasks)
		.where(
			and(
				eq(tasks.organizationId, session.organizationId),
				isNull(tasks.deletedAt),
				ilike(tasks.title, pattern),
			),
		)
		.limit(5);

	return NextResponse.json({
		cases: caseResults.map((c) => ({
			id: c.id,
			caseNumber: c.caseNumber,
			status: c.status,
			stageName: c.stageName,
			claimantName:
				c.claimantFirstName && c.claimantLastName
					? `${c.claimantFirstName} ${c.claimantLastName}`
					: null,
		})),
		contacts: contactResults.map((c) => ({
			id: c.id,
			name: `${c.firstName} ${c.lastName}`,
			email: c.email,
			contactType: c.contactType,
		})),
		tasks: taskResults.map((t) => ({
			id: t.id,
			title: t.title,
			status: t.status,
			caseId: t.caseId,
		})),
	});
}
