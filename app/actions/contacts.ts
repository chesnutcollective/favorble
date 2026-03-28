"use server";

import { db } from "@/db/drizzle";
import { contacts, caseContacts } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, isNull, ilike, or, sql, count } from "drizzle-orm";

export type ContactFilters = {
	search?: string;
	contactType?: string;
};

export type ContactPagination = {
	page: number;
	pageSize: number;
};

/**
 * Get paginated contacts with filters.
 */
export async function getContacts(
	filters: ContactFilters = {},
	pagination: ContactPagination = { page: 1, pageSize: 50 },
) {
	const session = await requireSession();
	const conditions = [
		eq(contacts.organizationId, session.organizationId),
		isNull(contacts.deletedAt),
	];

	if (filters.contactType) {
		conditions.push(eq(contacts.contactType, filters.contactType));
	}

	if (filters.search) {
		const searchTerm = `%${filters.search}%`;
		conditions.push(
			or(
				ilike(contacts.firstName, searchTerm),
				ilike(contacts.lastName, searchTerm),
				ilike(contacts.email, searchTerm),
			)!,
		);
	}

	const offset = (pagination.page - 1) * pagination.pageSize;

	const [contactRows, totalResult] = await Promise.all([
		db
			.select({
				id: contacts.id,
				firstName: contacts.firstName,
				lastName: contacts.lastName,
				email: contacts.email,
				phone: contacts.phone,
				contactType: contacts.contactType,
				createdAt: contacts.createdAt,
				caseCount: sql<number>`cast(count(${caseContacts.id}) as int)`,
			})
			.from(contacts)
			.leftJoin(caseContacts, eq(contacts.id, caseContacts.contactId))
			.where(and(...conditions))
			.groupBy(
				contacts.id,
				contacts.firstName,
				contacts.lastName,
				contacts.email,
				contacts.phone,
				contacts.contactType,
				contacts.createdAt,
			)
			.orderBy(contacts.lastName, contacts.firstName)
			.limit(pagination.pageSize)
			.offset(offset),
		db
			.select({ total: count() })
			.from(contacts)
			.where(and(...conditions)),
	]);

	return {
		contacts: contactRows,
		total: totalResult[0]?.total ?? 0,
		page: pagination.page,
		pageSize: pagination.pageSize,
	};
}
