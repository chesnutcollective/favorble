import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import {
  contacts,
  caseContacts,
  cases,
  caseStages,
  communications,
  documents,
  auditLog,
  medicalChronologyEntries,
  calendarEvents,
  users,
} from "@/db/schema";
import { eq, and, isNull, inArray, desc, gte, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

// ─── Data fetchers ───────────────────────────────────────────────

async function getContact(contactId: string, organizationId: string) {
  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.organizationId, organizationId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getContactCases(contactId: string) {
  return db
    .select({
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      status: cases.status,
      stageName: caseStages.name,
      stageColor: caseStages.color,
      relationship: caseContacts.relationship,
      isPrimary: caseContacts.isPrimary,
      updatedAt: cases.updatedAt,
      createdAt: cases.createdAt,
      allegedOnsetDate: cases.allegedOnsetDate,
      hearingOffice: cases.hearingOffice,
    })
    .from(caseContacts)
    .innerJoin(cases, eq(caseContacts.caseId, cases.id))
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .where(eq(caseContacts.contactId, contactId))
    .limit(50);
}

async function getCaseClaimantNames(caseIds: string[]) {
  if (caseIds.length === 0) return new Map<string, string>();
  const rows = await db
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
        eq(caseContacts.relationship, "claimant"),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.caseId, `${r.firstName} ${r.lastName}`);
  }
  return map;
}

async function getRecentComms(caseIds: string[]) {
  if (caseIds.length === 0) return [];
  return db
    .select({
      id: communications.id,
      caseId: communications.caseId,
      type: communications.type,
      direction: communications.direction,
      subject: communications.subject,
      body: communications.body,
      fromAddress: communications.fromAddress,
      toAddress: communications.toAddress,
      createdAt: communications.createdAt,
    })
    .from(communications)
    .where(inArray(communications.caseId, caseIds))
    .orderBy(desc(communications.createdAt))
    .limit(5);
}

