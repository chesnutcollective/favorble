/**
 * Demo data seed script for Hogan & Smith CaseFlow.
 *
 * Populates the database with realistic Social Security disability law firm data:
 *   - 50 cases across all pipeline stages
 *   - 200 tasks assigned to staff
 *   - 30 contacts (claimants, attorneys, medical providers, SSA offices, experts)
 *   - 100 document records
 *   - 150 audit/activity entries
 *   - 20 calendar events
 *   - 15 leads
 *   - 30 communications/messages
 *
 * Run with: npx tsx scripts/seed-demo-data.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { faker } from "@faker-js/faker";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic seed so the script produces the same data each run. */
faker.seed(42);

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

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

function randomDateBetween(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

function maskedSSN(): string {
  return `***-**-${faker.string.numeric(4)}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("=== Hogan & Smith Demo Data Seed ===\n");

  // -------------------------------------------------------------------------
  // Fetch existing org, users, stages, and custom field definitions
  // -------------------------------------------------------------------------

  const org = await db.query.organizations.findFirst();
  if (!org) {
    throw new Error(
      "No organization found. Run the base seed first: npx tsx db/seed/index.ts",
    );
  }
  const organizationId = org.id;
  console.log(`Organization: ${org.name} (${organizationId})`);

  const existingUsers = await db.query.users.findMany({
    where: eq(schema.users.organizationId, organizationId),
  });
  if (existingUsers.length === 0) {
    throw new Error(
      "No users found. Run the base seed first: npx tsx db/seed/index.ts",
    );
  }
  console.log(`Found ${existingUsers.length} users`);

  const allStages = await db.query.caseStages.findMany({
    where: eq(schema.caseStages.organizationId, organizationId),
  });
  if (allStages.length === 0) {
    throw new Error(
      "No stages found. Run the base seed first: npx tsx db/seed/index.ts",
    );
  }
  console.log(`Found ${allStages.length} stages`);

  const customFieldDefs = await db.query.customFieldDefinitions.findMany({
    where: eq(schema.customFieldDefinitions.organizationId, organizationId),
  });
  console.log(`Found ${customFieldDefs.length} custom field definitions`);

  // -------------------------------------------------------------------------
  // Idempotency check
  // -------------------------------------------------------------------------

  const existingCases = await db.query.cases.findMany({
    where: eq(schema.cases.organizationId, organizationId),
  });
  if (existingCases.length > 0) {
    console.log(
      `\nFound ${existingCases.length} existing cases. Demo data already seeded — skipping.`,
    );
    console.log(
      "To re-seed, delete existing cases first or reset the database.",
    );
    await client.end();
    return;
  }

  // -------------------------------------------------------------------------
  // Build lookup maps
  // -------------------------------------------------------------------------

  const stageByCode = new Map(allStages.map((s) => [s.code, s]));

  // Map users by role/email for easy reference
  const userByEmail = new Map(existingUsers.map((u) => [u.email, u]));
  const adminUser = userByEmail.get("admin@hogansmith.com")!;
  const attorneyUser = userByEmail.get("attorney@hogansmith.com")!;
  const filingUser = userByEmail.get("filing@hogansmith.com")!;
  const intakeUser = userByEmail.get("intake@hogansmith.com")!;
  const medRecUser = userByEmail.get("medrec@hogansmith.com")!;
  const caseMgrUser = userByEmail.get("casemgr@hogansmith.com")!;
  const hearingsUser = userByEmail.get("hearings@hogansmith.com")!;

  const allUserIds = existingUsers.map((u) => u.id);

  // -------------------------------------------------------------------------
  // Stage distribution for 50 cases (code -> count)
  // -------------------------------------------------------------------------

  const stageDistribution: { code: string; count: number }[] = [
    { code: "1A", count: 4 }, // Signed Up
    { code: "2A", count: 4 }, // Application Ready to File
    { code: "2B", count: 3 }, // Application Filed - SSDI
    { code: "2D", count: 2 }, // Application Filed - Both
    { code: "2E", count: 4 }, // Application Pending Decision
    { code: "2C", count: 2 }, // Application Filed - SSI
    { code: "3A", count: 3 }, // Initial Denial Received
    { code: "3B", count: 3 }, // Reconsideration Ready to File
    { code: "3C", count: 2 }, // Reconsideration Filed
    { code: "3D", count: 2 }, // Reconsideration Pending Decision
    { code: "3E", count: 2 }, // Reconsideration Denial Received
    { code: "4A", count: 3 }, // Request for Hearing - Not Complete
    { code: "4B", count: 2 }, // Request for Hearing - Ready to File
    { code: "4C", count: 3 }, // Request for Hearing - Filed
    { code: "4D", count: 3 }, // Hearing Scheduled
    { code: "4E", count: 2 }, // Hearing Held - Awaiting Decision
    { code: "5A", count: 4 }, // Favorable Decision
    { code: "5B", count: 2 }, // Unfavorable Decision
  ];

  // Verify counts
  const totalCases = stageDistribution.reduce((s, d) => s + d.count, 0);
  if (totalCases !== 50) {
    throw new Error(`Stage distribution sums to ${totalCases}, expected 50`);
  }

  // -------------------------------------------------------------------------
  // 1. Create 50 Cases
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 50 cases ---");

  const claimantFirstNames = [
    "Robert",
    "Patricia",
    "James",
    "Jennifer",
    "Michael",
    "Linda",
    "William",
    "Barbara",
    "David",
    "Elizabeth",
    "Richard",
    "Susan",
    "Joseph",
    "Jessica",
    "Thomas",
    "Sarah",
    "Charles",
    "Karen",
    "Christopher",
    "Lisa",
    "Daniel",
    "Nancy",
    "Matthew",
    "Betty",
    "Anthony",
    "Margaret",
    "Mark",
    "Sandra",
    "Donald",
    "Ashley",
    "Steven",
    "Dorothy",
    "Paul",
    "Kimberly",
    "Andrew",
    "Emily",
    "Joshua",
    "Donna",
    "Kenneth",
    "Michelle",
    "George",
    "Carol",
    "Edward",
    "Amanda",
    "Brian",
    "Melissa",
    "Ronald",
    "Deborah",
    "Timothy",
    "Stephanie",
  ];
  const claimantLastNames = [
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
    "Hernandez",
    "Lopez",
    "Gonzalez",
    "Wilson",
    "Anderson",
    "Thomas",
    "Taylor",
    "Moore",
    "Jackson",
    "Martin",
    "Lee",
    "Perez",
    "Thompson",
    "White",
    "Harris",
    "Sanchez",
    "Clark",
    "Ramirez",
    "Lewis",
    "Robinson",
    "Walker",
    "Young",
    "Allen",
    "King",
    "Wright",
    "Scott",
    "Torres",
    "Nguyen",
    "Hill",
    "Flores",
    "Green",
    "Adams",
    "Nelson",
    "Baker",
    "Hall",
    "Rivera",
    "Campbell",
    "Mitchell",
    "Carter",
    "Roberts",
    "Phillips",
  ];

  const ssaOffices = [
    "Birmingham, AL",
    "Mobile, AL",
    "Atlanta, GA",
    "Nashville, TN",
    "Jacksonville, FL",
    "Charlotte, NC",
    "Dallas, TX",
    "Houston, TX",
    "New Orleans, LA",
    "Memphis, TN",
  ];

  const hearingOffices = [
    "Birmingham ODAR",
    "Atlanta ODAR",
    "Nashville ODAR",
    "Charlotte ODAR",
    "Dallas ODAR",
    "Houston ODAR",
    "New Orleans ODAR",
    "Memphis ODAR",
  ];

  const aljNames = [
    "Hon. Patricia Hartwell",
    "Hon. Robert Chen",
    "Hon. Maria Santos",
    "Hon. William Foster",
    "Hon. Angela Richardson",
    "Hon. Thomas Bradley",
    "Hon. Susan Yamamoto",
    "Hon. James Patterson",
  ];

  const disabilityDescriptions = [
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

  interface CaseRecord {
    id: string;
    caseNumber: string;
    firstName: string;
    lastName: string;
    stageCode: string;
  }
  const createdCases: CaseRecord[] = [];
  let caseIdx = 0;

  for (const { code, count } of stageDistribution) {
    const stage = stageByCode.get(code);
    if (!stage) {
      throw new Error(`Stage with code ${code} not found`);
    }

    for (let i = 0; i < count; i++) {
      const firstName = claimantFirstNames[caseIdx];
      const lastName = claimantLastNames[caseIdx];
      const caseNumber = `HS-2026-${String(1001 + caseIdx).padStart(4, "0")}`;
      const createdDaysAgo = Math.floor(Math.random() * 180) + 1; // 1-180 days ago
      const createdAt = daysAgo(createdDaysAgo);
      const stageEnteredDaysAgo = Math.floor(
        Math.random() * Math.min(createdDaysAgo, 30),
      );
      const stageEnteredAt = daysAgo(stageEnteredDaysAgo);

      // Determine status based on stage code
      let status:
        | "active"
        | "on_hold"
        | "closed_won"
        | "closed_lost"
        | "closed_withdrawn" = "active";
      let closedAt: Date | null = null;
      let closedReason: string | null = null;
      if (code === "5A") {
        status = "closed_won";
        closedAt = daysAgo(Math.floor(Math.random() * 30));
        closedReason = "Favorable decision received";
      } else if (code === "5B") {
        status = "closed_lost";
        closedAt = daysAgo(Math.floor(Math.random() * 30));
        closedReason = "Unfavorable decision — client declined appeal";
      } else if (code === "5C") {
        status = "closed_withdrawn";
        closedAt = daysAgo(Math.floor(Math.random() * 60));
        closedReason = "Client returned to work";
      }

      const dob = faker.date.between({
        from: new Date("1955-01-01"),
        to: new Date("1990-12-31"),
      });

      const allegedOnsetDate = faker.date.between({
        from: new Date("2020-01-01"),
        to: new Date("2025-06-30"),
      });

      const appTypes = ["SSDI", "SSI", "Both"];
      const appType = randomItem(appTypes);

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
          ssaClaimNumber: `${faker.string.numeric(3)}-${faker.string.numeric(2)}-${faker.string.numeric(4)}`,
          ssaOffice: randomItem(ssaOffices),
          applicationTypePrimary: appType === "Both" ? "SSDI" : appType,
          applicationTypeSecondary: appType === "Both" ? "SSI" : null,
          allegedOnsetDate,
          dateLastInsured:
            appType !== "SSI"
              ? faker.date.between({
                  from: new Date("2026-06-01"),
                  to: new Date("2028-12-31"),
                })
              : null,
          hearingOffice:
            code.startsWith("4") || code.startsWith("5")
              ? randomItem(hearingOffices)
              : null,
          adminLawJudge:
            code === "4D" || code === "4E" || code === "5A" || code === "5B"
              ? randomItem(aljNames)
              : null,
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
      });

      // Create case assignment (primary attorney + case manager)
      const assignmentRoles: {
        userId: string;
        role: string;
        isPrimary: boolean;
      }[] = [{ userId: attorneyUser.id, role: "attorney", isPrimary: true }];

      // Assign case manager or hearings depending on stage
      if (code.startsWith("4")) {
        assignmentRoles.push({
          userId: hearingsUser.id,
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
  console.log(`Created ${createdCases.length} cases with assignments`);

  // -------------------------------------------------------------------------
  // 2. Create 30 Contacts
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 30 contacts ---");

  interface ContactRecord {
    id: string;
    contactType: string;
    firstName: string;
    lastName: string;
  }
  const createdContacts: ContactRecord[] = [];

  // Claimant contacts (linked to all cases)
  for (let i = 0; i < createdCases.length; i++) {
    const c = createdCases[i];
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: faker.internet
          .email({ firstName: c.firstName, lastName: c.lastName })
          .toLowerCase(),
        phone: faker.phone.number({ style: "national" }),
        address: faker.location.streetAddress(),
        city: faker.location.city(),
        state: randomItem(["AL", "GA", "TN", "FL", "NC", "TX", "LA", "MS"]),
        zip: faker.location.zipCode(),
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

    // Link claimant to their case
    await db.insert(schema.caseContacts).values({
      caseId: c.id,
      contactId: contact.id,
      relationship: "claimant",
      isPrimary: true,
    });
  }

  // Attorney contacts (5)
  const attorneyNames = [
    { first: "David", last: "Bernstein" },
    { first: "Rachel", last: "Kim" },
    { first: "Marcus", last: "Washington" },
    { first: "Elena", last: "Vasquez" },
    { first: "Alan", last: "Prescott" },
  ];
  for (const name of attorneyNames) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: name.first,
        lastName: name.last,
        email: `${name.first.toLowerCase()}.${name.last.toLowerCase()}@lawfirm.com`,
        phone: faker.phone.number({ style: "national" }),
        address: faker.location.streetAddress(),
        city: faker.location.city(),
        state: "AL",
        zip: faker.location.zipCode(),
        contactType: "attorney",
        createdBy: adminUser.id,
      })
      .returning();
    createdContacts.push({
      id: contact.id,
      contactType: "attorney",
      firstName: name.first,
      lastName: name.last,
    });
  }

  // Medical provider contacts (5)
  const providerNames = [
    { first: "Dr. Sarah", last: "Mitchell" },
    { first: "Dr. Robert", last: "Chang" },
    { first: "Dr. Maria", last: "Gonzalez" },
    { first: "Dr. James", last: "Patel" },
    { first: "Dr. Angela", last: "Freeman" },
  ];
  for (const name of providerNames) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: name.first,
        lastName: name.last,
        email: `${name.last.toLowerCase()}@medpractice.com`,
        phone: faker.phone.number({ style: "national" }),
        address: faker.location.streetAddress(),
        city: faker.location.city(),
        state: randomItem(["AL", "GA", "TN"]),
        zip: faker.location.zipCode(),
        contactType: "medical_provider",
        createdBy: medRecUser.id,
      })
      .returning();
    createdContacts.push({
      id: contact.id,
      contactType: "medical_provider",
      firstName: name.first,
      lastName: name.last,
    });
  }

  // SSA office contacts (3)
  const ssaContactNames = [
    { first: "SSA Office", last: "Birmingham" },
    { first: "SSA Office", last: "Atlanta" },
    { first: "SSA Office", last: "Nashville" },
  ];
  for (const name of ssaContactNames) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: name.first,
        lastName: name.last,
        email: null,
        phone: faker.phone.number({ style: "national" }),
        address: faker.location.streetAddress(),
        city: name.last,
        state:
          name.last === "Birmingham"
            ? "AL"
            : name.last === "Atlanta"
              ? "GA"
              : "TN",
        zip: faker.location.zipCode(),
        contactType: "ssa_office",
        createdBy: adminUser.id,
      })
      .returning();
    createdContacts.push({
      id: contact.id,
      contactType: "ssa_office",
      firstName: name.first,
      lastName: name.last,
    });
  }

  // Expert contacts (2)
  const expertNames = [
    { first: "Dr. William", last: "Harrison" },
    { first: "Dr. Karen", last: "Obermann" },
  ];
  for (const name of expertNames) {
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: name.first,
        lastName: name.last,
        email: `${name.last.toLowerCase()}@vocationalexperts.com`,
        phone: faker.phone.number({ style: "national" }),
        address: faker.location.streetAddress(),
        city: faker.location.city(),
        state: "AL",
        zip: faker.location.zipCode(),
        contactType: "expert",
        createdBy: hearingsUser.id,
      })
      .returning();
    createdContacts.push({
      id: contact.id,
      contactType: "expert",
      firstName: name.first,
      lastName: name.last,
    });
  }

  console.log(`Created ${createdContacts.length} contacts`);

  // -------------------------------------------------------------------------
  // 3. Create 200 Tasks
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 200 tasks ---");

  const taskTemplates = [
    // Intake tasks
    {
      title: "Complete intake questionnaire",
      priority: "high" as const,
      team: "intake",
    },
    {
      title: "Verify claimant identity documents",
      priority: "medium" as const,
      team: "intake",
    },
    {
      title: "Obtain signed retainer agreement",
      priority: "urgent" as const,
      team: "intake",
    },
    {
      title: "Request SSA earnings record",
      priority: "medium" as const,
      team: "intake",
    },
    {
      title: "Complete disability description form",
      priority: "high" as const,
      team: "intake",
    },
    // Filing tasks
    {
      title: "File SSDI Application",
      priority: "high" as const,
      team: "filing",
    },
    {
      title: "File SSI Application",
      priority: "high" as const,
      team: "filing",
    },
    {
      title: "Submit SSA-1696 Appointment of Representative",
      priority: "urgent" as const,
      team: "filing",
    },
    {
      title: "File Request for Reconsideration",
      priority: "high" as const,
      team: "filing",
    },
    {
      title: "File Request for Hearing",
      priority: "high" as const,
      team: "filing",
    },
    {
      title: "Submit updated medical evidence to SSA",
      priority: "medium" as const,
      team: "filing",
    },
    {
      title: "File SSA-561 Request for Reconsideration",
      priority: "high" as const,
      team: "filing",
    },
    // Medical records tasks
    {
      title: "Request medical records from primary physician",
      priority: "high" as const,
      team: "medical_records",
    },
    {
      title: "Request records from orthopedic specialist",
      priority: "medium" as const,
      team: "medical_records",
    },
    {
      title: "Request records from mental health provider",
      priority: "medium" as const,
      team: "medical_records",
    },
    {
      title: "Follow up on outstanding records request",
      priority: "high" as const,
      team: "medical_records",
    },
    {
      title: "Prepare medical evidence summary",
      priority: "high" as const,
      team: "medical_records",
    },
    {
      title: "Request updated treatment notes",
      priority: "medium" as const,
      team: "medical_records",
    },
    {
      title: "Obtain RFC statement from treating physician",
      priority: "urgent" as const,
      team: "medical_records",
    },
    {
      title: "Review MRI/imaging results",
      priority: "medium" as const,
      team: "medical_records",
    },
    // Case management tasks
    {
      title: "Review denial letter and identify issues",
      priority: "urgent" as const,
      team: "case_management",
    },
    {
      title: "Schedule client check-in call",
      priority: "medium" as const,
      team: "case_management",
    },
    {
      title: "Update case status in system",
      priority: "low" as const,
      team: "case_management",
    },
    {
      title: "Review consultative exam report",
      priority: "high" as const,
      team: "case_management",
    },
    {
      title: "Send status update letter to claimant",
      priority: "medium" as const,
      team: "case_management",
    },
    {
      title: "Review SSA decision for appeal options",
      priority: "urgent" as const,
      team: "case_management",
    },
    {
      title: "Coordinate with co-counsel on case strategy",
      priority: "high" as const,
      team: "case_management",
    },
    // Hearing tasks
    {
      title: "Prepare pre-hearing brief",
      priority: "urgent" as const,
      team: "hearings",
    },
    {
      title: "Compile hearing exhibit list",
      priority: "high" as const,
      team: "hearings",
    },
    {
      title: "Schedule hearing prep meeting with claimant",
      priority: "high" as const,
      team: "hearings",
    },
    {
      title: "Research ALJ decision patterns",
      priority: "medium" as const,
      team: "hearings",
    },
    {
      title: "Prepare claimant for hearing testimony",
      priority: "urgent" as const,
      team: "hearings",
    },
    {
      title: "Submit hearing exhibits to ODAR",
      priority: "high" as const,
      team: "hearings",
    },
    {
      title: "Review vocational expert interrogatories",
      priority: "medium" as const,
      team: "hearings",
    },
    {
      title: "Upload claimant statement to file",
      priority: "medium" as const,
      team: "hearings",
    },
    // Administration
    {
      title: "Send fee agreement to claimant",
      priority: "medium" as const,
      team: "administration",
    },
    {
      title: "Update Chronicle with latest SSA status",
      priority: "low" as const,
      team: "administration",
    },
    {
      title: "Close case file and archive documents",
      priority: "low" as const,
      team: "administration",
    },
    {
      title: "Generate monthly case status report",
      priority: "low" as const,
      team: "administration",
    },
    {
      title: "Verify fee petition filing deadline",
      priority: "high" as const,
      team: "administration",
    },
  ];

  const teamToUser: Record<string, (typeof existingUsers)[0]> = {
    intake: intakeUser,
    filing: filingUser,
    medical_records: medRecUser,
    case_management: caseMgrUser,
    hearings: hearingsUser,
    administration: adminUser,
  };

  let taskCount = 0;
  const statuses: ("pending" | "in_progress" | "completed")[] = [
    "pending",
    "in_progress",
    "completed",
  ];

  for (let i = 0; i < 200; i++) {
    const template = taskTemplates[i % taskTemplates.length];
    const caseRecord = createdCases[i % createdCases.length];
    const assignedUser = teamToUser[template.team] || randomItem(existingUsers);

    // Distribute due dates: 40 overdue, 20 due today, 40 due this week, 100 upcoming
    let dueDate: Date;
    let taskStatus: "pending" | "in_progress" | "completed";
    let completedAt: Date | null = null;

    if (i < 40) {
      // Overdue
      dueDate = daysAgo(Math.floor(Math.random() * 14) + 1);
      taskStatus = randomItem<"pending" | "in_progress">([
        "pending",
        "in_progress",
      ]);
    } else if (i < 60) {
      // Due today
      dueDate = new Date();
      taskStatus = randomItem<"pending" | "in_progress">([
        "pending",
        "in_progress",
      ]);
    } else if (i < 100) {
      // Due this week
      dueDate = daysFromNow(Math.floor(Math.random() * 5) + 1);
      taskStatus = randomItem<"pending" | "in_progress">([
        "pending",
        "in_progress",
      ]);
    } else if (i < 150) {
      // Upcoming
      dueDate = daysFromNow(Math.floor(Math.random() * 30) + 7);
      taskStatus = "pending";
    } else {
      // Completed
      const completedDaysAgo = Math.floor(Math.random() * 30) + 1;
      dueDate = daysAgo(completedDaysAgo + Math.floor(Math.random() * 5));
      taskStatus = "completed";
      completedAt = daysAgo(completedDaysAgo);
    }

    // Add case-specific detail to task titles
    const titleSuffix =
      i % 3 === 0 ? ` — ${caseRecord.firstName} ${caseRecord.lastName}` : "";

    await db.insert(schema.tasks).values({
      organizationId,
      caseId: caseRecord.id,
      title: `${template.title}${titleSuffix}`,
      description:
        i % 4 === 0
          ? `Case ${caseRecord.caseNumber}: ${template.title}. Priority follow-up needed.`
          : null,
      status: taskStatus,
      priority: template.priority,
      assignedToId: assignedUser.id,
      dueDate,
      completedAt,
      completedBy: completedAt ? assignedUser.id : null,
      createdBy: randomItem(allUserIds),
      createdAt: daysAgo(Math.floor(Math.random() * 60) + 1),
    });
    taskCount++;
  }
  console.log(`Created ${taskCount} tasks`);

  // -------------------------------------------------------------------------
  // 4. Create 100 Documents
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 100 documents ---");

  const documentTemplates = [
    // Medical records
    {
      fileName: "Medical_Records_Primary_Care.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    {
      fileName: "MRI_Lumbar_Spine_Report.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    {
      fileName: "Psychiatric_Evaluation.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    {
      fileName: "Physical_Therapy_Notes.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    {
      fileName: "Lab_Results_Blood_Panel.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    {
      fileName: "Treating_Physician_RFC.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    {
      fileName: "Hospital_Discharge_Summary.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    {
      fileName: "Pain_Management_Records.pdf",
      fileType: "application/pdf",
      category: "Medical Records",
      source: "upload" as const,
    },
    // SSA decisions / correspondence
    {
      fileName: "SSA_Initial_Denial_Notice.pdf",
      fileType: "application/pdf",
      category: "SSA Decision",
      source: "chronicle" as const,
    },
    {
      fileName: "SSA_Reconsideration_Denial.pdf",
      fileType: "application/pdf",
      category: "SSA Decision",
      source: "chronicle" as const,
    },
    {
      fileName: "SSA_Favorable_Decision.pdf",
      fileType: "application/pdf",
      category: "SSA Decision",
      source: "chronicle" as const,
    },
    {
      fileName: "SSA_Acknowledgment_Letter.pdf",
      fileType: "application/pdf",
      category: "SSA Correspondence",
      source: "chronicle" as const,
    },
    {
      fileName: "SSA_Consultative_Exam_Notice.pdf",
      fileType: "application/pdf",
      category: "SSA Correspondence",
      source: "case_status" as const,
    },
    {
      fileName: "SSA_Hearing_Notice.pdf",
      fileType: "application/pdf",
      category: "SSA Correspondence",
      source: "case_status" as const,
    },
    // Forms
    {
      fileName: "SSA_1696_Representative_Appointment.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "template" as const,
    },
    {
      fileName: "SSA_561_Request_for_Reconsideration.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "template" as const,
    },
    {
      fileName: "SSA_HA_501_Request_for_Hearing.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "template" as const,
    },
    {
      fileName: "Retainer_Agreement_Signed.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "esignature" as const,
    },
    {
      fileName: "Fee_Agreement_Signed.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "esignature" as const,
    },
    {
      fileName: "Medical_Records_Authorization.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "template" as const,
    },
    // Hearing exhibits
    {
      fileName: "Pre_Hearing_Brief.pdf",
      fileType: "application/pdf",
      category: "Hearing Exhibits",
      source: "upload" as const,
    },
    {
      fileName: "Exhibit_List.pdf",
      fileType: "application/pdf",
      category: "Hearing Exhibits",
      source: "upload" as const,
    },
    {
      fileName: "Claimant_Written_Statement.pdf",
      fileType: "application/pdf",
      category: "Hearing Exhibits",
      source: "upload" as const,
    },
    {
      fileName: "Vocational_Expert_Interrogatories.pdf",
      fileType: "application/pdf",
      category: "Hearing Exhibits",
      source: "upload" as const,
    },
    // Correspondence
    {
      fileName: "Status_Update_Letter.pdf",
      fileType: "application/pdf",
      category: "Correspondence",
      source: "template" as const,
    },
    {
      fileName: "Client_Welcome_Packet.pdf",
      fileType: "application/pdf",
      category: "Correspondence",
      source: "template" as const,
    },
    {
      fileName: "Records_Request_Letter.pdf",
      fileType: "application/pdf",
      category: "Correspondence",
      source: "template" as const,
    },
    {
      fileName: "Claimant_Function_Report.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "upload" as const,
    },
    {
      fileName: "Third_Party_Function_Report.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "upload" as const,
    },
    {
      fileName: "Work_History_Report.pdf",
      fileType: "application/pdf",
      category: "Forms",
      source: "upload" as const,
    },
  ];

  let docCount = 0;
  for (let i = 0; i < 100; i++) {
    const template = documentTemplates[i % documentTemplates.length];
    const caseRecord = createdCases[i % createdCases.length];
    const createdAtDate = daysAgo(Math.floor(Math.random() * 120) + 1);

    // Make filenames unique per case
    const uniqueFileName = template.fileName.replace(
      ".pdf",
      `_${caseRecord.caseNumber.replace(/[^0-9]/g, "")}.pdf`,
    );

    await db.insert(schema.documents).values({
      organizationId,
      caseId: caseRecord.id,
      fileName: uniqueFileName,
      fileType: template.fileType,
      fileSizeBytes: Math.floor(Math.random() * 5_000_000) + 50_000,
      storagePath: `documents/${caseRecord.caseNumber}/${uniqueFileName}`,
      category: template.category,
      source: template.source,
      description:
        i % 5 === 0
          ? `${template.category} for ${caseRecord.firstName} ${caseRecord.lastName}`
          : null,
      tags:
        template.category === "Medical Records"
          ? ["medical", "evidence"]
          : template.category === "Hearing Exhibits"
            ? ["hearing", "exhibit"]
            : null,
      isConfidential: template.category === "Medical Records",
      createdAt: createdAtDate,
      createdBy: randomItem(allUserIds),
    });
    docCount++;
  }
  console.log(`Created ${docCount} documents`);

  // -------------------------------------------------------------------------
  // 5. Create 150 Audit / Activity Log Entries
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 150 activity/audit entries ---");

  const activityTypes = [
    { action: "stage_changed", entityType: "case" },
    { action: "note_added", entityType: "case" },
    { action: "document_uploaded", entityType: "document" },
    { action: "task_completed", entityType: "task" },
    { action: "task_created", entityType: "task" },
    { action: "contact_added", entityType: "contact" },
    { action: "assignment_changed", entityType: "case" },
    { action: "field_updated", entityType: "case" },
    { action: "message_received", entityType: "communication" },
    { action: "case_created", entityType: "case" },
  ];

  const noteTexts = [
    "Spoke with claimant — confirmed medical appointments are up to date.",
    "Received updated medical records from Dr. Mitchell. Added to file.",
    "Claimant reports worsening symptoms. Referred to pain management specialist.",
    "Left voicemail for claimant regarding missing work history form.",
    "SSA requested additional documentation. Deadline in 10 days.",
    "Filed request for reconsideration. Tracking number confirmed.",
    "Hearing prep meeting completed. Claimant well-prepared for testimony.",
    "ALJ continued hearing to allow additional medical evidence submission.",
    "Consultative exam scheduled for next week per SSA request.",
    "Fee agreement signed and filed with SSA.",
    "Claimant moved to new address. Updated contact information in system.",
    "Received favorable decision. Notifying claimant and processing fee petition.",
    "Medical records request sent to three providers. Expect 2-4 week turnaround.",
    "Discussed case strategy with attorney. Filing reconsideration within 5 days.",
    "Claimant expressed concern about timeline. Provided detailed status update.",
  ];

  let auditCount = 0;
  for (let i = 0; i < 150; i++) {
    const actType = activityTypes[i % activityTypes.length];
    const caseRecord = createdCases[i % createdCases.length];
    const createdAtDate = daysAgo(Math.floor(Math.random() * 90) + 1);
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
      changes = { note: noteTexts[i % noteTexts.length] };
    } else if (actType.action === "document_uploaded") {
      const docTemplate = documentTemplates[i % documentTemplates.length];
      changes = {
        fileName: docTemplate.fileName,
        category: docTemplate.category,
      };
    } else if (actType.action === "task_completed") {
      const taskTemplate = taskTemplates[i % taskTemplates.length];
      changes = { taskTitle: taskTemplate.title };
    } else if (actType.action === "field_updated") {
      changes = {
        field: "case_priority",
        oldValue: "Normal",
        newValue: "High",
      };
    }

    await db.insert(schema.auditLog).values({
      organizationId,
      userId,
      entityType: actType.entityType,
      entityId: caseRecord.id, // Use case ID as entity for simplicity
      action: actType.action,
      changes,
      metadata: { source: "demo_seed" },
      createdAt: createdAtDate,
    });
    auditCount++;
  }
  console.log(`Created ${auditCount} audit log entries`);

  // -------------------------------------------------------------------------
  // 6. Create 20 Calendar Events
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 20 calendar events ---");

  const eventDefs: {
    titleFn: (c: CaseRecord) => string;
    eventType:
      | "hearing"
      | "deadline"
      | "appointment"
      | "follow_up"
      | "reminder";
    dayOffset: number; // days from now
  }[] = [
    // Upcoming hearings (6)
    {
      titleFn: (c) => `Hearing: ${c.firstName} ${c.lastName} (${c.caseNumber})`,
      eventType: "hearing",
      dayOffset: 7,
    },
    {
      titleFn: (c) => `Hearing: ${c.firstName} ${c.lastName} (${c.caseNumber})`,
      eventType: "hearing",
      dayOffset: 14,
    },
    {
      titleFn: (c) => `Hearing: ${c.firstName} ${c.lastName} (${c.caseNumber})`,
      eventType: "hearing",
      dayOffset: 21,
    },
    {
      titleFn: (c) => `Hearing: ${c.firstName} ${c.lastName} (${c.caseNumber})`,
      eventType: "hearing",
      dayOffset: 30,
    },
    {
      titleFn: (c) => `Hearing: ${c.firstName} ${c.lastName} (${c.caseNumber})`,
      eventType: "hearing",
      dayOffset: 45,
    },
    {
      titleFn: (c) => `Hearing: ${c.firstName} ${c.lastName} (${c.caseNumber})`,
      eventType: "hearing",
      dayOffset: 60,
    },
    // Deadlines (5)
    {
      titleFn: (c) => `Reconsideration filing deadline — ${c.caseNumber}`,
      eventType: "deadline",
      dayOffset: 3,
    },
    {
      titleFn: (c) => `SSA document submission deadline — ${c.caseNumber}`,
      eventType: "deadline",
      dayOffset: 5,
    },
    {
      titleFn: (c) => `Appeal deadline — ${c.caseNumber}`,
      eventType: "deadline",
      dayOffset: 10,
    },
    {
      titleFn: (c) => `Pre-hearing brief due — ${c.caseNumber}`,
      eventType: "deadline",
      dayOffset: 12,
    },
    {
      titleFn: (c) => `Exhibit submission deadline — ${c.caseNumber}`,
      eventType: "deadline",
      dayOffset: 18,
    },
    // Appointments (5)
    {
      titleFn: (c) => `Client meeting: ${c.firstName} ${c.lastName}`,
      eventType: "appointment",
      dayOffset: 2,
    },
    {
      titleFn: (c) => `Hearing prep: ${c.firstName} ${c.lastName}`,
      eventType: "appointment",
      dayOffset: 4,
    },
    {
      titleFn: (c) => `Consultative exam: ${c.firstName} ${c.lastName}`,
      eventType: "appointment",
      dayOffset: 8,
    },
    {
      titleFn: (c) => `Intake consultation: ${c.firstName} ${c.lastName}`,
      eventType: "appointment",
      dayOffset: 1,
    },
    {
      titleFn: (c) => `Case review meeting — ${c.caseNumber}`,
      eventType: "appointment",
      dayOffset: 6,
    },
    // Follow-ups (4)
    {
      titleFn: (c) =>
        `Follow up with ${c.firstName} ${c.lastName} re: missing docs`,
      eventType: "follow_up",
      dayOffset: 2,
    },
    {
      titleFn: (c) => `Follow up on records request — ${c.caseNumber}`,
      eventType: "follow_up",
      dayOffset: 5,
    },
    {
      titleFn: (c) => `Follow up with SSA office — ${c.caseNumber}`,
      eventType: "follow_up",
      dayOffset: 9,
    },
    {
      titleFn: (c) => `Check on medical records status — ${c.caseNumber}`,
      eventType: "follow_up",
      dayOffset: 11,
    },
  ];

  let eventCount = 0;
  for (let i = 0; i < 20; i++) {
    const def = eventDefs[i];
    const caseRecord = createdCases[i % createdCases.length];
    const startAt = daysFromNow(def.dayOffset);
    // Set hearing times to business hours
    startAt.setHours(9 + Math.floor(Math.random() * 7), 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000); // 1 hour

    await db.insert(schema.calendarEvents).values({
      organizationId,
      caseId: caseRecord.id,
      title: def.titleFn(caseRecord),
      description:
        def.eventType === "hearing"
          ? `${randomItem(["Video", "In Person", "Phone"])} hearing before ${randomItem(aljNames)} at ${randomItem(hearingOffices)}.`
          : null,
      eventType: def.eventType,
      startAt,
      endAt,
      allDay: def.eventType === "deadline",
      location:
        def.eventType === "hearing"
          ? `${randomItem(hearingOffices)}, Video Hearing Room`
          : def.eventType === "appointment"
            ? "Hogan & Smith Law — Conference Room A"
            : null,
      hearingOffice:
        def.eventType === "hearing" ? randomItem(hearingOffices) : null,
      adminLawJudge: def.eventType === "hearing" ? randomItem(aljNames) : null,
      createdBy:
        def.eventType === "hearing" ? hearingsUser.id : randomItem(allUserIds),
    });
    eventCount++;
  }
  console.log(`Created ${eventCount} calendar events`);

  // -------------------------------------------------------------------------
  // 7. Create 15 Leads
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 15 leads ---");

  const leadStatuses: (
    | "new"
    | "contacted"
    | "intake_scheduled"
    | "intake_in_progress"
    | "contract_sent"
    | "contract_signed"
    | "declined"
    | "unresponsive"
  )[] = [
    "new",
    "new",
    "new",
    "contacted",
    "contacted",
    "intake_scheduled",
    "intake_scheduled",
    "intake_in_progress",
    "intake_in_progress",
    "contract_sent",
    "contract_sent",
    "contract_signed",
    "declined",
    "unresponsive",
    "unresponsive",
  ];

  const leadSources = [
    "website",
    "referral",
    "social_media",
    "tv_radio",
    "previous_client",
    "other",
  ];

  const leadNotes = [
    "Potential SSDI claim — has been out of work for 8 months due to back injury.",
    "Referred by existing client. Reports severe anxiety and depression.",
    "Called in from TV ad. Diabetes with neuropathy, unable to stand for long periods.",
    "Website form submission. Multiple physical impairments after car accident.",
    "Walk-in. Previously denied at initial level, looking for representation for reconsideration.",
    "Referral from Dr. Chang. Chronic pain patient unable to maintain employment.",
    "Left message, called back twice. Reports bipolar disorder and PTSD.",
    "Social media inquiry. Young claimant with onset of MS symptoms.",
    "Existing client's family member. Heart failure diagnosis, stopped working 3 months ago.",
    "Website inquiry. Claims severe COPD, on supplemental oxygen.",
    "Phone intake started. Reports traumatic brain injury from workplace accident.",
    "Referred by attorney Bernstein. Complex case with multiple impairments.",
    "Called in, was initially interested but decided to wait before filing.",
    "Left three voicemails over two weeks. No response.",
    "Submitted web form two weeks ago. Called once, no answer, no voicemail.",
  ];

  let leadCount = 0;
  for (let i = 0; i < 15; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const createdAtDate = daysAgo(Math.floor(Math.random() * 45) + 1);

    await db.insert(schema.leads).values({
      organizationId,
      firstName,
      lastName,
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
      phone: faker.phone.number({ style: "national" }),
      status: leadStatuses[i],
      source: randomItem(leadSources),
      assignedToId: intakeUser.id,
      notes: leadNotes[i],
      lastContactedAt:
        leadStatuses[i] !== "new"
          ? daysAgo(Math.floor(Math.random() * 10) + 1)
          : null,
      intakeData:
        leadStatuses[i] === "intake_in_progress" ||
        leadStatuses[i] === "contract_sent" ||
        leadStatuses[i] === "contract_signed"
          ? {
              disability: randomItem(disabilityDescriptions),
              currentlyWorking: false,
              lastDateWorked: faker.date
                .between({
                  from: new Date("2024-01-01"),
                  to: new Date("2025-12-31"),
                })
                .toISOString()
                .split("T")[0],
            }
          : {},
      createdAt: createdAtDate,
      createdBy: intakeUser.id,
    });
    leadCount++;
  }
  console.log(`Created ${leadCount} leads`);

  // -------------------------------------------------------------------------
  // 8. Create 30 Communications / Messages
  // -------------------------------------------------------------------------

  console.log("\n--- Creating 30 communications ---");

  const messageTemplates = [
    // Inbound messages
    {
      type: "message_inbound" as const,
      subject: "Question about my case",
      body: "Hi, I wanted to check on the status of my disability case. It's been a few weeks since I heard anything. Can you let me know where things stand?",
    },
    {
      type: "message_inbound" as const,
      subject: "Medical records update",
      body: "I just had my appointment with Dr. Mitchell and they said they would send over the updated records. Wanted to make sure you received them.",
    },
    {
      type: "message_inbound" as const,
      subject: "Address change",
      body: "I recently moved to a new address. My new address is 1234 Oak Street, Birmingham, AL 35203. Please update your records.",
    },
    {
      type: "message_inbound" as const,
      subject: "Hearing date question",
      body: "I received a letter about a hearing date. Can you confirm the time and whether it's in person or by video?",
    },
    {
      type: "message_inbound" as const,
      subject: "New medication",
      body: "My doctor started me on a new medication for my pain. Should I update you on any changes in my treatment?",
    },
    // Outbound messages
    {
      type: "message_outbound" as const,
      subject: "Case status update",
      body: "We wanted to let you know that your application has been filed with the Social Security Administration. We will notify you as soon as we receive any correspondence from SSA.",
    },
    {
      type: "message_outbound" as const,
      subject: "Missing documents needed",
      body: "We are missing a few documents we need to proceed with your case. Please provide your most recent treatment records and the completed function report at your earliest convenience.",
    },
    {
      type: "message_outbound" as const,
      subject: "Hearing scheduled",
      body: "Your hearing has been scheduled. We will be sending you detailed preparation materials and scheduling a prep meeting in the coming days.",
    },
    {
      type: "message_outbound" as const,
      subject: "Denial received - next steps",
      body: "We received the denial decision on your case. We expected this and are already preparing your reconsideration appeal. We will file it well within the 60-day deadline.",
    },
    {
      type: "message_outbound" as const,
      subject: "Welcome to Hogan & Smith",
      body: "Welcome! We have received your signed retainer agreement and are officially representing you. Your case manager Lisa will be your primary point of contact.",
    },
    // Inbound emails
    {
      type: "email_inbound" as const,
      subject: "Forwarding medical records",
      body: "Please find attached the medical records from my recent hospital visit. Let me know if you need anything else.",
    },
    {
      type: "email_inbound" as const,
      subject: "SSA letter received",
      body: "I received a letter from Social Security today. I'm not sure what it means. I'll scan and send it over.",
    },
    // Outbound emails
    {
      type: "email_outbound" as const,
      subject: "Medical records request",
      body: "Dear Dr. Mitchell, we are writing to request complete medical records for our client. Please find the attached authorization form. Thank you for your prompt attention.",
    },
    {
      type: "email_outbound" as const,
      subject: "Appointment of representative filed",
      body: "We have filed the SSA-1696 Appointment of Representative with the Social Security Administration. You should receive a confirmation notice within 2-3 weeks.",
    },
    // Notes
    {
      type: "note" as const,
      subject: "Internal case note",
      body: "Claimant called to discuss case progress. Reassured that reconsideration is pending. Will follow up once we hear back from SSA.",
    },
  ];

  let commCount = 0;
  for (let i = 0; i < 30; i++) {
    const template = messageTemplates[i % messageTemplates.length];
    const caseRecord = createdCases[i % createdCases.length];
    const createdAtDate = daysAgo(Math.floor(Math.random() * 60) + 1);

    const isInbound = template.type.includes("inbound");
    const fromAddr = isInbound
      ? `${caseRecord.firstName.toLowerCase()}.${caseRecord.lastName.toLowerCase()}@email.com`
      : "info@hogansmith.com";
    const toAddr = isInbound
      ? "info@hogansmith.com"
      : `${caseRecord.firstName.toLowerCase()}.${caseRecord.lastName.toLowerCase()}@email.com`;

    await db.insert(schema.communications).values({
      organizationId,
      caseId: caseRecord.id,
      type: template.type,
      direction: isInbound
        ? "inbound"
        : template.type === "note"
          ? null
          : "outbound",
      subject: template.subject,
      body: template.body,
      fromAddress: template.type === "note" ? null : fromAddr,
      toAddress: template.type === "note" ? null : toAddr,
      userId: template.type === "note" ? randomItem(allUserIds) : null,
      createdAt: createdAtDate,
    });
    commCount++;
  }
  console.log(`Created ${commCount} communications`);

  // -------------------------------------------------------------------------
  // 9. Custom field values for a subset of cases
  // -------------------------------------------------------------------------

  console.log("\n--- Creating custom field values ---");

  let cfvCount = 0;

  // Look up field definitions by slug
  const fieldBySlug = new Map(customFieldDefs.map((f) => [f.slug, f]));

  for (let i = 0; i < createdCases.length; i++) {
    const caseRecord = createdCases[i];

    // Disability description (for first 30 cases)
    const disabilityField = fieldBySlug.get("disability_description");
    if (disabilityField && i < 30) {
      await db
        .insert(schema.customFieldValues)
        .values({
          caseId: caseRecord.id,
          fieldDefinitionId: disabilityField.id,
          textValue: disabilityDescriptions[i % disabilityDescriptions.length],
          updatedBy: intakeUser.id,
        })
        .onConflictDoNothing();
      cfvCount++;
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

    // Primary physician for medical records stage+ cases
    const physicianField = fieldBySlug.get("primary_physician");
    if (physicianField && i < 40) {
      await db
        .insert(schema.customFieldValues)
        .values({
          caseId: caseRecord.id,
          fieldDefinitionId: physicianField.id,
          textValue:
            randomItem(providerNames).first +
            " " +
            randomItem(providerNames).last,
          updatedBy: medRecUser.id,
        })
        .onConflictDoNothing();
      cfvCount++;
    }

    // Referral source for first 25 cases
    const referralField = fieldBySlug.get("referral_source");
    if (referralField && i < 25) {
      await db
        .insert(schema.customFieldValues)
        .values({
          caseId: caseRecord.id,
          fieldDefinitionId: referralField.id,
          textValue: randomItem([
            "Website",
            "Referral",
            "Social Media",
            "TV/Radio",
            "Previous Client",
            "Other",
          ]),
          updatedBy: intakeUser.id,
        })
        .onConflictDoNothing();
      cfvCount++;
    }

    // Filing date for cases past application stage
    const filingDateField = fieldBySlug.get("filing_date");
    if (
      filingDateField &&
      !caseRecord.stageCode.startsWith("1") &&
      caseRecord.stageCode !== "2A"
    ) {
      await db
        .insert(schema.customFieldValues)
        .values({
          caseId: caseRecord.id,
          fieldDefinitionId: filingDateField.id,
          dateValue: daysAgo(Math.floor(Math.random() * 120) + 30),
          updatedBy: filingUser.id,
        })
        .onConflictDoNothing();
      cfvCount++;
    }

    // Hearing details for hearing stage cases
    if (
      caseRecord.stageCode.startsWith("4") ||
      caseRecord.stageCode.startsWith("5")
    ) {
      const hearingDateField = fieldBySlug.get("hearing_date");
      if (hearingDateField) {
        await db
          .insert(schema.customFieldValues)
          .values({
            caseId: caseRecord.id,
            fieldDefinitionId: hearingDateField.id,
            dateValue:
              caseRecord.stageCode === "4D"
                ? daysFromNow(Math.floor(Math.random() * 60) + 7)
                : daysAgo(Math.floor(Math.random() * 30)),
            updatedBy: hearingsUser.id,
          })
          .onConflictDoNothing();
        cfvCount++;
      }

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

      const aljField = fieldBySlug.get("alj_name");
      if (aljField) {
        await db
          .insert(schema.customFieldValues)
          .values({
            caseId: caseRecord.id,
            fieldDefinitionId: aljField.id,
            textValue: randomItem(aljNames),
            updatedBy: hearingsUser.id,
          })
          .onConflictDoNothing();
        cfvCount++;
      }
    }

    // Decision info for resolved cases
    if (caseRecord.stageCode.startsWith("5")) {
      const decisionDateField = fieldBySlug.get("decision_date");
      if (decisionDateField) {
        await db
          .insert(schema.customFieldValues)
          .values({
            caseId: caseRecord.id,
            fieldDefinitionId: decisionDateField.id,
            dateValue: daysAgo(Math.floor(Math.random() * 30) + 1),
            updatedBy: caseMgrUser.id,
          })
          .onConflictDoNothing();
        cfvCount++;
      }

      const decisionTypeField = fieldBySlug.get("decision_type");
      if (decisionTypeField) {
        const decisionType =
          caseRecord.stageCode === "5A"
            ? randomItem(["Fully Favorable", "Partially Favorable"])
            : caseRecord.stageCode === "5B"
              ? "Unfavorable"
              : "Dismissed";
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

    // Currently working (boolean) for intake-stage cases
    const workingField = fieldBySlug.get("currently_working");
    if (workingField && i < 20) {
      await db
        .insert(schema.customFieldValues)
        .values({
          caseId: caseRecord.id,
          fieldDefinitionId: workingField.id,
          booleanValue: false,
          updatedBy: intakeUser.id,
        })
        .onConflictDoNothing();
      cfvCount++;
    }
  }
  console.log(`Created ${cfvCount} custom field values`);

  // -------------------------------------------------------------------------
  // 10. Stage transitions for cases (to have history)
  // -------------------------------------------------------------------------

  console.log("\n--- Creating stage transitions ---");

  let transitionCount = 0;
  const stageSequence = [
    "1A",
    "2A",
    "2B",
    "2E",
    "3A",
    "3B",
    "3C",
    "3D",
    "3E",
    "4A",
    "4B",
    "4C",
    "4D",
    "4E",
    "5A",
  ];

  for (const caseRecord of createdCases) {
    // Build the path this case took through stages
    const currentIdx = stageSequence.indexOf(caseRecord.stageCode);
    if (currentIdx <= 0) continue; // Skip if at first stage or not in sequence

    // Create transitions up to (but not including) the last one, then the last
    const pathLength = Math.min(currentIdx, 4); // Max 4 transitions per case for sanity
    const startIdx = currentIdx - pathLength;

    for (let j = startIdx; j < currentIdx; j++) {
      const fromCode = stageSequence[j];
      const toCode = stageSequence[j + 1];
      const fromStage = stageByCode.get(fromCode);
      const toStage = stageByCode.get(toCode);
      if (!fromStage || !toStage) continue;

      const transitionDate = daysAgo(
        Math.floor(Math.random() * 90) + (currentIdx - j) * 10,
      );

      await db.insert(schema.caseStageTransitions).values({
        caseId: caseRecord.id,
        fromStageId: fromStage.id,
        toStageId: toStage.id,
        transitionedAt: transitionDate,
        transitionedBy: randomItem(allUserIds),
        notes: j === currentIdx - 1 ? `Moved to ${toStage.name}` : null,
        isAutomatic: Math.random() < 0.3,
      });
      transitionCount++;
    }
  }
  console.log(`Created ${transitionCount} stage transitions`);

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------

  console.log("\n=== Demo data seed complete! ===");
  console.log(`
Summary:
  Cases:           ${createdCases.length}
  Contacts:        ${createdContacts.length}
  Tasks:           ${taskCount}
  Documents:       ${docCount}
  Audit entries:   ${auditCount}
  Calendar events: ${eventCount}
  Leads:           ${leadCount}
  Communications:  ${commCount}
  Custom fields:   ${cfvCount}
  Transitions:     ${transitionCount}
`);

  await client.end();
}

main().catch((err) => {
  console.error("Demo data seed failed:", err);
  process.exit(1);
});
