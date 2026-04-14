"use server";

import { db } from "@/db/drizzle";
import { contacts, caseContacts, portalUsers } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  eq,
  and,
  isNull,
  ilike,
  or,
  sql,
  count,
  inArray,
} from "drizzle-orm";
import { sendPortalInvite } from "@/app/actions/portal-invites";
import { logger } from "@/lib/logger/server";

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

export type PortalStatusValue = "never" | "invited" | "active" | "suspended";

/**
 * Portal status for a batch of contact ids. Callers should pass only the
 * ids currently visible on the page so the query stays bounded.
 *
 * Returns a map keyed by contactId. Contacts without a portal_users row
 * map to "never" (i.e. never invited).
 */
export async function getPortalStatusForContacts(
  contactIds: string[],
): Promise<Record<string, PortalStatusValue>> {
  if (contactIds.length === 0) return {};
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        contactId: portalUsers.contactId,
        status: portalUsers.status,
      })
      .from(portalUsers)
      .where(
        and(
          eq(portalUsers.organizationId, session.organizationId),
          inArray(portalUsers.contactId, contactIds),
        ),
      );
    const out: Record<string, PortalStatusValue> = {};
    for (const id of contactIds) out[id] = "never";
    for (const r of rows) {
      const status =
        r.status === "invited"
          ? "invited"
          : r.status === "active"
            ? "active"
            : r.status === "suspended"
              ? "suspended"
              : "never";
      out[r.contactId] = status;
    }
    return out;
  } catch (error) {
    logger.error("contacts: portal status lookup failed", { error });
    return {};
  }
}

export type BulkInviteSummary = {
  total: number;
  sent: number;
  skipped: number;
  errors: Array<{ contactId: string; error: string }>;
};

/**
 * Fire `sendPortalInvite` against N selected contacts sequentially. Returns
 * a summary the UI can surface in a toast. Non-fatal errors are collected —
 * we never throw so the caller always gets a summary.
 */
export async function sendBulkPortalInvites(
  contactIds: string[],
): Promise<BulkInviteSummary> {
  const summary: BulkInviteSummary = {
    total: contactIds.length,
    sent: 0,
    skipped: 0,
    errors: [],
  };
  if (contactIds.length === 0) return summary;

  for (const contactId of contactIds) {
    try {
      const result = await sendPortalInvite(contactId);
      if (result.ok) {
        summary.sent += 1;
      } else {
        summary.skipped += 1;
        summary.errors.push({
          contactId,
          error: result.error ?? "unknown",
        });
      }
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({
        contactId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