async function getRecentDocs(caseIds: string[], organizationId: string) {
  if (caseIds.length === 0) return [];
  return db
    .select({
      id: documents.id,
      caseId: documents.caseId,
      fileName: documents.fileName,
      fileType: documents.fileType,
      category: documents.category,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        inArray(documents.caseId, caseIds),
        eq(documents.organizationId, organizationId),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(6);
}

async function getRecentActivity(contactId: string, organizationId: string) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      createdAt: auditLog.createdAt,
      userId: auditLog.userId,
      changes: auditLog.changes,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityId, contactId),
        eq(auditLog.entityType, "contact"),
        eq(auditLog.organizationId, organizationId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(8);
}

async function getMedicalEntries(contactName: string, caseIds: string[]) {
  if (caseIds.length === 0) return [];
  return db
    .select({
      id: medicalChronologyEntries.id,
      caseId: medicalChronologyEntries.caseId,
      summary: medicalChronologyEntries.summary,
      providerName: medicalChronologyEntries.providerName,
      eventDate: medicalChronologyEntries.eventDate,
      entryType: medicalChronologyEntries.entryType,
    })
    .from(medicalChronologyEntries)
    .where(
      and(
        inArray(medicalChronologyEntries.caseId, caseIds),
        sql`lower(${medicalChronologyEntries.providerName}) = lower(${contactName})`,
      ),
    )
    .orderBy(desc(medicalChronologyEntries.eventDate))
    .limit(8);
}

async function getUpcomingEvents(caseIds: string[], organizationId: string) {
  if (caseIds.length === 0) return [];
  return db
    .select({
      id: calendarEvents.id,
      caseId: calendarEvents.caseId,
      title: calendarEvents.title,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      location: calendarEvents.location,
    })
    .from(calendarEvents)
    .where(
      and(
        inArray(calendarEvents.caseId, caseIds),
        eq(calendarEvents.organizationId, organizationId),
        gte(calendarEvents.startAt, new Date()),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .orderBy(calendarEvents.startAt)
    .limit(5);
}

async function getUserMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  const map = new Map<string, string>();
  for (const u of rows) {
    map.set(u.id, `${u.firstName} ${u.lastName}`);
  }
  return map;
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(
  d: Date | null | undefined,
  style: "short" | "long" = "short",
) {
  if (!d) return "";
  if (style === "long") {
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateMono(d: Date | null | undefined) {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(text: string | null | undefined, max: number) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

function getSubtitle(contact: { contactType: string; metadata: unknown }) {
  const meta = (contact.metadata ?? {}) as Record<string, string>;
  switch (contact.contactType) {
    case "claimant":
      return "Claimant \u2014 Social Security Disability";
    case "medical_provider":
      return meta.specialty
        ? `${meta.specialty} \u2014 Medical Provider`
        : "Medical Provider";
    case "attorney":
      return meta.firm ? `Attorney \u2014 ${meta.firm}` : "Attorney";
    case "ssa_office":
      return "Social Security Administration";
    case "expert":
      return "Vocational Expert";
    default:
      return formatType(contact.contactType);
  }
}

function getFileTypeColor(fileType: string) {
  const ft = fileType.toLowerCase();
  if (ft.includes("pdf"))
    return { bg: "rgba(238,0,0,0.08)", color: "#EE0000", label: "PDF" };
  if (ft.includes("doc") || ft.includes("docx"))
    return { bg: "rgba(0,112,243,0.08)", color: "#0070F3", label: "DOC" };
  if (ft.includes("xls") || ft.includes("xlsx") || ft.includes("csv"))
    return { bg: "rgba(0,200,83,0.10)", color: "#059669", label: "XLS" };
  if (
    ft.includes("png") ||
    ft.includes("jpg") ||
    ft.includes("jpeg") ||
    ft.includes("gif")
  )
    return { bg: "rgba(168,85,247,0.10)", color: "#8B5CF6", label: "IMG" };
  return { bg: "#F0F0F0", color: "#999", label: ft.slice(0, 3).toUpperCase() };
}

function getActivityColor(action: string) {
  if (action.includes("create") || action.includes("add")) return "#10B981";
  if (action.includes("update") || action.includes("edit")) return "#0070F3";
  if (action.includes("delete") || action.includes("remove")) return "#EE0000";
  if (action.includes("assign")) return "#F5A623";
  return "#999";
}

// ─── Bio generator ───────────────────────────────────────────────

function generateBio(
  contact: { contactType: string; firstName: string; metadata: unknown },
  linkedCases: {
    caseId: string;
    stageName: string | null;
    status: string;
    relationship: string;
  }[],
) {
  const meta = (contact.metadata ?? {}) as Record<string, string>;
  const caseCount = linkedCases.length;
  const activeCases = linkedCases.filter((c) => c.status === "active");
  const currentStage = activeCases[0]?.stageName;

  switch (contact.contactType) {
    case "claimant": {
      const parts = [`${contact.firstName} is a claimant`];
      if (caseCount === 1) {
        parts[0] += " with 1 associated case";
      } else if (caseCount > 1) {
        parts[0] += ` with ${caseCount} associated cases`;
      }
      if (currentStage) {
        parts[0] += `, currently in the ${currentStage} stage`;
      }
      parts[0] += ".";
      return parts.join(" ");
    }
    case "medical_provider": {
      const patientCount = new Set(linkedCases.map((c) => c.caseId)).size;
      const parts = [`${contact.firstName} is a medical provider`];
      if (meta.specialty) parts[0] += ` specializing in ${meta.specialty}`;
      parts[0] += `, associated with ${patientCount} ${patientCount === 1 ? "patient case" : "patient cases"}.`;
      return parts.join(" ");
    }
    case "attorney": {
      const parts = [`${contact.firstName} is an attorney`];
      if (meta.firm) parts[0] += ` at ${meta.firm}`;
      parts[0] += `, linked to ${caseCount} ${caseCount === 1 ? "case" : "cases"}.`;
      return parts.join(" ");
    }
    case "ssa_office": {
      return `This SSA office is associated with ${caseCount} ${caseCount === 1 ? "case" : "cases"} in the system.`;
    }
    case "expert": {
      const hearingCases = linkedCases.filter((c) =>
        c.stageName?.toLowerCase().includes("hearing"),
      );
      return `${contact.firstName} is a vocational expert associated with ${caseCount} ${caseCount === 1 ? "case" : "cases"}${hearingCases.length > 0 ? `, including ${hearingCases.length} at the hearing level` : ""}.`;
    }
    default:
      return `${contact.firstName} is associated with ${caseCount} ${caseCount === 1 ? "case" : "cases"}.`;
  }
}

// ─── Page ────────────────────────────────────────────────────────

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: contactId } = await params;
  const user = await requireSession();

  // Fetch contact first — needed for downstream queries
  let contact: Awaited<ReturnType<typeof getContact>> | null = null;
  try {
    contact = await getContact(contactId, user.organizationId);
  } catch {
    // DB error
  }
  if (!contact) notFound();

  // Fetch associated cases (needed before we can query comms, docs, etc.)
  let linkedCases: Awaited<ReturnType<typeof getContactCases>> = [];
  try {
    linkedCases = await getContactCases(contactId);
  } catch {
    // ignore
  }

  const caseIds = linkedCases.map((c) => c.caseId);
  const fullName = `${contact.firstName} ${contact.lastName}`;
  const initials =
    `${contact.firstName[0] ?? ""}${contact.lastName[0] ?? ""}`.toUpperCase();
  const isProvider = contact.contactType === "medical_provider";

  // Parallel fetch all secondary data
  let claimantNames = new Map<string, string>();
  let recentComms: Awaited<ReturnType<typeof getRecentComms>> = [];
  let recentDocs: Awaited<ReturnType<typeof getRecentDocs>> = [];
  let activityLog: Awaited<ReturnType<typeof getRecentActivity>> = [];
  let medEntries: Awaited<ReturnType<typeof getMedicalEntries>> = [];
  let upcomingEvents: Awaited<ReturnType<typeof getUpcomingEvents>> = [];

  const fetchers: Promise<void>[] = [
    getCaseClaimantNames(caseIds)
      .then((r) => {
        claimantNames = r;
      })
      .catch(() => {}),
    getRecentComms(caseIds)
      .then((r) => {
        recentComms = r;
      })
      .catch(() => {}),
    getRecentDocs(caseIds, user.organizationId)
      .then((r) => {
        recentDocs = r;
      })
      .catch(() => {}),
    getRecentActivity(contactId, user.organizationId)
      .then((r) => {
        activityLog = r;
      })
      .catch(() => {}),
    getUpcomingEvents(caseIds, user.organizationId)
      .then((r) => {
        upcomingEvents = r;
      })
      .catch(() => {}),
  ];

  if (isProvider) {
    fetchers.push(
      getMedicalEntries(fullName, caseIds)
        .then((r) => {
          medEntries = r;
        })
        .catch(() => {}),
    );
  }

  await Promise.all(fetchers);

  // Resolve user names for activity log
  let userMap = new Map<string, string>();
  const auditUserIds = activityLog
    .map((a) => a.userId)
    .filter((id): id is string => id !== null);
  if (auditUserIds.length > 0) {
    try {
      userMap = await getUserMap(auditUserIds);
    } catch {
      // ignore
    }
  }

  // Build a caseId→caseNumber map for linking
  const caseNumberMap = new Map<string, string>();
  for (const c of linkedCases) {
    caseNumberMap.set(c.caseId, c.caseNumber);
  }

  const subtitle = getSubtitle(contact);
  const bio = generateBio(contact, linkedCases);
  const locationParts = [contact.city, contact.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      {/* ── HERO HEADER ── */}
      <div
        style={{
          background: "linear-gradient(180deg, #FAFAFA 0%, #F0FDF4 100%)",
          borderBottom: "1px solid #EAEAEA",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "32px 32px 24px",
            display: "flex",
            alignItems: "flex-start",
            gap: 24,
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 96,
              height: 96,
              minWidth: 96,
              borderRadius: "50%",
              backgroundColor: "#1C1C1E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 600,
              color: "#FFFFFF",
              letterSpacing: "-0.5px",
            }}
          >
            {initials}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.5px",
                lineHeight: 1.2,
                color: "#171717",
                margin: 0,
              }}
            >
              {fullName}
            </h1>
            <p style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              {subtitle}
            </p>

            {/* Contact pills */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    background: "#FFFFFF",
                    border: "1px solid #EAEAEA",
                    borderRadius: 999,
                    fontSize: 12,
                    color: "#666",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.6 }}>&#9993;</span>
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    background: "#FFFFFF",
                    border: "1px solid #EAEAEA",
                    borderRadius: 999,
                    fontSize: 12,
                    color: "#666",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.6 }}>&#9742;</span>
                  {contact.phone}
                </a>
              )}
              {locationParts && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    background: "#FFFFFF",
                    border: "1px solid #EAEAEA",
                    borderRadius: 999,
                    fontSize: 12,
                    color: "#666",
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.6 }}>&#9906;</span>
                  {locationParts}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              paddingTop: 6,
            }}
          >
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 18px",
                  background: "#10B981",
                  color: "#FFFFFF",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "none",
                  borderRadius: 6,
                  textDecoration: "none",
                }}
              >
                Send Email
              </a>
            )}
            <Link
              href={`/contacts/${contactId}/edit`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 18px",
                background: "transparent",
                color: "#666",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid #EAEAEA",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              Edit
            </Link>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "32px 32px 120px",
        }}
      >
        {/* ── BIO SECTION ── */}
        <div
          style={{
            marginBottom: 32,
            padding: 24,
            background: "#FFFFFF",
            border: "1px solid #EAEAEA",
            borderRadius: 8,
          }}
        >
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: "#555",
              maxWidth: 700,
              margin: 0,
            }}
          >
            {bio}
          </p>
        </div>

        {/* ── ASSOCIATED CASES ── */}
        {linkedCases.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "#171717",
                    margin: 0,
                  }}
                >
                  Associated Cases
                </h2>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 999,
                    background: "rgba(16,185,129,0.10)",
                    color: "#059669",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {linkedCases.length}
                </span>
              </div>
              <Link
                href="/cases"
                style={{
                  fontSize: 13,
                  color: "#10B981",
                  textDecoration: "none",
                }}
              >
                View all &rarr;
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {linkedCases.map((c) => {
                const claimant = claimantNames.get(c.caseId);
                // For claimant contacts, show stage as primary label; for others show claimant name
                const cardLabel =
                  contact.contactType === "claimant"
                    ? (c.stageName ?? "Unknown Stage")
                    : (claimant ?? c.caseNumber);

                return (
                  <Link
                    key={c.caseId}
                    href={`/cases/${c.caseId}`}
                    style={{
                      display: "block",
                      background: "#FFFFFF",
                      border: "1px solid #EAEAEA",
                      borderRadius: 8,
                      padding: 16,
                      textDecoration: "none",
                      color: "inherit",
                      transition: "all 200ms ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: 12,
                            fontFamily: "var(--font-mono, monospace)",
                            color: "#999",
                          }}
                        >
                          {c.caseNumber}
                        </span>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#171717",
                            marginTop: 2,
                          }}
                        >
                          {cardLabel}
                        </div>
                      </div>
                      {c.stageName && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background:
                              c.status === "active"
                                ? "rgba(16,185,129,0.10)"
                                : "#F0F0F0",
                            color: c.status === "active" ? "#059669" : "#999",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.stageName}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color: "#999",
                          border: "1px solid #EAEAEA",
                          borderRadius: 4,
                          padding: "1px 6px",
                        }}
                      >
                        {formatType(c.relationship)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono, monospace)",
                          color: "#999",
                        }}
                      >
                        {formatDateMono(c.updatedAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── UPCOMING EVENTS ── */}
        {upcomingEvents.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "#171717",
                    margin: 0,
                  }}
                >
                  Upcoming Events
                </h2>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 999,
                    background: "rgba(16,185,129,0.10)",
                    color: "#059669",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {upcomingEvents.length}
                </span>
              </div>
              <Link
                href="/calendar"
                style={{
                  fontSize: 13,
                  color: "#10B981",
                  textDecoration: "none",
                }}
              >
                View all &rarr;
              </Link>
            </div>

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #EAEAEA",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {upcomingEvents.map((ev, i) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "12px 20px",
                    borderBottom:
                      i < upcomingEvents.length - 1
                        ? "1px solid #EAEAEA"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#10B981",
                      boxShadow: "0 0 0 4px rgba(16,185,129,0.10)",
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      minWidth: 90,
                      fontSize: 12,
                      fontFamily: "var(--font-mono, monospace)",
                      color: "#999",
                    }}
                  >
                    {formatDate(ev.startAt)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#171717",
                      }}
                    >
                      {ev.title}
                    </span>
                    {ev.location && (
                      <span
                        style={{ fontSize: 12, color: "#999", marginLeft: 8 }}
                      >
                        {ev.location}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: "rgba(16,185,129,0.10)",
                      color: "#059669",
                    }}
                  >
                    {formatType(ev.eventType)}
                  </span>
                  {ev.caseId && caseNumberMap.has(ev.caseId) && (
                    <Link
                      href={`/cases/${ev.caseId}`}
                      style={{
                        fontSize: 11,
                        color: "#10B981",
                        textDecoration: "none",
                      }}
                    >
                      {caseNumberMap.get(ev.caseId)}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RECENT DOCUMENTS ── */}
        {recentDocs.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "#171717",
                    margin: 0,
                  }}
                >
                  Recent Documents
                </h2>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 999,
                    background: "rgba(16,185,129,0.10)",
                    color: "#059669",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {recentDocs.length}
                </span>
              </div>
              <Link
                href="/documents"
                style={{
                  fontSize: 13,
                  color: "#10B981",
                  textDecoration: "none",
                }}
              >
                View all &rarr;
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              {recentDocs.map((doc) => {
                const ft = getFileTypeColor(doc.fileType);
                return (
                  <div
                    key={doc.id}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #EAEAEA",
                      borderRadius: 8,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono, monospace)",
                        marginBottom: 12,
                        background: ft.bg,
                        color: ft.color,
                      }}
                    >
                      {ft.label}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#171717",
                        marginBottom: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {doc.fileName}
                    </div>
                    <div style={{ fontSize: 12, color: "#999" }}>
                      {doc.category ? formatType(doc.category) : doc.fileType}{" "}
                      &middot; {formatDateMono(doc.createdAt)}
                    </div>
                    {doc.caseId && caseNumberMap.has(doc.caseId) && (
                      <Link
                        href={`/cases/${doc.caseId}`}
                        style={{
                          fontSize: 11,
                          color: "#10B981",
                          textDecoration: "none",
                          marginTop: 4,
                          display: "inline-block",
                        }}
                      >
                        {caseNumberMap.get(doc.caseId)}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── COMMUNICATION HISTORY ── */}
        {recentComms.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "#171717",
                    margin: 0,
                  }}
                >
                  Communication History
                </h2>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 999,
                    background: "rgba(16,185,129,0.10)",
                    color: "#059669",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {recentComms.length}
                </span>
              </div>
            </div>

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #EAEAEA",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {recentComms.map((comm, i) => {
                const isOutbound =
                  comm.direction === "outbound" || comm.direction === "sent";
                return (
                  <div
                    key={comm.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "14px 20px",
                      borderBottom:
                        i < recentComms.length - 1
                          ? "1px solid #EAEAEA"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        color: isOutbound ? "#10B981" : "#0070F3",
                        fontWeight: 600,
                        minWidth: 20,
                        paddingTop: 1,
                      }}
                    >
                      {isOutbound ? "\u2192" : "\u2190"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#171717",
                          marginBottom: 2,
                        }}
                      >
                        {comm.subject || formatType(comm.type)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#999",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {truncate(comm.body, 120)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono, monospace)",
                          color: "#999",
                        }}
                      >
                        {formatDateMono(comm.createdAt)}
                      </span>
                      {comm.caseId && caseNumberMap.has(comm.caseId) && (
                        <Link
                          href={`/cases/${comm.caseId}`}
                          style={{
                            fontSize: 11,
                            color: "#10B981",
                            textDecoration: "none",
                          }}
                        >
                          {caseNumberMap.get(comm.caseId)}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MEDICAL CHRONOLOGY (providers only) ── */}
        {isProvider && medEntries.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "#171717",
                    margin: 0,
                  }}
                >
                  Medical Chronology
                </h2>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 999,
                    background: "rgba(16,185,129,0.10)",
                    color: "#059669",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {medEntries.length}
                </span>
              </div>
            </div>

            <div
              style={{
                position: "relative",
                paddingLeft: 24,
              }}
            >
              {/* Timeline line */}
              <div
                style={{
                  position: "absolute",
                  left: 7,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  background: "#EAEAEA",
                  borderRadius: 1,
                }}
              />

              {medEntries.map((entry) => {
                const dotColor =
                  entry.entryType === "office_visit"
                    ? "#0070F3"
                    : entry.entryType === "surgery"
                      ? "#10B981"
                      : entry.entryType === "hospitalization"
                        ? "#EE0000"
                        : "#999";
                return (
                  <div
                    key={entry.id}
                    style={{
                      position: "relative",
                      padding: "8px 0",
                      paddingLeft: 12,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -14,
                        top: 12,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        border: "2px solid #FAFAFA",
                        background: dotColor,
                      }}
                    />
                    <div
                      style={{
                        minWidth: 80,
                        fontSize: 12,
                        fontFamily: "var(--font-mono, monospace)",
                        color: "#999",
                        paddingTop: 2,
                      }}
                    >
                      {formatDateMono(entry.eventDate)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#171717",
                        }}
                      >
                        {truncate(entry.summary, 100)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "1px 7px",
                          borderRadius: 999,
                          marginLeft: 6,
                          background:
                            entry.entryType === "office_visit"
                              ? "rgba(0,112,243,0.08)"
                              : entry.entryType === "surgery"
                                ? "rgba(16,185,129,0.10)"
                                : "#F0F0F0",
                          color:
                            entry.entryType === "office_visit"
                              ? "#0070F3"
                              : entry.entryType === "surgery"
                                ? "#059669"
                                : "#999",
                        }}
                      >
                        {formatType(entry.entryType)}
                      </span>
                    </div>
                    {entry.caseId && caseNumberMap.has(entry.caseId) && (
                      <Link
                        href={`/cases/${entry.caseId}`}
                        style={{
                          fontSize: 11,
                          color: "#10B981",
                          textDecoration: "none",
                          flexShrink: 0,
                        }}
                      >
                        {caseNumberMap.get(entry.caseId)}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── RECENT ACTIVITY ── */}
        {activityLog.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "#171717",
                    margin: 0,
                  }}
                >
                  Recent Activity
                </h2>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 999,
                    background: "rgba(16,185,129,0.10)",
                    color: "#059669",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {activityLog.length}
                </span>
              </div>
            </div>

            <div
              style={{
                position: "relative",
                paddingLeft: 24,
              }}
            >
              {/* Timeline line */}
              <div
                style={{
                  position: "absolute",
                  left: 7,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  background: "#EAEAEA",
                  borderRadius: 1,
                }}
              />

              {activityLog.map((entry) => {
                const dotColor = getActivityColor(entry.action);
                const actorName = entry.userId
                  ? (userMap.get(entry.userId) ?? "System")
                  : "System";
                return (
                  <div
                    key={entry.id}
                    style={{
                      position: "relative",
                      padding: "8px 0",
                      paddingLeft: 12,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -14,
                        top: 12,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        border: "2px solid #FAFAFA",
                        background: dotColor,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#171717",
                        }}
                      >
                        {formatType(entry.action)}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "#999",
                          marginLeft: 8,
                        }}
                      >
                        by {actorName}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono, monospace)",
                        color: "#999",
                        flexShrink: 0,
                      }}
                    >
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CONTACT NOTES (placeholder) ── */}
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.2px",
                color: "#171717",
                margin: 0,
              }}
            >
              Contact Notes
            </h2>
          </div>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #EAEAEA",
              borderRadius: 8,
              padding: "40px 20px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "#999", margin: 0 }}>
              No notes yet
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
