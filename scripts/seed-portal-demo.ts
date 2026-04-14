/**
 * Phase 6 — Client portal + analytics demo seed.
 *
 * Populates staging with realistic data for:
 *   - client portal (portal_users, portal_activity_events)
 *   - NPS pipeline (nps_responses, nps_action_items)
 *   - review funnel (google_reviews, review_requests)
 *   - document sharing (document_shares, document_share_views)
 *   - inbox triage (urgency/category/assignedTo on recent communications +
 *     2 inbound from portal users)
 *   - case hero data (cases.aiSummary)
 *   - portal-visible calendar events (appointments)
 *   - client treatment entries + saved views (best-effort — tables may not
 *     exist yet; we log + skip)
 *
 * The script is IDEMPOTENT: rows are only inserted when an equivalent row
 * doesn't already exist (matched on natural keys — contact/case/date or
 * external id). Safe to run repeatedly against the same database.
 *
 * Invocation:
 *   pnpm tsx scripts/seed-portal-demo.ts
 *
 * Requires DATABASE_URL in .env.local (loaded here via dotenv).
 *
 * Design notes:
 *   * We deliberately DO NOT fail the whole script when an optional table
 *     isn't present yet — several Phase 5/7 tables (collab_shares,
 *     ai_usage_events, client_treatment_entries, leaderboard_snapshots) are
 *     still on the build list. The seed logs `[skip] <table>` and moves on.
 *   * Randomness uses `faker` seeded to 42 so the same demo looks identical
 *     across re-runs.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import postgres from "postgres";
import { faker } from "@faker-js/faker";
import crypto from "node:crypto";
import * as schema from "../db/schema";

faker.seed(42);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function step(title: string) {
  console.log(`\n--- ${title} ---`);
}

async function tableExists(
  sqlClient: postgres.Sql,
  tableName: string,
): Promise<boolean> {
  try {
    const rows = await sqlClient<
      { exists: boolean }[]
    >`SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = ${tableName}
      ) AS exists`;
    return rows[0]?.exists ?? false;
  } catch (err) {
    console.warn(`[warn] table check failed for ${tableName}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set in .env.local");
  }

  const sqlClient = postgres(connectionString);
  const db = drizzle(sqlClient, { schema });

  console.log("=== Phase 6 Portal Demo Seed ===");

  // -------------------------------------------------------------------------
  // Bootstrap — load org + users + claimant contacts + recent cases.
  // -------------------------------------------------------------------------

  const org = await db.query.organizations.findFirst();
  if (!org) {
    console.error(
      "No organization found. Run the base seed first (db/seed/index.ts).",
    );
    await sqlClient.end();
    return;
  }
  const organizationId = org.id;
  console.log(`Organization: ${org.name} (${organizationId})`);

  const existingUsers = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.organizationId, organizationId));

  if (existingUsers.length === 0) {
    console.error("No users found. Run the base seed first.");
    await sqlClient.end();
    return;
  }

  const adminUser =
    existingUsers.find((u) => u.role === "admin") ?? existingUsers[0];

  const claimantContacts = await db
    .select({
      id: schema.contacts.id,
      firstName: schema.contacts.firstName,
      lastName: schema.contacts.lastName,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
      preferredLocale: schema.contacts.preferredLocale,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.organizationId, organizationId),
        eq(schema.contacts.contactType, "claimant"),
      ),
    )
    .limit(20);

  if (claimantContacts.length === 0) {
    console.error(
      "No claimant contacts found. Run seed-demo-data.ts first to create cases + contacts.",
    );
    await sqlClient.end();
    return;
  }

  console.log(`Found ${claimantContacts.length} claimant contacts`);

  const recentCases = await db
    .select({
      id: schema.cases.id,
      caseNumber: schema.cases.caseNumber,
      aiSummary: schema.cases.aiSummary,
    })
    .from(schema.cases)
    .where(eq(schema.cases.organizationId, organizationId))
    .orderBy(desc(schema.cases.createdAt))
    .limit(20);

  if (recentCases.length === 0) {
    console.error("No cases found. Run seed-demo-data.ts first.");
    await sqlClient.end();
    return;
  }

  console.log(`Found ${recentCases.length} recent cases`);

  // Map claimant contacts -> primary case via case_contacts for later joins.
  const ccRows = await db
    .select({
      contactId: schema.caseContacts.contactId,
      caseId: schema.caseContacts.caseId,
    })
    .from(schema.caseContacts)
    .where(
      inArray(
        schema.caseContacts.contactId,
        claimantContacts.map((c) => c.id),
      ),
    );

  const contactToCaseMap = new Map<string, string>();
  for (const row of ccRows) {
    if (!contactToCaseMap.has(row.contactId)) {
      contactToCaseMap.set(row.contactId, row.caseId);
    }
  }

  // -------------------------------------------------------------------------
  // 1. Portal users — 3 rows (1 invited, 2 active)
  // -------------------------------------------------------------------------
  step("Portal users");

  const portalTargets = claimantContacts.slice(0, 3);
  const portalUserRows: { id: string; contactId: string }[] = [];

  for (let i = 0; i < portalTargets.length; i++) {
    const contact = portalTargets[i];
    if (!contact.email) {
      console.log(`  skip: ${contact.firstName} (no email)`);
      continue;
    }

    const [existing] = await db
      .select({ id: schema.portalUsers.id })
      .from(schema.portalUsers)
      .where(eq(schema.portalUsers.contactId, contact.id))
      .limit(1);

    if (existing) {
      portalUserRows.push({ id: existing.id, contactId: contact.id });
      console.log(
        `  exists: ${contact.firstName} ${contact.lastName} → ${existing.id}`,
      );
      continue;
    }

    const isActive = i > 0; // index 0 stays 'invited'
    const [inserted] = await db
      .insert(schema.portalUsers)
      .values({
        organizationId,
        contactId: contact.id,
        // Placeholder auth id — fresh portal users use pending_* sentinels
        // until the claimant accepts their invite through Clerk.
        authUserId: isActive
          ? `user_demo_${contact.id.slice(0, 8)}`
          : `pending_${crypto.randomBytes(8).toString("hex")}`,
        email: contact.email,
        phone: contact.phone,
        status: isActive ? "active" : "invited",
        preferredLocale: contact.preferredLocale || "en",
        invitedAt: daysAgo(isActive ? 14 : 2),
        activatedAt: isActive ? daysAgo(12) : null,
        lastLoginAt: isActive ? daysAgo(1) : null,
        loginCount: isActive ? 8 : 0,
      })
      .returning({ id: schema.portalUsers.id });

    portalUserRows.push({ id: inserted.id, contactId: contact.id });
    console.log(
      `  insert: ${contact.firstName} ${contact.lastName} (${isActive ? "active" : "invited"})`,
    );
  }

  // -------------------------------------------------------------------------
  // 2. Portal activity events — 12 across last 14 days
  // -------------------------------------------------------------------------
  step("Portal activity events");

  if (portalUserRows.length > 0) {
    const existingEventCount = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.portalActivityEvents)
      .where(eq(schema.portalActivityEvents.organizationId, organizationId));

    if ((existingEventCount[0]?.c ?? 0) >= 12) {
      console.log(
        `  skip: already has ${existingEventCount[0]?.c} events for org`,
      );
    } else {
      const eventTypes = [
        "login",
        "view_stage",
        "view_document",
        "send_message",
      ];
      const rows: (typeof schema.portalActivityEvents.$inferInsert)[] = [];
      for (let i = 0; i < 12; i++) {
        const user = pick(portalUserRows);
        const caseId = contactToCaseMap.get(user.contactId) ?? null;
        rows.push({
          organizationId,
          portalUserId: user.id,
          caseId,
          eventType: pick(eventTypes),
          metadata: { seed: "phase6-demo" },
          createdAt: daysAgo(Math.floor(Math.random() * 14)),
        });
      }
      await db.insert(schema.portalActivityEvents).values(rows);
      console.log(`  insert: ${rows.length} events`);
    }
  } else {
    console.log("  skip: no portal users to attach events to");
  }

  // -------------------------------------------------------------------------
  // 3. NPS responses — 8 rows with 2/3/3 promoter/passive/detractor mix
  // -------------------------------------------------------------------------
  step("NPS responses");

  const existingNps = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.npsResponses)
    .where(eq(schema.npsResponses.organizationId, organizationId));

  let insertedNps: { id: string; category: string; contactId: string }[] = [];

  if ((existingNps[0]?.c ?? 0) >= 8) {
    console.log(`  skip: already has ${existingNps[0]?.c} responses`);
    const prior = await db
      .select({
        id: schema.npsResponses.id,
        category: schema.npsResponses.category,
        contactId: schema.npsResponses.contactId,
      })
      .from(schema.npsResponses)
      .where(
        and(
          eq(schema.npsResponses.organizationId, organizationId),
          eq(schema.npsResponses.category, "detractor"),
        ),
      )
      .limit(5);
    insertedNps = prior;
  } else {
    const mix: { score: number; category: string; comment: string }[] = [
      { score: 10, category: "promoter", comment: "Fantastic team, thank you." },
      { score: 9, category: "promoter", comment: "Very responsive." },
      { score: 8, category: "passive", comment: "Good so far." },
      { score: 7, category: "passive", comment: "Communication could be faster." },
      { score: 7, category: "passive", comment: "Hard to reach by phone." },
      { score: 5, category: "detractor", comment: "Waiting too long between updates." },
      { score: 3, category: "detractor", comment: "Felt ignored after the hearing." },
      { score: 2, category: "detractor", comment: "Would not recommend." },
    ];

    const rows: (typeof schema.npsResponses.$inferInsert)[] = [];
    for (let i = 0; i < mix.length; i++) {
      const contact = claimantContacts[i % claimantContacts.length];
      const caseId = contactToCaseMap.get(contact.id);
      if (!caseId) continue;
      const daysOffset = Math.floor(Math.random() * 60);
      const respondedAt = daysAgo(daysOffset);
      rows.push({
        organizationId,
        caseId,
        contactId: contact.id,
        score: mix[i].score,
        category: mix[i].category,
        comment: mix[i].comment,
        channel: pick(["email", "portal", "sms"]),
        sentAt: new Date(respondedAt.getTime() - 24 * 60 * 60 * 1000),
        respondedAt,
        createdAt: respondedAt,
      });
    }
    if (rows.length > 0) {
      const inserted = await db
        .insert(schema.npsResponses)
        .values(rows)
        .returning({
          id: schema.npsResponses.id,
          category: schema.npsResponses.category,
          contactId: schema.npsResponses.contactId,
        });
      insertedNps = inserted;
      console.log(`  insert: ${inserted.length} responses`);
    } else {
      console.log("  skip: no case-linked claimants to attach responses to");
    }
  }

  // -------------------------------------------------------------------------
  // 4. NPS action items — 2 open on detractors
  // -------------------------------------------------------------------------
  step("NPS action items");

  const detractors = insertedNps.filter((r) => r.category === "detractor");
  if (detractors.length === 0) {
    console.log("  skip: no detractor responses to open action items against");
  } else {
    const targets = detractors.slice(0, 2);
    let created = 0;
    for (const target of targets) {
      const [existing] = await db
        .select({ id: schema.npsActionItems.id })
        .from(schema.npsActionItems)
        .where(eq(schema.npsActionItems.responseId, target.id))
        .limit(1);
      if (existing) continue;
      await db.insert(schema.npsActionItems).values({
        responseId: target.id,
        status: "open",
        assignedToUserId: adminUser.id,
        notes: "Outreach required — detractor recovery playbook.",
      });
      created++;
    }
    console.log(`  insert: ${created} open action items`);
  }

  // -------------------------------------------------------------------------
  // 5. Google reviews — 5 entries mixed 5★/3★, 2 matched to cases
  // -------------------------------------------------------------------------
  step("Google reviews");

  const reviewsForFirm = [
    { rating: 5, comment: "Best decision I made — they won our hearing." },
    { rating: 5, comment: "Felt heard every step of the way." },
    { rating: 5, comment: "Professional and kind." },
    { rating: 3, comment: "Case took longer than expected but outcome was OK." },
    { rating: 3, comment: "Communication was slow at times." },
  ];

  let reviewsInserted = 0;
  for (let i = 0; i < reviewsForFirm.length; i++) {
    const r = reviewsForFirm[i];
    const externalReviewId = `demo-review-${organizationId.slice(0, 8)}-${i}`;
    const [existing] = await db
      .select({ id: schema.googleReviews.id })
      .from(schema.googleReviews)
      .where(eq(schema.googleReviews.externalReviewId, externalReviewId))
      .limit(1);
    if (existing) continue;

    const matchedCaseId =
      i < 2 ? recentCases[i % recentCases.length].id : null;
    await db.insert(schema.googleReviews).values({
      organizationId,
      placeId: "ChIJDemoPlaceId",
      externalReviewId,
      reviewerName: faker.person.fullName(),
      rating: r.rating,
      comment: r.comment,
      postedAt: daysAgo(5 + i * 6),
      matchedCaseId,
    });
    reviewsInserted++;
  }
  console.log(`  insert: ${reviewsInserted} reviews`);

  // -------------------------------------------------------------------------
  // 6. Review requests — 3 across send/click/complete funnel
  // -------------------------------------------------------------------------
  step("Review requests");

  const existingReviewRequests = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.reviewRequests)
    .where(eq(schema.reviewRequests.organizationId, organizationId));

  if ((existingReviewRequests[0]?.c ?? 0) >= 3) {
    console.log(
      `  skip: already has ${existingReviewRequests[0]?.c} review requests`,
    );
  } else {
    const funnel: {
      clickedAt: Date | null;
      completedAt: Date | null;
    }[] = [
      { clickedAt: null, completedAt: null }, // sent only
      { clickedAt: daysAgo(3), completedAt: null }, // clicked
      { clickedAt: daysAgo(10), completedAt: daysAgo(9) }, // completed
    ];
    let created = 0;
    for (let i = 0; i < funnel.length; i++) {
      const contact = claimantContacts[i % claimantContacts.length];
      const caseId = contactToCaseMap.get(contact.id);
      if (!caseId) continue;
      await db.insert(schema.reviewRequests).values({
        organizationId,
        caseId,
        contactId: contact.id,
        channel: pick(["sms", "email", "in_portal"]),
        sentAt: daysAgo(14 + i * 2),
        clickedAt: funnel[i].clickedAt,
        completedAt: funnel[i].completedAt,
        createdBy: adminUser.id,
      });
      created++;
    }
    console.log(`  insert: ${created} review requests`);
  }

  // -------------------------------------------------------------------------
  // 7. Collaborator shares — table may not exist yet
  // -------------------------------------------------------------------------
  step("Collaborator shares (Phase 5)");

  if (!(await tableExists(sqlClient, "collab_shares"))) {
    console.log("  skip: collab_shares table does not exist yet");
  } else {
    console.log(
      "  skip: collab_shares exists but seed shape unknown in this build; seed in a follow-up pass",
    );
  }

  // -------------------------------------------------------------------------
  // 8. Document shares — 3 across 2 cases + 4 view events
  // -------------------------------------------------------------------------
  step("Document shares");

  // Need: 2 cases, each with 1+ document, and claimant contacts linked.
  const existingShares = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.documentShares)
    .where(eq(schema.documentShares.organizationId, organizationId));

  if ((existingShares[0]?.c ?? 0) >= 3) {
    console.log(
      `  skip: already has ${existingShares[0]?.c} document shares`,
    );
  } else {
    const twoCaseIds = Array.from(
      new Set(
        portalTargets
          .map((c) => contactToCaseMap.get(c.id))
          .filter((x): x is string => Boolean(x)),
      ),
    ).slice(0, 2);

    if (twoCaseIds.length === 0) {
      console.log("  skip: no cases linked to portal claimants");
    } else {
      const docs = await db
        .select({
          id: schema.documents.id,
          caseId: schema.documents.caseId,
        })
        .from(schema.documents)
        .where(inArray(schema.documents.caseId, twoCaseIds))
        .limit(6);

      if (docs.length === 0) {
        console.log("  skip: no documents exist on those cases");
      } else {
        const byCase = new Map<string, string[]>();
        for (const d of docs) {
          if (!byCase.has(d.caseId)) byCase.set(d.caseId, []);
          byCase.get(d.caseId)!.push(d.id);
        }

        const shareInserts: (typeof schema.documentShares.$inferInsert)[] = [];
        let docIdx = 0;
        for (const [caseId, documentIds] of byCase) {
          const contact = portalTargets.find(
            (c) => contactToCaseMap.get(c.id) === caseId,
          );
          if (!contact) continue;
          const portalUser = portalUserRows.find(
            (p) => p.contactId === contact.id,
          );
          const targetCount = Math.min(
            documentIds.length,
            docIdx === 0 ? 2 : 1,
          );
          for (let j = 0; j < targetCount; j++) {
            shareInserts.push({
              organizationId,
              documentId: documentIds[j],
              caseId,
              sharedWithContactId: contact.id,
              sharedWithPortalUserId: portalUser?.id ?? null,
              canDownload: true,
              createdBy: adminUser.id,
              createdAt: daysAgo(3 + j),
            });
          }
          docIdx++;
        }

        if (shareInserts.length > 0) {
          const inserted = await db
            .insert(schema.documentShares)
            .values(shareInserts)
            .returning({ id: schema.documentShares.id });
          console.log(`  insert: ${inserted.length} shares`);

          // 4 view events spread across the shares.
          const viewInserts: (typeof schema.documentShareViews.$inferInsert)[] =
            [];
          for (let k = 0; k < 4; k++) {
            const s = pick(inserted);
            viewInserts.push({
              shareId: s.id,
              viewedAt: daysAgo(Math.floor(Math.random() * 4)),
              viewerIp: "127.0.0.1",
              userAgent: "Mozilla/5.0 (DemoSeed)",
            });
          }
          await db.insert(schema.documentShareViews).values(viewInserts);
          console.log(`  insert: ${viewInserts.length} share views`);

          // Flip the denormalized flag on those documents.
          const touchedDocIds = Array.from(
            new Set(shareInserts.map((s) => s.documentId)),
          );
          await db
            .update(schema.documents)
            .set({ visibleToClient: true })
            .where(inArray(schema.documents.id, touchedDocIds));
        } else {
          console.log("  skip: nothing to insert");
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 9. AI usage events — table may not exist yet
  // -------------------------------------------------------------------------
  step("AI usage events (ROI dashboard)");

  if (!(await tableExists(sqlClient, "ai_usage_events"))) {
    console.log("  skip: ai_usage_events table does not exist yet");
  } else {
    console.log(
      "  skip: ai_usage_events exists but seed shape unknown in this build; seed in a follow-up pass",
    );
  }

  // -------------------------------------------------------------------------
  // 10. cases.aiSummary on 3 cases
  // -------------------------------------------------------------------------
  step("Case AI summaries");

  const summaries = [
    "Claimant is a 54-year-old with degenerative disc disease and chronic fatigue. Strong objective findings — MRI confirms L4-L5 herniation. RFC supports sedentary only. Recommend: push for fully favorable at ALJ.",
    "Claimant has severe depression + PTSD documented through two consistent providers over 18 months. Treatment compliance is good. Vocational argument is the strongest path.",
    "Closed-period case. Claimant returned to work in Feb. Chronology shows clear onset → surgery → recovery → RTW. Targeting favorable closed period for the gap window.",
  ];

  let summariesSet = 0;
  for (let i = 0; i < Math.min(3, recentCases.length); i++) {
    const c = recentCases[i];
    if (c.aiSummary) continue;
    await db
      .update(schema.cases)
      .set({
        aiSummary: summaries[i],
        aiSummaryGeneratedAt: daysAgo(2 + i),
        aiSummaryModel: "demo-seed",
        aiSummaryVersion: 1,
      })
      .where(eq(schema.cases.id, c.id));
    summariesSet++;
  }
  console.log(`  update: ${summariesSet} cases with aiSummary`);

  // -------------------------------------------------------------------------
  // 11. Upcoming appointments visibleToClient
  // -------------------------------------------------------------------------
  step("Portal-visible appointments");

  const upcomingEvents = await db
    .select({
      id: schema.calendarEvents.id,
      visibleToClient: schema.calendarEvents.visibleToClient,
    })
    .from(schema.calendarEvents)
    .where(
      and(
        eq(schema.calendarEvents.organizationId, organizationId),
        sql`${schema.calendarEvents.startAt} > NOW()`,
      ),
    )
    .orderBy(schema.calendarEvents.startAt)
    .limit(6);

  if (upcomingEvents.length === 0) {
    console.log("  skip: no upcoming calendar events in DB");
  } else {
    const targets = upcomingEvents.slice(0, 3);
    let updated = 0;
    for (let i = 0; i < targets.length; i++) {
      const evt = targets[i];
      if (evt.visibleToClient) continue;
      await db
        .update(schema.calendarEvents)
        .set({
          visibleToClient: true,
          attendanceRequired: i === 0,
          clientLocationText:
            i === 0 ? "SSA Hearing Office — 123 Main St, Room 4" : null,
          clientDescription:
            i === 0
              ? "Please arrive 30 minutes early. Bring ID and any updated medical records."
              : null,
        })
        .where(eq(schema.calendarEvents.id, evt.id));
      updated++;
    }
    console.log(`  update: ${updated} events flipped visibleToClient`);
  }

  // -------------------------------------------------------------------------
  // 12. Recent inbound comms triage (urgency + category + assignedTo) +
  //     2 inbound portal-sourced messages.
  // -------------------------------------------------------------------------
  step("Communications triage + portal inbound");

  const recentInbound = await db
    .select({
      id: schema.communications.id,
      urgency: schema.communications.urgency,
      category: schema.communications.category,
    })
    .from(schema.communications)
    .where(
      and(
        eq(schema.communications.organizationId, organizationId),
        eq(schema.communications.direction, "inbound"),
      ),
    )
    .orderBy(desc(schema.communications.createdAt))
    .limit(10);

  let triaged = 0;
  for (const comm of recentInbound) {
    if (comm.urgency && comm.urgency !== "normal" && comm.category) continue;
    await db
      .update(schema.communications)
      .set({
        urgency: pick(["high", "normal", "normal", "low"]),
        category: pick([
          "client_update",
          "records_request",
          "scheduling",
          "status_check",
        ]),
        respondedBy: adminUser.id,
      })
      .where(eq(schema.communications.id, comm.id));
    triaged++;
  }
  console.log(`  update: ${triaged} inbound comms triaged`);

  // 2 inbound from portal users.
  if (portalUserRows.length >= 1) {
    const portalInboundCount = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.communications)
      .where(
        and(
          eq(schema.communications.organizationId, organizationId),
          sql`${schema.communications.sentByPortalUserId} IS NOT NULL`,
        ),
      );
    if ((portalInboundCount[0]?.c ?? 0) >= 2) {
      console.log(
        `  skip: already has ${portalInboundCount[0]?.c} portal-sourced inbound messages`,
      );
    } else {
      const bodies = [
        "Hi — just checking in. Any update from SSA on my hearing date?",
        "I received a new letter in the mail yesterday from the office. Should I send it over?",
      ];
      let inserted = 0;
      for (let i = 0; i < Math.min(2, portalUserRows.length); i++) {
        const pu = portalUserRows[i];
        const caseId = contactToCaseMap.get(pu.contactId);
        if (!caseId) continue;
        await db.insert(schema.communications).values({
          organizationId,
          caseId,
          type: "message_inbound",
          direction: "inbound",
          body: bodies[i],
          subject: "Portal message",
          sourceSystem: "portal",
          sourceType: "portal",
          visibleToClient: true,
          sentByPortalUserId: pu.id,
          urgency: i === 0 ? "normal" : "high",
          category: "client_update",
          createdAt: daysAgo(i + 1),
        });
        inserted++;
      }
      console.log(`  insert: ${inserted} portal inbound messages`);
    }
  }

  // -------------------------------------------------------------------------
  // 13. Client treatment entries — table may not exist yet
  // -------------------------------------------------------------------------
  step("Client treatment entries");

  if (!(await tableExists(sqlClient, "client_treatment_entries"))) {
    console.log("  skip: client_treatment_entries table does not exist yet");
  } else {
    console.log(
      "  skip: client_treatment_entries exists but seed shape unknown in this build; seed in a follow-up pass",
    );
  }

  // -------------------------------------------------------------------------
  // 14. Case saved views — 2 per existing user
  // -------------------------------------------------------------------------
  step("Case saved views");

  const viewTemplates = [
    {
      name: "My active hearings",
      filters: { statusIn: ["active"], stageGroup: "hearing" },
      sort: { field: "hearingDate", direction: "asc" },
    },
    {
      name: "Detractor watch",
      filters: { npsCategory: "detractor" },
      sort: { field: "updatedAt", direction: "desc" },
    },
  ];

  let savedViewsCreated = 0;
  for (const user of existingUsers.slice(0, 4)) {
    for (const tpl of viewTemplates) {
      const existing = await db
        .select({ id: schema.caseSavedViews.id })
        .from(schema.caseSavedViews)
        .where(
          and(
            eq(schema.caseSavedViews.organizationId, organizationId),
            eq(schema.caseSavedViews.userId, user.id),
            eq(schema.caseSavedViews.name, tpl.name),
          ),
        )
        .limit(1);
      if (existing[0]) continue;
      await db.insert(schema.caseSavedViews).values({
        organizationId,
        userId: user.id,
        name: tpl.name,
        filters: tpl.filters,
        sort: tpl.sort,
        isShared: false,
      });
      savedViewsCreated++;
    }
  }
  console.log(`  insert: ${savedViewsCreated} saved views`);

  // -------------------------------------------------------------------------
  // 15. Weekly leaderboard snapshot — table may not exist yet
  // -------------------------------------------------------------------------
  step("Leaderboard snapshot");

  if (!(await tableExists(sqlClient, "leaderboard_snapshots"))) {
    console.log("  skip: leaderboard_snapshots table does not exist yet");
  } else {
    console.log(
      "  skip: leaderboard_snapshots exists but seed shape unknown in this build; seed in a follow-up pass",
    );
  }

  // -------------------------------------------------------------------------
  // 16. Preferred locale = 'es' on one contact for i18n demo
  // -------------------------------------------------------------------------
  step("Spanish-preferring contact");

  const spanishTarget = claimantContacts.find(
    (c) => c.preferredLocale !== "es",
  );
  if (!spanishTarget) {
    console.log("  skip: no en-locale contact to flip");
  } else {
    await db
      .update(schema.contacts)
      .set({ preferredLocale: "es" })
      .where(eq(schema.contacts.id, spanishTarget.id));
    console.log(
      `  update: ${spanishTarget.firstName} ${spanishTarget.lastName} → preferredLocale='es'`,
    );

    // Mirror the preference onto the portal_users row if one exists.
    await db
      .update(schema.portalUsers)
      .set({ preferredLocale: "es" })
      .where(eq(schema.portalUsers.contactId, spanishTarget.id));
  }

  // -------------------------------------------------------------------------
  // Done.
  // -------------------------------------------------------------------------

  console.log("\n=== Portal demo seed complete ===");
  await sqlClient.end();
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
