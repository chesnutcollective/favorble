"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  leads,
  users,
  caseAssignments,
  providerCredentials,
  rfcRequests,
  contacts,
  caseContacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { encrypt } from "@/lib/encryption";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * The five color-coded Medical Records teams. These are UI labels — they
 * are stored in cases.mrTeamColor as free-form text. Kept non-exported
 * because "use server" files can only export async functions (Next 16+).
 */
const MR_TEAM_COLORS = [
  "blue",
  "orange",
  "green",
  "yellow",
  "purple",
] as const;

export type MrTeamColor = (typeof MR_TEAM_COLORS)[number];

export type MrQueueRow = {
  caseId: string;
  caseNumber: string;
  claimant: string;
  hearingDate: string | null;
  daysUntil: number | null;
  mrStatus: string;
  assignedTeamColor: string | null;
  mrSpecialistName: string | null;
};

export type ProviderCredentialRow = {
  id: string;
  providerName: string;
  label: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  hasTotp: boolean;
  createdAt: string;
};

export type ProviderCredentialGroup = {
  providerName: string;
  credentials: ProviderCredentialRow[];
};

export type RfcTrackerRow = {
  id: string;
  caseId: string;
  claimant: string;
  caseNumber: string;
  rfcStatus: "not_requested" | "requested" | "received" | "completed";
  rfcProvider: string | null;
  rfcDueDate: string | null;
  requestedAt: string | null;
  receivedAt: string | null;
};

export type TeamWorkloadRow = {
  color: string;
  totalCases: number;
  urgent: number;
  complete: number;
};

/**
 * Cases with upcoming hearings (within 60 days) where MR collection is
 * not yet complete. Sorted by hearing date ascending. Hearings come from
 * calendarEvents.eventType === "hearing".
 */
