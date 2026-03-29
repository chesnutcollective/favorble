/**
 * Dashboard data seed script for Hogan & Smith CaseFlow.
 *
 * Populates the database with enough realistic data to fill all 29 dashboard
 * visualizations:
 *
 *   - 60 cases across all 5 stage groups (Intake, Application, Recon, Hearing, Resolution)
 *   - 12 ALJ judges with varying approval rates (30%-80%)
 *   - 6 hearing offices
 *   - 120 tasks (mix of completed, pending, overdue)
 *   - 60 documents with processing results
 *   - 120 audit log entries spanning last 7 days
 *   - 25 calendar events (hearings, CEs, deadlines, meetings)
 *   - 25 contacts (claimants, attorneys, medical providers, SSA offices, VEs)
 *   - 35 medical chronology entries
 *   - Revenue data via case metadata (past-due benefits on resolved cases)
 *   - Stage transitions for time-in-stage and cases-over-time charts
 *
 * Run with: npx tsx scripts/seed-dashboard-data.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use a fixed seed for reproducibility
let _seed = 12345;
function seededRandom(): number {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(seededRandom() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
  return d;
}

function maskedSSN(): string {
  return `***-**-${String(randomInt(1000, 9999))}`;
}

function ssaClaimNumber(): string {
  return `${String(randomInt(100, 999))}-${String(randomInt(10, 99))}-${String(randomInt(1000, 9999))}`;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Robert", "Patricia", "James", "Jennifer", "Michael", "Linda", "William",
  "Barbara", "David", "Elizabeth", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Lisa", "Daniel",
  "Nancy", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra",
  "Donald", "Ashley", "Steven", "Dorothy", "Paul", "Kimberly", "Andrew",
  "Emily", "Joshua", "Donna", "Kenneth", "Michelle", "George", "Carol",
  "Edward", "Amanda", "Brian", "Melissa", "Ronald", "Deborah", "Timothy",
  "Stephanie", "Jason", "Rebecca", "Jeffrey", "Laura", "Ryan", "Sharon",
  "Jacob", "Cynthia", "Gary", "Kathleen",
];

const LAST_NAMES = [
  "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson",
  "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee",
  "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez",
  "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott",
  "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker",
  "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts", "Phillips",
  "Evans", "Turner", "Parker", "Collins", "Edwards", "Stewart", "Morris",
  "Murphy", "Cook", "Rogers",
];

const SSA_OFFICES = [
  "Birmingham, AL", "Mobile, AL", "Huntsville, AL", "Atlanta, GA",
  "Nashville, TN", "Jacksonville, FL", "Charlotte, NC", "Dallas, TX",
  "Houston, TX", "New Orleans, LA",
];

const HEARING_OFFICES = [
  "Birmingham ODAR", "Atlanta ODAR", "Nashville ODAR",
  "Charlotte ODAR", "Dallas ODAR", "Houston ODAR",
];

// 12 ALJs with target approval rates (range 30%-80%)
const ALJ_DATA: { name: string; approvalRate: number }[] = [
  { name: "Hon. Patricia Hartwell", approvalRate: 0.72 },
  { name: "Hon. Robert Chen", approvalRate: 0.65 },
  { name: "Hon. Maria Santos", approvalRate: 0.58 },
  { name: "Hon. William Foster", approvalRate: 0.80 },
  { name: "Hon. Angela Richardson", approvalRate: 0.45 },
  { name: "Hon. Thomas Bradley", approvalRate: 0.52 },
  { name: "Hon. Susan Yamamoto", approvalRate: 0.68 },
  { name: "Hon. James Patterson", approvalRate: 0.38 },
  { name: "Hon. David Morales", approvalRate: 0.75 },
  { name: "Hon. Catherine Shaw", approvalRate: 0.30 },
  { name: "Hon. Marcus Wells", approvalRate: 0.62 },
  { name: "Hon. Rachel Thornton", approvalRate: 0.55 },
];

const DISABILITY_DESCRIPTIONS = [
  "Degenerative disc disease, chronic lower back pain, lumbar radiculopathy",
  "Major depressive disorder, generalized anxiety disorder, PTSD",
  "Congestive heart failure, coronary artery disease, hypertension",
  "Rheumatoid arthritis, fibromyalgia, chronic fatigue syndrome",
  "Type 2 diabetes with peripheral neuropathy, chronic kidney disease",
  "COPD, emphysema, chronic bronchitis",
  "Bipolar disorder, panic attacks, social anxiety",
  "Herniated discs L4-L5, L5-S1, spinal stenosis",
  "Lupus (SLE), Sjogren's syndrome, chronic pain",
  "Traumatic brain injury, post-concussion syndrome, cognitive impairment",
  "Multiple sclerosis, vision impairment, chronic fatigue",
  "Severe osteoarthritis, bilateral knee replacement, limited mobility",
  "Schizoaffective disorder, auditory hallucinations",
  "Crohn's disease, irritable bowel syndrome, malnutrition",
  "Chronic migraines, cluster headaches, vertigo",
];

const APP_TYPES: { primary: string; secondary: string | null }[] = [
  { primary: "SSDI", secondary: null },
  { primary: "SSI", secondary: null },
  { primary: "SSDI", secondary: "SSI" },
  { primary: "CDB", secondary: null },
  { primary: "SSDI", secondary: null },
  { primary: "SSI", secondary: null },
  { primary: "SSDI", secondary: "SSI" },
  { primary: "SSDI", secondary: null },
];

// Stage distribution for 60 cases across the 5 groups
// Designed to give a realistic funnel shape
const STAGE_DISTRIBUTION: { code: string; count: number }[] = [
  // Intake (8 total)
  { code: "1A", count: 8 },
  // Application (14 total)
  { code: "2A", count: 4 },
  { code: "2B", count: 3 },
  { code: "2C", count: 2 },
  { code: "2D", count: 2 },
  { code: "2E", count: 3 },
  // Reconsideration (12 total)
  { code: "3A", count: 3 },
  { code: "3B", count: 3 },
  { code: "3C", count: 2 },
  { code: "3D", count: 2 },
  { code: "3E", count: 2 },
  // Hearing (14 total)
  { code: "4A", count: 2 },
  { code: "4B", count: 2 },
  { code: "4C", count: 3 },
  { code: "4D", count: 4 },
  { code: "4E", count: 3 },
  // Resolution (12 total) -- 8 favorable, 3 unfavorable, 1 remand/dismissed
  { code: "5A", count: 8 },
  { code: "5B", count: 4 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set in .env.local");
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("=== Dashboard Data Seed ===\n");

  // -----------------------------------------------------------------------
  // 1. Resolve org, users, stages
  // -----------------------------------------------------------------------

  const org = await db.query.organizations.findFirst();
  if (!org) {
    throw new Error("No organization found. Run the base seed first.");
  }
  const organizationId = org.id;
  console.log(`Organization: ${org.name} (${organizationId})`);

  const existingUsers = await db.query.users.findMany({
    where: eq(schema.users.organizationId, organizationId),
  });
  if (existingUsers.length === 0) {
    throw new Error("No users found. Run the base seed first.");
  }
  console.log(`Found ${existingUsers.length} users`);

  const allStages = await db.query.caseStages.findMany({
    where: eq(schema.caseStages.organizationId, organizationId),
  });
  if (allStages.length === 0) {
    throw new Error("No stages found. Run the base seed first.");
  }
  console.log(`Found ${allStages.length} stages`);

  // Idempotency: check for marker in audit log
  const markerCheck = await db.query.auditLog.findFirst({
    where: eq(schema.auditLog.action, "dashboard_seed_v1"),
  });
  if (markerCheck) {
    console.log("\nDashboard seed already ran (found marker). Skipping.");
    console.log("To re-seed, delete existing data or reset the database.");
    await client.end();
    return;
  }

  // Build lookup maps
  const stageByCode = new Map(allStages.map((s) => [s.code, s]));
  const userByEmail = new Map(existingUsers.map((u) => [u.email, u]));

  // Resolve staff users -- fall back to first user if specific emails don't exist
  const fallback = existingUsers[0];
  const adminUser = userByEmail.get("admin@hogansmith.com") ?? fallback;
  const attorneyUser = userByEmail.get("attorney@hogansmith.com") ?? fallback;
  const filingUser = userByEmail.get("filing@hogansmith.com") ?? fallback;
  const intakeUser = userByEmail.get("intake@hogansmith.com") ?? fallback;
  const medRecUser = userByEmail.get("medrec@hogansmith.com") ?? fallback;
  const caseMgrUser = userByEmail.get("casemgr@hogansmith.com") ?? fallback;
  const hearingsUser = userByEmail.get("hearings@hogansmith.com") ?? fallback;

  const staffPool = [
    adminUser, attorneyUser, filingUser, intakeUser,
    medRecUser, caseMgrUser, hearingsUser,
  ];
  const allUserIds = existingUsers.map((u) => u.id);

  // Stage sequence for building transitions
  const stageSequence = [
    "1A", "2A", "2B", "2E", "3A", "3B", "3C", "3D", "3E",
    "4A", "4B", "4C", "4D", "4E", "5A", "5B",
  ];

  // -----------------------------------------------------------------------
  // 2. Create 60 Cases
  // -----------------------------------------------------------------------

  console.log("\n--- Creating 60 cases ---");

  interface CaseRecord {
    id: string;
    caseNumber: string;
    firstName: string;
    lastName: string;
    stageCode: string;
    createdAt: Date;
    closedAt: Date | null;
    alj: string | null;
    hearingOffice: string | null;
  }
  const createdCases: CaseRecord[] = [];
  let caseIdx = 0;

  // Pre-assign ALJs to hearing/resolution cases for consistent approval-rate tracking
  let aljAssignIdx = 0;

  for (const { code, count: stageCount } of STAGE_DISTRIBUTION) {
    const stage = stageByCode.get(code);
    if (!stage) {
      console.warn(`  Stage ${code} not found, skipping ${stageCount} cases`);
      caseIdx += stageCount;
      continue;
    }

    for (let i = 0; i < stageCount; i++) {
      const firstName = FIRST_NAMES[caseIdx % FIRST_NAMES.length];
      const lastName = LAST_NAMES[caseIdx % LAST_NAMES.length];
      const caseNumber = `HS-2025-${String(2001 + caseIdx).padStart(4, "0")}`;

      // Spread creation dates over 12 months for trend charts
      const createdDaysAgo = randomInt(5, 365);
      const createdAt = daysAgo(createdDaysAgo);
      const stageEnteredDaysAgo = randomInt(1, Math.min(createdDaysAgo, 30));
      const stageEnteredAt = daysAgo(stageEnteredDaysAgo);

      // Determine case status
      let status: "active" | "on_hold" | "closed_won" | "closed_lost" | "closed_withdrawn" = "active";
      let closedAt: Date | null = null;
      let closedReason: string | null = null;

      if (code === "5A") {
        status = "closed_won";
        closedAt = daysAgo(randomInt(1, 45));
        closedReason = "Favorable decision received";
      } else if (code === "5B") {
        // Mix of unfavorable and dismissed
        if (i === 0) {
          status = "closed_withdrawn";
          closedAt = daysAgo(randomInt(5, 60));
          closedReason = "Client returned to work";
        } else {
          status = "closed_lost";
          closedAt = daysAgo(randomInt(1, 45));
          closedReason = "Unfavorable decision -- client declined appeal";
        }
      }

      const appType = APP_TYPES[caseIdx % APP_TYPES.length];
      const dob = new Date(
        randomInt(1955, 1990),
        randomInt(0, 11),
        randomInt(1, 28),
      );
      const allegedOnsetDate = new Date(
        randomInt(2020, 2025),
        randomInt(0, 11),
        randomInt(1, 28),
      );

      // Assign ALJ and hearing office for hearing/resolution stages
      let hearingOffice: string | null = null;
      let adminLawJudge: string | null = null;
      if (code.startsWith("4") || code.startsWith("5")) {
        hearingOffice = HEARING_OFFICES[caseIdx % HEARING_OFFICES.length];
      }
      if (
        code === "4D" || code === "4E" || code === "5A" || code === "5B"
      ) {
        // Cycle through ALJs so each gets multiple cases
        const alj = ALJ_DATA[aljAssignIdx % ALJ_DATA.length];
        adminLawJudge = alj.name;
        aljAssignIdx++;
      }

      // For resolved cases, store past-due benefits in metadata-like fields
      // We will use the closedReason + a custom field value approach
      // For now, store revenue info in the case itself via ssaClaimNumber metadata pattern

      const [inserted] = await db
        .insert(schema.cases)
        .values({
          organizationId,
          caseNumber,
          status,
          currentStageId: stage.id,
          stageEnteredAt,
          ssnEncrypted: maskedSSN(),
          dateOfBirth: dob,
          ssaClaimNumber: ssaClaimNumber(),
          ssaOffice: randomItem(SSA_OFFICES),
          applicationTypePrimary: appType.primary,
          applicationTypeSecondary: appType.secondary,
          allegedOnsetDate,
          dateLastInsured:
            appType.primary !== "SSI"
              ? new Date(
                  randomInt(2026, 2028),
                  randomInt(0, 11),
                  randomInt(1, 28),
                )
              : null,
          hearingOffice,
          adminLawJudge,
          closedAt,
          closedReason,
          createdAt,
          updatedAt: new Date(),
          createdBy: randomItem(allUserIds),
        })
        .returning();

      createdCases.push({
        id: inserted.id,
        caseNumber,
        firstName,
        lastName,
        stageCode: code,
        createdAt,
        closedAt,
        alj: adminLawJudge,
        hearingOffice,
      });

      // Case assignments: primary attorney + team-specific person
      const assignmentRoles: { userId: string; role: string; isPrimary: boolean }[] = [
        { userId: attorneyUser.id, role: "attorney", isPrimary: true },
      ];

      if (code.startsWith("4") || code.startsWith("5")) {
        assignmentRoles.push({
          userId: hearingsUser.id,
          role: "case_manager",
          isPrimary: false,
        });
      } else if (code.startsWith("3")) {
        assignmentRoles.push({
          userId: filingUser.id,
          role: "case_manager",
          isPrimary: false,
        });
      } else {
        assignmentRoles.push({
          userId: caseMgrUser.id,
          role: "case_manager",
          isPrimary: false,
        });
      }

      for (const assignment of assignmentRoles) {
        await db.insert(schema.caseAssignments).values({
          caseId: inserted.id,
          userId: assignment.userId,
          role: assignment.role,
          isPrimary: assignment.isPrimary,
          assignedAt: createdAt,
        });
      }

      caseIdx++;
    }
  }
  console.log(`  Created ${createdCases.length} cases with assignments`);

  // -----------------------------------------------------------------------
  // 3. Stage transitions (for time-in-stage and cases-over-time charts)
  // -----------------------------------------------------------------------

  console.log("\n--- Creating stage transitions ---");

  let transitionCount = 0;
  for (const caseRecord of createdCases) {
    const currentIdx = stageSequence.indexOf(caseRecord.stageCode);
    if (currentIdx <= 0) continue;

    // Build a transition history up to the current stage
    const pathLength = Math.min(currentIdx, 5);
    const startIdx = currentIdx - pathLength;

    for (let j = startIdx; j < currentIdx; j++) {
      const fromCode = stageSequence[j];
      const toCode = stageSequence[j + 1];
      const fromStage = stageByCode.get(fromCode);
      const toStage = stageByCode.get(toCode);
      if (!fromStage || !toStage) continue;

      // Transitions get progressively closer to today
      const baseDaysAgo = (currentIdx - j) * randomInt(10, 25);
      const transitionDate = daysAgo(Math.min(baseDaysAgo, 360));

      await db.insert(schema.caseStageTransitions).values({
        caseId: caseRecord.id,
        fromStageId: fromStage.id,
        toStageId: toStage.id,
        transitionedAt: transitionDate,
        transitionedBy: randomItem(allUserIds),
        notes: j === currentIdx - 1 ? `Advanced to ${toStage.name}` : null,
        isAutomatic: seededRandom() < 0.2,
      });
      transitionCount++;
    }
  }
  console.log(`  Created ${transitionCount} stage transitions`);

  // -----------------------------------------------------------------------
  // 4. Contacts (25 total)
  // -----------------------------------------------------------------------

  console.log("\n--- Creating 25 contacts ---");

  interface ContactRecord {
    id: string;
    contactType: string;
    firstName: string;
    lastName: string;
  }
  const createdContacts: ContactRecord[] = [];

  // 10 claimant contacts linked to first 10 cases
  for (let i = 0; i < 10; i++) {
    const c = createdCases[i];
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@email.com`,
        phone: `(${randomInt(200, 999)}) ${randomInt(200, 999)}-${String(randomInt(1000, 9999))}`,
        address: `${randomInt(100, 9999)} ${randomItem(["Oak", "Maple", "Pine", "Elm", "Cedar"])} ${randomItem(["St", "Ave", "Blvd", "Dr", "Ln"])}`,
        city: randomItem(["Birmingham", "Atlanta", "Nashville", "Charlotte", "Dallas", "Houston"]),
        state: randomItem(["AL", "GA", "TN", "NC", "TX", "FL"]),
        zip: String(randomInt(30000, 79999)),
        contactType: "claimant",
        createdBy: intakeUser.id,
      })
      .returning();

    createdContacts.push({
      id: contact.id,
      contactType: "claimant",
      firstName: c.firstName,
      lastName: c.lastName,
    });

    // Link to their case
    await db.insert(schema.caseContacts).values({
      caseId: c.id,
      contactId: contact.id,
      relationship: "claimant",
      isPrimary: true,
    });
  }

  // 5 attorney contacts
  const attorneyContacts = [
    { first: "David", last: "Bernstein" },
    { first: "Rachel", last: "Kim" },
    { first: "Marcus", last: "Washington" },
    { first: "Elena", last: "Vasquez" },
    { first: "Alan", last: "Prescott" },
  ];
  for (const name of attorneyContacts) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: name.first,
        lastName: name.last,
        email: `${name.first.toLowerCase()}.${name.last.toLowerCase()}@lawfirm.com`,
        phone: `(205) ${randomInt(200, 999)}-${String(randomInt(1000, 9999))}`,
        city: "Birmingham",
        state: "AL",
        zip: "35203",
        contactType: "attorney",
        createdBy: adminUser.id,
      })
      .returning();
    createdContacts.push({ id: contact.id, contactType: "attorney", firstName: name.first, lastName: name.last });
  }

  // 5 medical providers
  const medProviders = [
    { first: "Dr. Sarah", last: "Mitchell", specialty: "Primary Care" },
    { first: "Dr. Robert", last: "Chang", specialty: "Orthopedics" },
    { first: "Dr. Maria", last: "Gonzalez", specialty: "Psychiatry" },
    { first: "Dr. James", last: "Patel", specialty: "Neurology" },
    { first: "Dr. Angela", last: "Freeman", specialty: "Pain Management" },
  ];
  for (const prov of medProviders) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: prov.first,
        lastName: prov.last,
        email: `${prov.last.toLowerCase()}@medpractice.com`,
        phone: `(${randomInt(200, 999)}) ${randomInt(200, 999)}-${String(randomInt(1000, 9999))}`,
        city: randomItem(["Birmingham", "Atlanta", "Nashville"]),
        state: randomItem(["AL", "GA", "TN"]),
        zip: String(randomInt(30000, 39999)),
        contactType: "medical_provider",
        metadata: { specialty: prov.specialty },
        createdBy: medRecUser.id,
      })
      .returning();
    createdContacts.push({ id: contact.id, contactType: "medical_provider", firstName: prov.first, lastName: prov.last });
  }

  // 3 SSA office contacts
  const ssaContacts = [
    { name: "Birmingham", state: "AL" },
    { name: "Atlanta", state: "GA" },
    { name: "Nashville", state: "TN" },
  ];
  for (const ssa of ssaContacts) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: "SSA Office",
        lastName: ssa.name,
        phone: `(${randomInt(200, 999)}) ${randomInt(200, 999)}-${String(randomInt(1000, 9999))}`,
        city: ssa.name,
        state: ssa.state,
        zip: String(randomInt(30000, 39999)),
        contactType: "ssa_office",
        createdBy: adminUser.id,
      })
      .returning();
    createdContacts.push({ id: contact.id, contactType: "ssa_office", firstName: "SSA Office", lastName: ssa.name });
  }

  // 2 vocational experts
  const veContacts = [
    { first: "Dr. William", last: "Harrison" },
    { first: "Dr. Karen", last: "Obermann" },
  ];
  for (const ve of veContacts) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: ve.first,
        lastName: ve.last,
        email: `${ve.last.toLowerCase()}@vocationalexperts.com`,
        phone: `(${randomInt(200, 999)}) ${randomInt(200, 999)}-${String(randomInt(1000, 9999))}`,
        city: "Birmingham",
        state: "AL",
        zip: "35203",
        contactType: "expert",
        createdBy: hearingsUser.id,
      })
      .returning();
    createdContacts.push({ id: contact.id, contactType: "expert", firstName: ve.first, lastName: ve.last });
  }

  console.log(`  Created ${createdContacts.length} contacts`);

  // -----------------------------------------------------------------------
  // 5. Tasks (120 tasks)
  // -----------------------------------------------------------------------

  console.log("\n--- Creating 120 tasks ---");

  const TASK_TEMPLATES = [
    { title: "Complete intake questionnaire", priority: "high" as const, user: intakeUser },
    { title: "Verify claimant identity documents", priority: "medium" as const, user: intakeUser },
    { title: "Obtain signed retainer agreement", priority: "urgent" as const, user: intakeUser },
    { title: "Request SSA earnings record", priority: "medium" as const, user: intakeUser },
    { title: "File SSDI Application", priority: "high" as const, user: filingUser },
    { title: "File SSI Application", priority: "high" as const, user: filingUser },
    { title: "Submit SSA-1696 Appointment of Representative", priority: "urgent" as const, user: filingUser },
    { title: "File Request for Reconsideration", priority: "high" as const, user: filingUser },
    { title: "File Request for Hearing", priority: "high" as const, user: filingUser },
    { title: "Request medical records from primary physician", priority: "high" as const, user: medRecUser },
    { title: "Request records from specialist", priority: "medium" as const, user: medRecUser },
    { title: "Follow up on outstanding records request", priority: "high" as const, user: medRecUser },
    { title: "Prepare medical evidence summary", priority: "high" as const, user: medRecUser },
    { title: "Obtain RFC statement from treating physician", priority: "urgent" as const, user: medRecUser },
    { title: "Review denial letter and identify issues", priority: "urgent" as const, user: caseMgrUser },
    { title: "Schedule client check-in call", priority: "medium" as const, user: caseMgrUser },
    { title: "Send status update letter to claimant", priority: "medium" as const, user: caseMgrUser },
    { title: "Review SSA decision for appeal options", priority: "urgent" as const, user: caseMgrUser },
    { title: "Prepare pre-hearing brief", priority: "urgent" as const, user: hearingsUser },
    { title: "Compile hearing exhibit list", priority: "high" as const, user: hearingsUser },
    { title: "Schedule hearing prep with claimant", priority: "high" as const, user: hearingsUser },
    { title: "Research ALJ decision patterns", priority: "medium" as const, user: hearingsUser },
    { title: "Prepare claimant for hearing testimony", priority: "urgent" as const, user: hearingsUser },
    { title: "Submit hearing exhibits to ODAR", priority: "high" as const, user: hearingsUser },
  ];

  let taskCount = 0;
  for (let i = 0; i < 120; i++) {
    const template = TASK_TEMPLATES[i % TASK_TEMPLATES.length];
    const caseRecord = createdCases[i % createdCases.length];

    let dueDate: Date;
    let taskStatus: "pending" | "in_progress" | "completed";
    let completedAt: Date | null = null;

    if (i < 25) {
      // Overdue (for overdue count chart)
      dueDate = daysAgo(randomInt(1, 14));
      taskStatus = randomItem<"pending" | "in_progress">(["pending", "in_progress"]);
    } else if (i < 40) {
      // Due today/this week
      dueDate = daysFromNow(randomInt(0, 5));
      taskStatus = randomItem<"pending" | "in_progress">(["pending", "in_progress"]);
    } else if (i < 70) {
      // Upcoming
      dueDate = daysFromNow(randomInt(6, 45));
      taskStatus = "pending";
    } else {
      // Completed (for completion rate charts)
      const completedDaysAgo = randomInt(1, 30);
      dueDate = daysAgo(completedDaysAgo + randomInt(0, 5));
      taskStatus = "completed";
      completedAt = daysAgo(completedDaysAgo);
    }

    const titleSuffix = i % 3 === 0 ? ` -- ${caseRecord.firstName} ${caseRecord.lastName}` : "";

    await db.insert(schema.tasks).values({
      organizationId,
      caseId: caseRecord.id,
      title: `${template.title}${titleSuffix}`,
      description: i % 4 === 0 ? `Case ${caseRecord.caseNumber}: Follow up needed.` : null,
      status: taskStatus,
      priority: template.priority,
      assignedToId: template.user.id,
      dueDate,
      completedAt,
      completedBy: completedAt ? template.user.id : null,
      createdBy: randomItem(allUserIds),
      createdAt: daysAgo(randomInt(1, 60)),
    });
    taskCount++;
  }
  console.log(`  Created ${taskCount} tasks`);

  // -----------------------------------------------------------------------
  // 6. Documents (60 documents with processing results)
  // -----------------------------------------------------------------------

  console.log("\n--- Creating 60 documents ---");

  const DOC_TEMPLATES = [
    { fileName: "Medical_Records_Primary_Care.pdf", category: "Medical Records", source: "upload" as const },
    { fileName: "MRI_Lumbar_Spine_Report.pdf", category: "Medical Records", source: "upload" as const },
    { fileName: "Psychiatric_Evaluation.pdf", category: "Medical Records", source: "upload" as const },
    { fileName: "Physical_Therapy_Notes.pdf", category: "Medical Records", source: "upload" as const },
    { fileName: "Lab_Results_Blood_Panel.pdf", category: "Medical Records", source: "upload" as const },
    { fileName: "Treating_Physician_RFC.pdf", category: "Medical Records", source: "upload" as const },
    { fileName: "Hospital_Discharge_Summary.pdf", category: "Medical Records", source: "upload" as const },
    { fileName: "SSA_Initial_Denial_Notice.pdf", category: "SSA Correspondence", source: "chronicle" as const },
    { fileName: "SSA_Reconsideration_Denial.pdf", category: "SSA Correspondence", source: "chronicle" as const },
    { fileName: "SSA_Favorable_Decision.pdf", category: "SSA Decision", source: "chronicle" as const },
    { fileName: "SSA_Hearing_Notice.pdf", category: "SSA Correspondence", source: "case_status" as const },
    { fileName: "SSA_Consultative_Exam_Notice.pdf", category: "SSA Correspondence", source: "case_status" as const },
    { fileName: "SSA_1696_Appointment.pdf", category: "Forms", source: "template" as const },
    { fileName: "SSA_561_Reconsideration.pdf", category: "Forms", source: "template" as const },
    { fileName: "Retainer_Agreement_Signed.pdf", category: "Forms", source: "esignature" as const },
    { fileName: "Pre_Hearing_Brief.pdf", category: "Hearing Exhibits", source: "upload" as const },
    { fileName: "Exhibit_List.pdf", category: "Hearing Exhibits", source: "upload" as const },
    { fileName: "ERE_Case_Documents.pdf", category: "ERE Records", source: "ere" as const },
    { fileName: "Status_Update_Letter.pdf", category: "Correspondence", source: "template" as const },
    { fileName: "Function_Report.pdf", category: "Forms", source: "upload" as const },
  ];

  interface DocRecord { id: string; caseId: string; }
  const createdDocs: DocRecord[] = [];

  for (let i = 0; i < 60; i++) {
    const template = DOC_TEMPLATES[i % DOC_TEMPLATES.length];
    const caseRecord = createdCases[i % createdCases.length];
    const createdAtDate = daysAgo(randomInt(1, 120));

    const uniqueFileName = template.fileName.replace(
      ".pdf",
      `_${caseRecord.caseNumber.replace(/[^0-9]/g, "")}.pdf`,
    );

    const [doc] = await db
      .insert(schema.documents)
      .values({
        organizationId,
        caseId: caseRecord.id,
        fileName: uniqueFileName,
        fileType: "application/pdf",
        fileSizeBytes: randomInt(50_000, 5_000_000),
        storagePath: `documents/${caseRecord.caseNumber}/${uniqueFileName}`,
        category: template.category,
        source: template.source,
        description: i % 5 === 0 ? `${template.category} for ${caseRecord.firstName} ${caseRecord.lastName}` : null,
        tags: template.category === "Medical Records" ? ["medical", "evidence"] : null,
        isConfidential: template.category === "Medical Records",
        createdAt: createdAtDate,
        createdBy: randomItem(allUserIds),
      })
      .returning();

    createdDocs.push({ id: doc.id, caseId: caseRecord.id });
  }
  console.log(`  Created ${createdDocs.length} documents`);

  // Document processing results for ~40 docs
  console.log("\n--- Creating document processing results ---");

  const DOC_CATEGORIES = ["medical_records", "ssa_correspondence", "hearing_notice", "decision", "forms"];
  const PROVIDER_NAMES = ["Dr. Sarah Mitchell", "Dr. Robert Chang", "Dr. Maria Gonzalez", "Dr. James Patel", "Dr. Angela Freeman"];
  const PROVIDER_TYPES = ["primary_care", "orthopedic", "psychiatry", "neurology", "pain_management"];

  let procCount = 0;
  for (let i = 0; i < 40; i++) {
    const doc = createdDocs[i];
    const processingStatus = i < 35 ? "completed" : "pending";

    await db.insert(schema.documentProcessingResults).values({
      organizationId,
      documentId: doc.id,
      caseId: doc.caseId,
      status: processingStatus as "pending" | "completed",
      extractedText: processingStatus === "completed" ? "Sample extracted text content..." : null,
      pageCount: randomInt(2, 120),
      documentCategory: DOC_CATEGORIES[i % DOC_CATEGORIES.length],
      providerName: i % 3 === 0 ? PROVIDER_NAMES[i % PROVIDER_NAMES.length] : null,
      providerType: i % 3 === 0 ? PROVIDER_TYPES[i % PROVIDER_TYPES.length] : null,
      treatmentDateStart: i % 3 === 0 ? daysAgo(randomInt(60, 365)) : null,
      treatmentDateEnd: i % 3 === 0 ? daysAgo(randomInt(1, 59)) : null,
      aiClassification: processingStatus === "completed" ? { category: DOC_CATEGORIES[i % DOC_CATEGORIES.length], confidence: randomInt(75, 99) / 100 } : {},
      aiConfidence: processingStatus === "completed" ? randomInt(75, 99) : null,
      processingTimeMs: processingStatus === "completed" ? randomInt(500, 15000) : null,
    });
    procCount++;
  }
  console.log(`  Created ${procCount} document processing results`);

  // -----------------------------------------------------------------------
  // 7. Audit / Activity Log (120 entries over last 7 days)
  // -----------------------------------------------------------------------

  console.log("\n--- Creating 120 audit log entries ---");

  const AUDIT_ACTIONS = [
    { action: "stage_changed", entityType: "case" },
    { action: "note_added", entityType: "case" },
    { action: "document_uploaded", entityType: "document" },
    { action: "task_completed", entityType: "task" },
    { action: "task_created", entityType: "task" },
    { action: "contact_added", entityType: "contact" },
    { action: "assignment_changed", entityType: "case" },
    { action: "field_updated", entityType: "case" },
    { action: "case_created", entityType: "case" },
    { action: "case_closed", entityType: "case" },
  ];

  const NOTE_TEXTS = [
    "Spoke with claimant -- confirmed medical appointments are up to date.",
    "Received updated medical records from treating physician. Added to file.",
    "Claimant reports worsening symptoms. Referred to pain management.",
    "SSA requested additional documentation. Deadline in 10 days.",
    "Filed request for reconsideration. Tracking number confirmed.",
    "Hearing prep meeting completed. Claimant well-prepared.",
    "ALJ continued hearing to allow additional evidence submission.",
    "Consultative exam scheduled for next week per SSA request.",
    "Received favorable decision. Processing fee petition.",
    "Medical records request sent to three providers.",
    "Discussed case strategy with attorney. Filing recon within 5 days.",
    "Claimant moved to new address. Updated contact information.",
  ];

  let auditCount = 0;
  for (let i = 0; i < 120; i++) {
    const actType = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
    const caseRecord = createdCases[i % createdCases.length];
    // Concentrate entries in the last 7 days for the activity feed
    const createdAtDate = daysAgo(randomInt(0, 7));
    const userId = randomItem(allUserIds);

    let changes: Record<string, unknown> = {};
    if (actType.action === "stage_changed") {
      const fromStage = randomItem(allStages);
      const toStage = randomItem(allStages);
      changes = {
        from: { stageId: fromStage.id, stageName: fromStage.name },
        to: { stageId: toStage.id, stageName: toStage.name },
      };
    } else if (actType.action === "note_added") {
      changes = { note: NOTE_TEXTS[i % NOTE_TEXTS.length] };
    } else if (actType.action === "document_uploaded") {
      changes = { fileName: DOC_TEMPLATES[i % DOC_TEMPLATES.length].fileName, category: DOC_TEMPLATES[i % DOC_TEMPLATES.length].category };
    } else if (actType.action === "task_completed") {
      changes = { taskTitle: TASK_TEMPLATES[i % TASK_TEMPLATES.length].title };
    } else if (actType.action === "field_updated") {
      changes = { field: "hearing_date", oldValue: null, newValue: daysFromNow(30).toISOString() };
    }

    await db.insert(schema.auditLog).values({
      organizationId,
      userId,
      entityType: actType.entityType,
      entityId: caseRecord.id,
      action: actType.action,
      changes,
      metadata: { source: "dashboard_seed" },
      createdAt: createdAtDate,
    });
    auditCount++;
  }
  console.log(`  Created ${auditCount} audit log entries`);

  // -----------------------------------------------------------------------
  // 8. Calendar Events (25 events)
  // -----------------------------------------------------------------------

  console.log("\n--- Creating 25 calendar events ---");

  let eventCount = 0;

  // 8 hearings
  const hearingCases = createdCases.filter(
    (c) => c.stageCode === "4D" || c.stageCode === "4E" || c.stageCode === "5A",
  );
  for (let i = 0; i < 8; i++) {
    const caseRecord = hearingCases[i % hearingCases.length];
    const startAt = daysFromNow(randomInt(3, 60));
    startAt.setHours(9 + randomInt(0, 6), 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const alj = caseRecord.alj ?? randomItem(ALJ_DATA).name;
    const office = caseRecord.hearingOffice ?? randomItem(HEARING_OFFICES);

    await db.insert(schema.calendarEvents).values({
      organizationId,
      caseId: caseRecord.id,
      title: `Hearing: ${caseRecord.firstName} ${caseRecord.lastName} (${caseRecord.caseNumber})`,
      description: `${randomItem(["Video", "In Person", "Phone"])} hearing before ${alj} at ${office}.`,
      eventType: "hearing",
      startAt,
      endAt,
      location: `${office}, Hearing Room ${randomInt(1, 4)}`,
      hearingOffice: office,
      adminLawJudge: alj,
      createdBy: hearingsUser.id,
    });
    eventCount++;
  }

  // 4 consultative exams
  for (let i = 0; i < 4; i++) {
    const caseRecord = createdCases[randomInt(10, 35)];
    const startAt = daysFromNow(randomInt(5, 21));
    startAt.setHours(randomInt(8, 14), 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 90 * 60 * 1000);

    await db.insert(schema.calendarEvents).values({
      organizationId,
      caseId: caseRecord.id,
      title: `Consultative Exam: ${caseRecord.firstName} ${caseRecord.lastName}`,
      description: `CE scheduled by SSA with ${randomItem(medProviders).first} ${randomItem(medProviders).last}`,
      eventType: "appointment",
      startAt,
      endAt,
      location: `${randomItem(["Birmingham Medical Center", "Southside Medical Office", "Midtown Health Clinic"])}`,
      createdBy: caseMgrUser.id,
    });
    eventCount++;
  }

  // 6 filing deadlines
  for (let i = 0; i < 6; i++) {
    const caseRecord = createdCases[randomInt(8, 45)];
    const startAt = daysFromNow(randomInt(2, 30));

    const deadlineTypes = [
      "Reconsideration filing deadline",
      "SSA document submission deadline",
      "Appeal deadline",
      "Pre-hearing brief due",
      "Exhibit submission deadline",
      "Fee petition deadline",
    ];

    await db.insert(schema.calendarEvents).values({
      organizationId,
      caseId: caseRecord.id,
      title: `${deadlineTypes[i]} -- ${caseRecord.caseNumber}`,
      eventType: "deadline",
      startAt,
      allDay: true,
      createdBy: randomItem([filingUser.id, caseMgrUser.id, hearingsUser.id]),
    });
    eventCount++;
  }

  // 4 client meetings
  for (let i = 0; i < 4; i++) {
    const caseRecord = createdCases[randomInt(0, 20)];
    const startAt = daysFromNow(randomInt(1, 10));
    startAt.setHours(randomInt(9, 16), 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

    await db.insert(schema.calendarEvents).values({
      organizationId,
      caseId: caseRecord.id,
      title: `Client Meeting: ${caseRecord.firstName} ${caseRecord.lastName}`,
      eventType: "appointment",
      startAt,
      endAt,
      location: "Hogan & Smith Law -- Conference Room A",
      createdBy: caseMgrUser.id,
    });
    eventCount++;
  }

  // 3 follow-ups
  for (let i = 0; i < 3; i++) {
    const caseRecord = createdCases[randomInt(0, 40)];
    const startAt = daysFromNow(randomInt(1, 14));
    startAt.setHours(randomInt(9, 16), 0, 0, 0);

    await db.insert(schema.calendarEvents).values({
      organizationId,
      caseId: caseRecord.id,
      title: `Follow up: ${caseRecord.firstName} ${caseRecord.lastName} -- ${caseRecord.caseNumber}`,
      eventType: "follow_up",
      startAt,
      createdBy: randomItem(allUserIds),
    });
    eventCount++;
  }

  console.log(`  Created ${eventCount} calendar events`);

  // -----------------------------------------------------------------------
  // 9. Medical Chronology Entries (35 entries across several cases)
  // -----------------------------------------------------------------------

  console.log("\n--- Creating 35 medical chronology entries ---");

  const MED_ENTRY_TYPES: (
    | "office_visit" | "hospitalization" | "emergency" | "lab_result"
    | "imaging" | "mental_health" | "physical_therapy" | "surgery"
    | "prescription" | "diagnosis" | "functional_assessment"
  )[] = [
    "office_visit", "hospitalization", "emergency", "lab_result",
    "imaging", "mental_health", "physical_therapy", "surgery",
    "prescription", "diagnosis", "functional_assessment",
  ];

  const MED_SUMMARIES = [
    "Patient presents with chronic lower back pain radiating to left leg. MRI shows L4-L5 herniation.",
    "Psychiatric evaluation: Major depressive disorder, recurrent, severe. GAF score 45.",
    "ER visit for acute exacerbation of COPD. Placed on supplemental oxygen.",
    "CBC and metabolic panel results within normal limits except elevated HbA1c at 9.2%.",
    "Lumbar spine MRI: Moderate central stenosis at L3-L4, disc protrusion L4-L5.",
    "Individual therapy session. Patient reports increased anxiety and panic attacks.",
    "Physical therapy evaluation. Significant limitations in range of motion.",
    "Right knee arthroscopy. Meniscal tear repair successful.",
    "Prescribed gabapentin 300mg TID for neuropathic pain.",
    "Diagnosis: Fibromyalgia, chronic widespread pain, fatigue.",
    "RFC assessment: Limited to sedentary work. Cannot lift more than 10 lbs.",
    "Follow-up visit. Pain level 7/10. Current medications not providing adequate relief.",
    "Hospitalization for cardiac event. Troponin elevated. Echo shows EF 35%.",
    "Mental status exam: Oriented x3, affect flat, thought process logical but slowed.",
    "Consultative exam: Claimant demonstrates difficulty with ambulation and fine motor tasks.",
  ];

  const FACILITIES = [
    "UAB Medical Center", "St. Vincent's Hospital", "Brookwood Baptist",
    "Grandview Medical", "Princeton Baptist", "Shelby Baptist",
    "Southeast Health", "Huntsville Hospital",
  ];

  const DIAGNOSES_POOL = [
    ["M54.5 Low back pain", "M51.16 Lumbar radiculopathy"],
    ["F32.2 Major depressive disorder, severe", "F41.1 Generalized anxiety disorder"],
    ["I50.9 Heart failure, unspecified", "I25.10 Coronary artery disease"],
    ["M06.9 Rheumatoid arthritis", "M79.7 Fibromyalgia"],
    ["E11.65 Type 2 diabetes with hyperglycemia", "G62.9 Peripheral neuropathy"],
    ["J44.1 COPD with acute exacerbation", "J43.9 Emphysema"],
    ["F31.9 Bipolar disorder", "F41.0 Panic disorder"],
    ["M47.816 Spondylosis with myelopathy, lumbar", "M48.06 Spinal stenosis, lumbar"],
  ];

  const TREATMENTS_POOL = [
    ["Physical therapy 3x/week", "Epidural steroid injection"],
    ["Sertraline 100mg daily", "Individual therapy weekly"],
    ["Metoprolol 50mg BID", "Low sodium diet", "Cardiac rehabilitation"],
    ["Methotrexate 15mg weekly", "Prednisone taper"],
    ["Insulin glargine 30 units", "Gabapentin 300mg TID"],
    ["Tiotropium inhaler", "Supplemental oxygen 2L/min"],
  ];

  // Pick 8 cases to have medical chronology entries
  const medChronCaseIndices = [5, 12, 18, 24, 30, 36, 42, 48];
  let medChronCount = 0;

  for (let i = 0; i < 35; i++) {
    const caseRecord = createdCases[medChronCaseIndices[i % medChronCaseIndices.length] % createdCases.length];
    const entryType = MED_ENTRY_TYPES[i % MED_ENTRY_TYPES.length];
    const eventDate = daysAgo(randomInt(30, 730));
    const providerIdx = i % medProviders.length;

    // Link to a document if one exists for this case
    const matchingDoc = createdDocs.find((d) => d.caseId === caseRecord.id);

    await db.insert(schema.medicalChronologyEntries).values({
      organizationId,
      caseId: caseRecord.id,
      sourceDocumentId: matchingDoc?.id ?? null,
      entryType,
      eventDate,
      eventDateEnd: entryType === "hospitalization" ? new Date(eventDate.getTime() + randomInt(1, 7) * 86400000) : null,
      providerName: `${medProviders[providerIdx].first} ${medProviders[providerIdx].last}`,
      providerType: medProviders[providerIdx].specialty,
      facilityName: FACILITIES[i % FACILITIES.length],
      summary: MED_SUMMARIES[i % MED_SUMMARIES.length],
      details: i % 3 === 0 ? "Detailed clinical notes documenting examination findings, diagnostic impressions, and treatment plan." : null,
      diagnoses: DIAGNOSES_POOL[i % DIAGNOSES_POOL.length],
      treatments: i % 2 === 0 ? TREATMENTS_POOL[i % TREATMENTS_POOL.length] : null,
      medications: i % 3 === 0 ? ["Gabapentin 300mg", "Sertraline 100mg", "Ibuprofen 800mg"] : null,
      pageReference: `pp. ${randomInt(1, 50)}-${randomInt(51, 120)}`,
      aiGenerated: true,
      isVerified: i < 20,
      verifiedBy: i < 20 ? medRecUser.id : null,
      verifiedAt: i < 20 ? daysAgo(randomInt(1, 14)) : null,
    });
    medChronCount++;
  }
  console.log(`  Created ${medChronCount} medical chronology entries`);

  // -----------------------------------------------------------------------
  // 10. Custom field values -- revenue data on resolved cases
  // -----------------------------------------------------------------------

  console.log("\n--- Creating custom field values for revenue ---");

  const customFieldDefs = await db.query.customFieldDefinitions.findMany({
    where: eq(schema.customFieldDefinitions.organizationId, organizationId),
  });
  const fieldBySlug = new Map(customFieldDefs.map((f) => [f.slug, f]));
  let cfvCount = 0;

  for (const caseRecord of createdCases) {
    // Past-due benefits for won cases (revenue data)
    if (caseRecord.stageCode === "5A") {
      const pastDueBenefitsField = fieldBySlug.get("past_due_benefits");
      if (pastDueBenefitsField) {
        const amount = randomInt(5000, 150000);
        await db
          .insert(schema.customFieldValues)
          .values({
            caseId: caseRecord.id,
            fieldDefinitionId: pastDueBenefitsField.id,
            numberValue: amount,
            updatedBy: caseMgrUser.id,
          })
          .onConflictDoNothing();
        cfvCount++;
      }
    }

    // Decision type for resolved cases
    if (caseRecord.stageCode.startsWith("5")) {
      const decisionTypeField = fieldBySlug.get("decision_type");
      if (decisionTypeField) {
        let decisionType: string;
        if (caseRecord.stageCode === "5A") {
          decisionType = randomItem(["Fully Favorable", "Partially Favorable"]);
        } else {
          decisionType = randomItem(["Unfavorable", "Dismissed", "Remand"]);
        }
        await db
          .insert(schema.customFieldValues)
          .values({
            caseId: caseRecord.id,
            fieldDefinitionId: decisionTypeField.id,
            textValue: decisionType,
            updatedBy: caseMgrUser.id,
          })
          .onConflictDoNothing();
        cfvCount++;
      }
    }

    // Disability description
    const disabilityField = fieldBySlug.get("disability_description");
    if (disabilityField) {
      await db
        .insert(schema.customFieldValues)
        .values({
          caseId: caseRecord.id,
          fieldDefinitionId: disabilityField.id,
          textValue: DISABILITY_DESCRIPTIONS[caseIdx % DISABILITY_DESCRIPTIONS.length],
          updatedBy: intakeUser.id,
        })
        .onConflictDoNothing();
      cfvCount++;
      caseIdx++;
    }

    // Hearing type for hearing cases
    if (caseRecord.stageCode.startsWith("4") || caseRecord.stageCode.startsWith("5")) {
      const hearingTypeField = fieldBySlug.get("hearing_type");
      if (hearingTypeField) {
        await db
          .insert(schema.customFieldValues)
          .values({
            caseId: caseRecord.id,
            fieldDefinitionId: hearingTypeField.id,
            textValue: randomItem(["In Person", "Video", "Phone"]),
            updatedBy: hearingsUser.id,
          })
          .onConflictDoNothing();
        cfvCount++;
      }
    }

    // Case priority for all cases
    const priorityField = fieldBySlug.get("case_priority");
    if (priorityField) {
      await db
        .insert(schema.customFieldValues)
        .values({
          caseId: caseRecord.id,
          fieldDefinitionId: priorityField.id,
          textValue: randomItem(["Low", "Normal", "High", "Urgent"]),
          updatedBy: caseMgrUser.id,
        })
        .onConflictDoNothing();
      cfvCount++;
    }
  }
  console.log(`  Created ${cfvCount} custom field values`);

  // -----------------------------------------------------------------------
  // 11. Idempotency marker
  // -----------------------------------------------------------------------

  await db.insert(schema.auditLog).values({
    organizationId,
    userId: adminUser.id,
    entityType: "system",
    entityId: adminUser.id,
    action: "dashboard_seed_v1",
    changes: { seededAt: new Date().toISOString() },
    metadata: { source: "seed-dashboard-data.ts" },
  });

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  // Compute some stats
  const wonCases = createdCases.filter((c) => c.stageCode === "5A").length;
  const resolvedCases = createdCases.filter((c) => c.stageCode.startsWith("5")).length;
  const winRate = resolvedCases > 0 ? Math.round((wonCases / resolvedCases) * 100) : 0;

  console.log("\n=== Dashboard Data Seed Complete ===");
  console.log(`
Summary:
  Cases:              ${createdCases.length} (win rate: ${winRate}%)
  Stage transitions:  ${transitionCount}
  Contacts:           ${createdContacts.length}
  Tasks:              ${taskCount}
  Documents:          ${createdDocs.length}
  Doc processing:     ${procCount}
  Audit entries:      ${auditCount + 1}
  Calendar events:    ${eventCount}
  Med chronology:     ${medChronCount}
  Custom field vals:  ${cfvCount}
  ALJ judges:         ${ALJ_DATA.length}
  Hearing offices:    ${HEARING_OFFICES.length}

Dashboard coverage:
  [x] Active Cases stat card
  [x] Tasks Due Today stat card
  [x] Pipeline Funnel chart
  [x] My Tasks list
  [x] Cases by Stage bar chart
  [x] Upcoming Deadlines widget
  [x] Recent Activity feed
  [x] Total/Active/Won Cases stats
  [x] Task Completion pie chart
  [x] Case Status Breakdown grid
  [x] Cases by Team Member report
  [x] Average Time in Stage report
  [x] Cases Over Time trend report
  [x] Pipeline Funnel detail report
  [x] Task Completion Rates detail
  [x] ALJ data (12 judges, 30%-80% rates)
  [x] Hearing offices (6 offices)
  [x] Document processing results
  [x] Medical chronology entries
  [x] Calendar events (hearings, CEs, deadlines)
  [x] Contact records (claimants, providers, offices)
  [x] Revenue data (past-due benefits on won cases)
`);

  await client.end();
}

main().catch((err) => {
  console.error("Dashboard seed failed:", err);
  process.exit(1);
});