export async function getMrQueue(): Promise<MrQueueRow[]> {
  const session = await requireSession();

  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 60);

  const rows = await db
    .select({
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
      hearingDate: cases.hearingDate,
      mrStatus: cases.mrStatus,
      mrTeamColor: cases.mrTeamColor,
      specialistFirstName: users.firstName,
      specialistLastName: users.lastName,
    })
    .from(cases)
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .leftJoin(
      caseAssignments,
      and(
        eq(caseAssignments.caseId, cases.id),
        eq(caseAssignments.role, "medical_records"),
        isNull(caseAssignments.unassignedAt),
      ),
    )
    .leftJoin(users, eq(caseAssignments.userId, users.id))
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
        eq(cases.status, "active"),
        gte(cases.hearingDate, now),
        lte(cases.hearingDate, horizon),
      ),
    );

  const filtered = rows.filter(
    (r) => r.hearingDate && r.mrStatus !== "complete",
  );

  // For cases where leads didn't provide a name, fall back to primary
  // contact from case_contacts -> contacts (Chronicle-imported cases).
  const caseIdsWithoutLeadName = filtered
    .filter((r) => !r.firstName && !r.lastName)
    .map((r) => r.caseId);

  const contactNameMap = new Map<
    string,
    { firstName: string; lastName: string }
  >();
  if (caseIdsWithoutLeadName.length > 0) {
    const contactRows = await db
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
          inArray(caseContacts.caseId, caseIdsWithoutLeadName),
          eq(caseContacts.isPrimary, true),
        ),
      );
    for (const c of contactRows) {
      const existing = contactNameMap.get(c.caseId);
      if (!existing || c.relationship === "claimant") {
        contactNameMap.set(c.caseId, {
          firstName: c.firstName,
          lastName: c.lastName,
        });
      }
    }
  }

  return filtered
    .map((r) => {
      const hearing = r.hearingDate ? new Date(r.hearingDate) : null;
      const daysUntil = hearing
        ? Math.ceil(
            (hearing.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;
      let claimant: string;
      if (r.firstName || r.lastName) {
        claimant =
          r.firstName && r.lastName
            ? `${r.firstName} ${r.lastName}`
            : (r.firstName ?? r.lastName ?? "Unknown claimant");
      } else {
        const contact = contactNameMap.get(r.caseId);
        claimant = contact
          ? `${contact.firstName} ${contact.lastName}`.trim()
          : "Unknown claimant";
      }
      const specialistName =
        r.specialistFirstName && r.specialistLastName
          ? `${r.specialistFirstName} ${r.specialistLastName}`
          : null;
      return {
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        claimant,
        hearingDate: hearing ? hearing.toISOString() : null,
        daysUntil,
        mrStatus: r.mrStatus ?? "not_started",
        assignedTeamColor: r.mrTeamColor ?? null,
        mrSpecialistName: specialistName,
      } satisfies MrQueueRow;
    })
    .sort((a, b) => {
      if (!a.hearingDate) return 1;
      if (!b.hearingDate) return -1;
      return a.hearingDate.localeCompare(b.hearingDate);
    });
}

/**
 * List active provider portal credentials for the current org. Grouped by
 * provider name. NEVER returns decrypted values.
 */
export async function getProviderCredentials(): Promise<
  ProviderCredentialGroup[]
> {
  const session = await requireSession();

  const rows = await db
    .select({
      id: providerCredentials.id,
      providerName: providerCredentials.providerName,
      label: providerCredentials.label,
      isActive: providerCredentials.isActive,
      lastUsedAt: providerCredentials.lastUsedAt,
      totpSecretEncrypted: providerCredentials.totpSecretEncrypted,
      createdAt: providerCredentials.createdAt,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.organizationId, session.organizationId))
    .orderBy(
      asc(providerCredentials.providerName),
      desc(providerCredentials.createdAt),
    );

  const groups = new Map<string, ProviderCredentialGroup>();
  for (const row of rows) {
    const key = row.providerName;
    if (!groups.has(key)) {
      groups.set(key, { providerName: key, credentials: [] });
    }
    groups.get(key)?.credentials.push({
      id: row.id,
      providerName: row.providerName,
      label: row.label,
      isActive: row.isActive,
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      hasTotp: row.totpSecretEncrypted !== null,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return Array.from(groups.values());
}

/**
 * Create a new provider portal credential. Username / password / TOTP are
 * encrypted at rest with AES-256-GCM before storage.
 */
export async function addProviderCredential(data: {
  provider: string;
  label: string;
  username: string;
  password: string;
  totpSecret?: string;
}) {
  const session = await requireSession();

  if (!data.provider.trim() || !data.username.trim() || !data.password.trim()) {
    throw new Error("Provider, username, and password are required");
  }

  const [credential] = await db
    .insert(providerCredentials)
    .values({
      organizationId: session.organizationId,
      providerName: data.provider.trim(),
      label: data.label.trim() || null,
      usernameEncrypted: encrypt(data.username),
      passwordEncrypted: encrypt(data.password),
      totpSecretEncrypted: data.totpSecret?.trim()
        ? encrypt(data.totpSecret.trim())
        : null,
      createdBy: session.id,
    })
    .returning({ id: providerCredentials.id });

  logger.info("Provider credential created", {
    credentialId: credential.id,
    provider: data.provider,
  });
  revalidatePath("/medical-records");
  return credential;
}

/**
 * List RFC requests for the current org for the tracker view.
 */
export async function getRfcTracker(): Promise<RfcTrackerRow[]> {
  const session = await requireSession();

  const rows = await db
    .select({
      id: rfcRequests.id,
      caseId: rfcRequests.caseId,
      caseNumber: cases.caseNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
      status: rfcRequests.status,
      providerName: rfcRequests.providerName,
      dueDate: rfcRequests.dueDate,
      requestedAt: rfcRequests.requestedAt,
      receivedAt: rfcRequests.receivedAt,
    })
    .from(rfcRequests)
    .innerJoin(cases, eq(rfcRequests.caseId, cases.id))
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .where(eq(rfcRequests.organizationId, session.organizationId))
    .orderBy(asc(rfcRequests.dueDate), desc(rfcRequests.createdAt));

  // Fall back to case_contacts -> contacts for Chronicle-imported cases
  const rfcCaseIdsWithoutLeadName = rows
    .filter((r) => !r.firstName && !r.lastName)
    .map((r) => r.caseId);

  const rfcContactNameMap = new Map<
    string,
    { firstName: string; lastName: string }
  >();
  if (rfcCaseIdsWithoutLeadName.length > 0) {
    const contactRows = await db
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
          inArray(caseContacts.caseId, rfcCaseIdsWithoutLeadName),
          eq(caseContacts.isPrimary, true),
        ),
      );
    for (const c of contactRows) {
      const existing = rfcContactNameMap.get(c.caseId);
      if (!existing || c.relationship === "claimant") {
        rfcContactNameMap.set(c.caseId, {
          firstName: c.firstName,
          lastName: c.lastName,
        });
      }
    }
  }

  return rows.map((r) => {
    let claimant: string;
    if (r.firstName || r.lastName) {
      claimant =
        r.firstName && r.lastName
          ? `${r.firstName} ${r.lastName}`
          : (r.firstName ?? r.lastName ?? "Unknown claimant");
    } else {
      const contact = rfcContactNameMap.get(r.caseId);
      claimant = contact
        ? `${contact.firstName} ${contact.lastName}`.trim()
        : "Unknown claimant";
    }
    return {
      id: r.id,
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      claimant,
      rfcStatus: r.status,
      rfcProvider: r.providerName,
      rfcDueDate: r.dueDate ? r.dueDate.toISOString() : null,
      requestedAt: r.requestedAt ? r.requestedAt.toISOString() : null,
      receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
    };
  });
}

/**
 * Aggregate workload per Medical Records color team. Returns a row for
 * every known team color, even when zero cases are assigned.
 */
export async function getTeamWorkload(): Promise<TeamWorkloadRow[]> {
  const session = await requireSession();

  const now = new Date();
  const urgentHorizon = new Date();
  urgentHorizon.setDate(urgentHorizon.getDate() + 7);

  const rows = await db
    .select({
      caseId: cases.id,
      mrTeamColor: cases.mrTeamColor,
      mrStatus: cases.mrStatus,
      hearingDate: cases.hearingDate,
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
        eq(cases.status, "active"),
      ),
    );

  const counters = new Map<string, TeamWorkloadRow>();
  for (const color of MR_TEAM_COLORS) {
    counters.set(color, { color, totalCases: 0, urgent: 0, complete: 0 });
  }

  for (const row of rows) {
    const color = row.mrTeamColor;
    if (!color || !counters.has(color)) continue;
    const bucket = counters.get(color);
    if (!bucket) continue;
    bucket.totalCases += 1;
    if (row.mrStatus === "complete") {
      bucket.complete += 1;
    }
    if (row.hearingDate) {
      const hearing = new Date(row.hearingDate);
      if (hearing <= urgentHorizon && row.mrStatus !== "complete") {
        bucket.urgent += 1;
      }
    }
  }

  return MR_TEAM_COLORS.map(
    (color) =>
      counters.get(color) ?? {
        color,
        totalCases: 0,
        urgent: 0,
        complete: 0,
      },
  );
}
