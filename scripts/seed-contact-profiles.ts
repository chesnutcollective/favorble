/**
 * Contact profile enrichment seed script for Hogan & Smith CaseFlow.
 *
 * Populates existing contacts with rich data across their linked cases so the
 * contact detail page sections (communications, calendar events, medical
 * chronology, audit trail) are well-populated.
 *
 * Run with: npx tsx scripts/seed-contact-profiles.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seed = 77777;
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

function hoursLater(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Seed marker
// ---------------------------------------------------------------------------

const SEED_MARKER = "contact_profiles_seed_v1";

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

  console.log("=== Contact Profile Enrichment Seed ===\n");

  // -----------------------------------------------------------------------
  // 1. Resolve org, users
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

  const userByEmail = new Map(existingUsers.map((u) => [u.email, u]));
  const fallback = existingUsers[0];
  const adminUser = userByEmail.get("admin@hogansmith.com") ?? fallback;
  const intakeUser = userByEmail.get("intake@hogansmith.com") ?? fallback;
  const medRecUser = userByEmail.get("medrec@hogansmith.com") ?? fallback;
  const hearingsUser = userByEmail.get("hearings@hogansmith.com") ?? fallback;
  const caseMgrUser = userByEmail.get("casemgr@hogansmith.com") ?? fallback;
  const attorneyUser = userByEmail.get("attorney@hogansmith.com") ?? fallback;

  // Idempotency check
  const markerCheck = await db.query.auditLog.findFirst({
    where: eq(schema.auditLog.action, SEED_MARKER),
  });
  if (markerCheck) {
    console.log(
      "\nContact profile seed already ran (found marker). Skipping.",
    );
    console.log("To re-seed, delete the marker from audit_log.");
    await client.end();
    return;
  }

  // -----------------------------------------------------------------------
  // 2. Load existing contacts (deduplicated -- pick first per name+type)
  // -----------------------------------------------------------------------

  const allContacts = await db.query.contacts.findMany({
    where: eq(schema.contacts.organizationId, organizationId),
  });

  // Deduplicate by firstName+lastName+contactType, keep first occurrence
  const seen = new Set<string>();
  const contacts: typeof allContacts = [];
  for (const c of allContacts) {
    const key = `${c.firstName}|${c.lastName}|${c.contactType}`;
    if (!seen.has(key)) {
      seen.add(key);
      contacts.push(c);
    }
  }

  const claimants = contacts.filter((c) => c.contactType === "claimant");
  const providers = contacts.filter(
    (c) => c.contactType === "medical_provider",
  );
  const attorneys = contacts.filter((c) => c.contactType === "attorney");
  const ssaOffices = contacts.filter((c) => c.contactType === "ssa_office");
  const experts = contacts.filter((c) => c.contactType === "expert");

  console.log(
    `\nContacts (deduplicated): ${contacts.length} total ` +
      `(${claimants.length} claimants, ${providers.length} providers, ` +
      `${attorneys.length} attorneys, ${ssaOffices.length} SSA offices, ` +
      `${experts.length} experts)`,
  );

  // -----------------------------------------------------------------------
  // 3. Load existing cases & case_contacts
  // -----------------------------------------------------------------------

  const allCases = await db.query.cases.findMany({
    where: eq(schema.cases.organizationId, organizationId),
  });
  console.log(`Found ${allCases.length} cases`);

  const existingCaseContacts = await db
    .select()
    .from(schema.caseContacts)
    .execute();

  // Build map: contactId -> caseIds
  const contactToCases = new Map<string, string[]>();
  for (const cc of existingCaseContacts) {
    const arr = contactToCases.get(cc.contactId) || [];
    arr.push(cc.caseId);
    contactToCases.set(cc.contactId, arr);
  }

  // Grab a pool of cases to link non-claimant contacts to
  const casePool = allCases.slice(0, 20);

  // -----------------------------------------------------------------------
  // 4. Ensure case_contacts links for non-claimant contacts
  // -----------------------------------------------------------------------

  console.log("\n--- Ensuring case_contacts links ---");

  let linksCreated = 0;

  // Link each attorney to 2-3 cases
  for (let i = 0; i < attorneys.length; i++) {
    const attorney = attorneys[i];
    if ((contactToCases.get(attorney.id) || []).length > 0) continue;
    const casesToLink = [casePool[i % casePool.length], casePool[(i + 5) % casePool.length]];
    for (const c of casesToLink) {
      try {
        await db.insert(schema.caseContacts).values({
          caseId: c.id,
          contactId: attorney.id,
          relationship: "referring_attorney",
          isPrimary: false,
        });
        const arr = contactToCases.get(attorney.id) || [];
        arr.push(c.id);
        contactToCases.set(attorney.id, arr);
        linksCreated++;
      } catch {
        // unique constraint -- skip
      }
    }
  }

  // Link each medical provider to 2-3 cases
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    if ((contactToCases.get(provider.id) || []).length > 0) continue;
    const casesToLink = [
      casePool[(i + 2) % casePool.length],
      casePool[(i + 7) % casePool.length],
      casePool[(i + 12) % casePool.length],
    ];
    for (const c of casesToLink) {
      try {
        await db.insert(schema.caseContacts).values({
          caseId: c.id,
          contactId: provider.id,
          relationship: "treating_physician",
          isPrimary: false,
        });
        const arr = contactToCases.get(provider.id) || [];
        arr.push(c.id);
        contactToCases.set(provider.id, arr);
        linksCreated++;
      } catch {
        // unique constraint -- skip
      }
    }
  }

  // Link SSA offices to cases
  for (let i = 0; i < ssaOffices.length; i++) {
    const office = ssaOffices[i];
    if ((contactToCases.get(office.id) || []).length > 0) continue;
    const casesToLink = [
      casePool[(i + 3) % casePool.length],
      casePool[(i + 8) % casePool.length],
    ];
    for (const c of casesToLink) {
      try {
        await db.insert(schema.caseContacts).values({
          caseId: c.id,
          contactId: office.id,
          relationship: "ssa_office",
          isPrimary: false,
        });
        const arr = contactToCases.get(office.id) || [];
        arr.push(c.id);
        contactToCases.set(office.id, arr);
        linksCreated++;
      } catch {
        // skip
      }
    }
  }

  // Link experts to cases
  for (let i = 0; i < experts.length; i++) {
    const expert = experts[i];
    if ((contactToCases.get(expert.id) || []).length > 0) continue;
    const casesToLink = [
      casePool[(i + 4) % casePool.length],
      casePool[(i + 9) % casePool.length],
    ];
    for (const c of casesToLink) {
      try {
        await db.insert(schema.caseContacts).values({
          caseId: c.id,
          contactId: expert.id,
          relationship: "vocational_expert",
          isPrimary: false,
        });
        const arr = contactToCases.get(expert.id) || [];
        arr.push(c.id);
        contactToCases.set(expert.id, arr);
        linksCreated++;
      } catch {
        // skip
      }
    }
  }

  console.log(`  Created ${linksCreated} new case_contacts links`);

  // Helper to get a case for a contact
  function getCaseForContact(contactId: string, idx = 0): string {
    const cases = contactToCases.get(contactId) || [];
    if (cases.length === 0) return casePool[0].id;
    return cases[idx % cases.length];
  }

  // -----------------------------------------------------------------------
  // 5. CLAIMANT enrichment (first 5)
  // -----------------------------------------------------------------------

  console.log("\n--- Enriching claimant contacts ---");

  const targetClaimants = claimants.slice(0, 5);
  let commsCreated = 0;
  let eventsCreated = 0;

  for (const claimant of targetClaimants) {
    const caseId = getCaseForContact(claimant.id);
    const claimantName = `${claimant.firstName} ${claimant.lastName}`;
    const claimantEmail = claimant.email || `${claimant.firstName.toLowerCase()}@email.com`;

    // Communications (3-5 per claimant)
    const claimantComms = [
      {
        type: "email_outbound" as const,
        subject: "Welcome to Hogan & Smith - Your Disability Claim",
        body: `Dear ${claimant.firstName},\n\nThank you for choosing Hogan & Smith to represent you in your Social Security disability claim. We are committed to helping you obtain the benefits you deserve.\n\nPlease find enclosed our retainer agreement and initial questionnaire. We kindly ask that you complete and return these at your earliest convenience.\n\nIf you have any questions, please do not hesitate to contact our office.\n\nBest regards,\nHogan & Smith Law`,
        fromAddress: "intake@hogansmith.com",
        toAddress: claimantEmail,
        userId: intakeUser.id,
        createdAt: daysAgo(randomInt(60, 90)),
      },
      {
        type: "email_inbound" as const,
        subject: "RE: Welcome to Hogan & Smith - Your Disability Claim",
        body: `Hi,\n\nThank you for taking my case. I have completed the questionnaire and attached it to this email. I also wanted to let you know that I have an upcoming appointment with my doctor on the 15th.\n\nPlease let me know if you need anything else from me.\n\nThank you,\n${claimant.firstName}`,
        fromAddress: claimantEmail,
        toAddress: "intake@hogansmith.com",
        userId: intakeUser.id,
        createdAt: daysAgo(randomInt(55, 65)),
      },
      {
        type: "email_outbound" as const,
        subject: `Status Update - ${claimantName} Disability Claim`,
        body: `Dear ${claimant.firstName},\n\nI wanted to provide you with an update on your disability claim. We have submitted your application to the Social Security Administration and are currently awaiting their initial review.\n\nIn the meantime, please continue to attend all medical appointments and keep records of any changes in your condition.\n\nWe will contact you as soon as we receive a response from SSA.\n\nBest regards,\nHogan & Smith Law`,
        fromAddress: "casemgr@hogansmith.com",
        toAddress: claimantEmail,
        userId: caseMgrUser.id,
        createdAt: daysAgo(randomInt(30, 45)),
      },
      {
        type: "email_outbound" as const,
        subject: `Medical Records Request - ${claimantName}`,
        body: `Dear ${claimant.firstName},\n\nWe need to obtain your medical records from the following providers to support your disability claim. Please sign the attached authorization forms and return them to our office:\n\n1. Primary care physician\n2. Any specialists you have seen in the past 12 months\n3. Any hospital or emergency room visits\n\nThese records are essential to building a strong case. Please return the signed forms within 5 business days.\n\nThank you,\nHogan & Smith Law`,
        fromAddress: "medrec@hogansmith.com",
        toAddress: claimantEmail,
        userId: medRecUser.id,
        createdAt: daysAgo(randomInt(20, 35)),
      },
      {
        type: "message_inbound" as const,
        subject: "Question about my hearing",
        body: `I received a notice about a hearing date. Do I need to appear in person or can it be done by phone? Also, what should I expect during the hearing? This is my first time going through this process and I'm a bit nervous. Thank you.`,
        fromAddress: claimantEmail,
        toAddress: "hearings@hogansmith.com",
        userId: hearingsUser.id,
        createdAt: daysAgo(randomInt(5, 15)),
      },
    ];

    for (const comm of claimantComms) {
      await db.insert(schema.communications).values({
        organizationId,
        caseId,
        type: comm.type,
        subject: comm.subject,
        body: comm.body,
        fromAddress: comm.fromAddress,
        toAddress: comm.toAddress,
        userId: comm.userId,
        createdAt: comm.createdAt,
      });
      commsCreated++;
    }

    // Calendar events (2-3 per claimant)
    const claimantEvents = [
      {
        title: `Hearing - ${claimantName}`,
        description: `Administrative hearing for the disability claim of ${claimantName}. Claimant and representative to appear before the Administrative Law Judge.`,
        eventType: "hearing" as const,
        startAt: daysFromNow(randomInt(14, 60)),
        location: randomItem([
          "Birmingham ODAR",
          "Atlanta ODAR",
          "Nashville ODAR",
        ]),
        hearingOffice: randomItem([
          "Birmingham ODAR",
          "Atlanta ODAR",
          "Nashville ODAR",
        ]),
        adminLawJudge: randomItem([
          "Hon. Patricia Hartwell",
          "Hon. Robert Chen",
          "Hon. Maria Santos",
        ]),
        createdBy: hearingsUser.id,
      },
      {
        title: `CE Exam - ${claimantName}`,
        description: `Consultative examination scheduled by SSA. ${claimant.firstName} must attend. Bring photo ID and list of current medications.`,
        eventType: "appointment" as const,
        startAt: daysFromNow(randomInt(7, 30)),
        location: randomItem([
          "Southeast Medical Associates, Birmingham, AL",
          "Metro Health Clinic, Atlanta, GA",
          "Volunteer State Medical, Nashville, TN",
        ]),
        hearingOffice: null,
        adminLawJudge: null,
        createdBy: caseMgrUser.id,
      },
      {
        title: `Client Meeting - ${claimantName}`,
        description: `Pre-hearing preparation meeting with ${claimantName}. Review testimony, discuss what to expect at the hearing, and go over medical evidence.`,
        eventType: "appointment" as const,
        startAt: daysAgo(randomInt(1, 10)),
        location: "Hogan & Smith Law Office, 2100 1st Ave N, Birmingham, AL",
        hearingOffice: null,
        adminLawJudge: null,
        createdBy: attorneyUser.id,
      },
    ];

    for (const evt of claimantEvents) {
      await db.insert(schema.calendarEvents).values({
        organizationId,
        caseId,
        title: evt.title,
        description: evt.description,
        eventType: evt.eventType,
        startAt: evt.startAt,
        endAt: hoursLater(evt.startAt, evt.eventType === "hearing" ? 2 : 1),
        location: evt.location,
        hearingOffice: evt.hearingOffice,
        adminLawJudge: evt.adminLawJudge,
        createdBy: evt.createdBy,
      });
      eventsCreated++;
    }
  }

  console.log(
    `  Claimants: ${commsCreated} communications, ${eventsCreated} calendar events`,
  );

  // -----------------------------------------------------------------------
  // 6. MEDICAL PROVIDER enrichment (first 3)
  // -----------------------------------------------------------------------

  console.log("\n--- Enriching medical provider contacts ---");

  const targetProviders = providers.slice(0, 3);
  let medChronCreated = 0;
  let providerEventsCreated = 0;

  const providerSpecialties: Record<string, { providerType: string; facilityName: string }> = {
    "Mitchell": { providerType: "Primary Care Physician", facilityName: "Southeast Family Medicine" },
    "Chang": { providerType: "Orthopedic Surgeon", facilityName: "Alabama Orthopedic Associates" },
    "Gonzalez": { providerType: "Psychiatrist", facilityName: "Birmingham Behavioral Health Center" },
    "Patel": { providerType: "Neurologist", facilityName: "Southern Neurology Institute" },
    "Freeman": { providerType: "Pain Management Specialist", facilityName: "Advanced Pain Solutions" },
  };

  const medChronTemplates: Record<string, Array<{
    entryType: "office_visit" | "lab_result" | "imaging" | "prescription" | "diagnosis" | "mental_health" | "physical_therapy";
    summary: string;
    details: string;
    diagnoses: string[];
    treatments: string[];
    medications: string[];
  }>> = {
    "Mitchell": [
      {
        entryType: "office_visit",
        summary: "Patient presents with chronic lower back pain radiating to left leg, worsening over past 3 months",
        details: "Patient reports inability to sit for more than 20 minutes or stand for more than 15 minutes. Pain rated 7/10 on VAS scale. Positive straight leg raise test bilaterally. Decreased range of motion in lumbar spine. Referred for MRI and orthopedic consultation.",
        diagnoses: ["M54.5 - Low back pain", "M54.41 - Lumbago with sciatica, left side", "G89.29 - Other chronic pain"],
        treatments: ["Physical therapy referral", "Orthopedic consultation referral", "Activity modification counseling"],
        medications: ["Gabapentin 300mg TID", "Meloxicam 15mg daily", "Cyclobenzaprine 10mg at bedtime"],
      },
      {
        entryType: "lab_result",
        summary: "Comprehensive metabolic panel and CBC with differential - results within normal limits",
        details: "All values within reference ranges. Glucose 95 mg/dL, BUN 14, Creatinine 0.9, AST 22, ALT 19. CBC unremarkable. No signs of infection or metabolic disorder. Continue current medication regimen.",
        diagnoses: ["Z00.00 - Encounter for general adult medical examination"],
        treatments: ["Continue current medication regimen", "Follow-up in 3 months"],
        medications: [],
      },
      {
        entryType: "office_visit",
        summary: "Follow-up visit for chronic pain management and medication review",
        details: "Patient reports medications are providing moderate relief. Pain reduced from 7/10 to 5/10. Still has difficulty with prolonged sitting and standing. MRI results reviewed showing disc herniation at L4-L5. Discussion of treatment options including epidural steroid injections.",
        diagnoses: ["M51.16 - Intervertebral disc disorders with radiculopathy, lumbar region", "M54.5 - Low back pain"],
        treatments: ["Epidural steroid injection referral", "Continue physical therapy"],
        medications: ["Gabapentin increased to 400mg TID", "Meloxicam 15mg daily", "Lidocaine patches PRN"],
      },
      {
        entryType: "prescription",
        summary: "New prescription for tramadol for breakthrough pain episodes",
        details: "Patient experiencing breakthrough pain not adequately controlled by current regimen. Prescribed tramadol 50mg for use during acute flare-ups. Discussed risks, side effects, and importance of not driving while taking this medication. Patient understands and agrees to treatment plan.",
        diagnoses: ["M54.5 - Low back pain", "G89.29 - Other chronic pain"],
        treatments: ["Medication adjustment"],
        medications: ["Tramadol 50mg PRN (max 200mg/day)", "Gabapentin 400mg TID", "Meloxicam 15mg daily"],
      },
      {
        entryType: "office_visit",
        summary: "Quarterly follow-up - functional limitations assessment for disability documentation",
        details: "Patient continues to experience significant functional limitations. Unable to lift more than 10 pounds. Cannot sit for more than 30 minutes or stand for more than 20 minutes without position changes. Has difficulty with bending, stooping, and twisting. Compliant with all treatment recommendations. RFC form completed for attorney.",
        diagnoses: ["M51.16 - Intervertebral disc disorders with radiculopathy, lumbar region", "M54.5 - Low back pain", "G89.29 - Other chronic pain"],
        treatments: ["Continue current treatment plan", "RFC form completed", "Follow-up in 3 months"],
        medications: ["Gabapentin 400mg TID", "Meloxicam 15mg daily", "Tramadol 50mg PRN", "Lidocaine patches PRN"],
      },
    ],
    "Chang": [
      {
        entryType: "office_visit",
        summary: "Initial orthopedic consultation for chronic lower back pain with radiculopathy",
        details: "Referred by Dr. Mitchell for evaluation. Physical examination reveals limited range of motion in lumbar spine, positive Lasegue sign on the left. Neurological exam shows decreased sensation in L5 distribution. Reviewed MRI showing L4-L5 disc herniation with nerve root compression.",
        diagnoses: ["M51.16 - Intervertebral disc disorders with radiculopathy, lumbar region", "M51.06 - Disc herniation, lumbar region"],
        treatments: ["Epidural steroid injection series recommended", "Surgical consultation if conservative treatment fails"],
        medications: [],
      },
      {
        entryType: "imaging",
        summary: "MRI of lumbar spine shows L4-L5 disc herniation with moderate central canal stenosis",
        details: "MRI Lumbar Spine without contrast: L4-L5 level shows a broad-based disc protrusion with left paracentral component causing moderate central canal stenosis and left lateral recess narrowing. The left L5 nerve root appears compressed. L5-S1 shows mild disc bulge without significant stenosis. No evidence of fracture or tumor. Marrow signal is normal.",
        diagnoses: ["M51.06 - Disc herniation, lumbar region", "M48.06 - Spinal stenosis, lumbar region"],
        treatments: ["Correlate clinically", "Consider epidural steroid injections"],
        medications: [],
      },
      {
        entryType: "office_visit",
        summary: "Post-injection follow-up - partial improvement after first epidural steroid injection",
        details: "Patient received first lumbar epidural steroid injection 2 weeks ago. Reports approximately 40% improvement in radicular symptoms. Still experiencing axial low back pain. Recommends second injection in the series. If no further improvement, may need to discuss surgical options including microdiscectomy.",
        diagnoses: ["M51.16 - Intervertebral disc disorders with radiculopathy, lumbar region"],
        treatments: ["Second epidural steroid injection scheduled", "Continue physical therapy", "Work restrictions: no lifting over 10 lbs"],
        medications: ["Meloxicam 15mg daily"],
      },
      {
        entryType: "imaging",
        summary: "X-ray bilateral knees showing moderate degenerative changes",
        details: "Standing AP and lateral views of bilateral knees: Moderate narrowing of the medial joint space bilaterally, right greater than left. Small osteophyte formation at the tibial spines and femoral condyles bilaterally. No acute fracture or dislocation. Patellofemoral joints show mild changes. Soft tissues unremarkable.",
        diagnoses: ["M17.0 - Bilateral primary osteoarthritis of knee"],
        treatments: ["Consider corticosteroid injections", "Knee braces recommended"],
        medications: [],
      },
    ],
    "Gonzalez": [
      {
        entryType: "mental_health",
        summary: "Initial psychiatric evaluation - major depressive disorder with anxiety features",
        details: "Patient presents with persistent depressed mood, anhedonia, insomnia, poor concentration, and feelings of worthlessness for approximately 8 months. PHQ-9 score: 19 (moderately severe). GAD-7 score: 14 (moderate). History of trauma related to workplace injury. Reports difficulty with daily activities, social withdrawal, and inability to maintain employment. No active suicidal ideation.",
        diagnoses: ["F33.1 - Major depressive disorder, recurrent, moderate", "F41.1 - Generalized anxiety disorder", "F43.10 - Post-traumatic stress disorder, unspecified"],
        treatments: ["Psychotherapy referral - CBT recommended", "Medication management initiated", "Follow-up in 4 weeks"],
        medications: ["Sertraline 50mg daily", "Hydroxyzine 25mg PRN for anxiety"],
      },
      {
        entryType: "mental_health",
        summary: "Follow-up psychiatric visit - medication adjustment, partial response to sertraline",
        details: "Patient reports some improvement in mood since starting sertraline. PHQ-9 score decreased to 15. Sleep still significantly disrupted. Anxiety episodes occurring 3-4 times per week. Started CBT with therapist. Tolerating medication without significant side effects. Increasing sertraline dose.",
        diagnoses: ["F33.1 - Major depressive disorder, recurrent, moderate", "F41.1 - Generalized anxiety disorder"],
        treatments: ["Continue CBT weekly", "Medication dose increase", "Sleep hygiene counseling"],
        medications: ["Sertraline increased to 100mg daily", "Hydroxyzine 25mg PRN", "Trazodone 50mg at bedtime for insomnia"],
      },
      {
        entryType: "mental_health",
        summary: "Psychiatric follow-up - functional capacity assessment for disability claim",
        details: "Patient has been in treatment for 6 months. While mood has partially improved (PHQ-9: 12), significant functional limitations persist. Patient has marked difficulty with concentration and task persistence. Social functioning remains impaired. Cannot handle normal work stress. Frequently misses appointments due to anxiety about leaving home. Mental Residual Functional Capacity form completed.",
        diagnoses: ["F33.1 - Major depressive disorder, recurrent, moderate", "F41.1 - Generalized anxiety disorder", "F43.10 - Post-traumatic stress disorder"],
        treatments: ["Continue current treatment", "MRFC completed for attorney", "Consider adding buspirone"],
        medications: ["Sertraline 100mg daily", "Trazodone 50mg at bedtime", "Hydroxyzine 25mg PRN"],
      },
      {
        entryType: "prescription",
        summary: "Prescription update - adding buspirone for persistent anxiety symptoms",
        details: "Anxiety symptoms remain significant despite sertraline and hydroxyzine. Adding buspirone for long-term anxiety management. Reviewed potential interactions. Patient educated on gradual onset of effect (2-4 weeks). Continue all other medications as prescribed.",
        diagnoses: ["F41.1 - Generalized anxiety disorder"],
        treatments: ["Medication augmentation"],
        medications: ["Buspirone 10mg BID", "Sertraline 100mg daily", "Trazodone 50mg at bedtime", "Hydroxyzine 25mg PRN"],
      },
      {
        entryType: "mental_health",
        summary: "Quarterly psychiatric review - documented ongoing functional limitations",
        details: "Patient continues with moderate depression and anxiety symptoms despite maximal medical treatment. GAD-7: 12. PHQ-9: 11. Cognitive deficits noted in concentration and memory tasks during clinical interview. Patient reports inability to manage household finances, difficulty following multi-step instructions, and significant social isolation. Prognosis for return to competitive employment is guarded.",
        diagnoses: ["F33.1 - Major depressive disorder, recurrent, moderate", "F41.1 - Generalized anxiety disorder", "F43.10 - Post-traumatic stress disorder"],
        treatments: ["Continue current medications and CBT", "Updated treatment summary provided to attorney", "Follow-up in 3 months"],
        medications: ["Sertraline 100mg daily", "Buspirone 10mg BID", "Trazodone 50mg at bedtime", "Hydroxyzine 25mg PRN"],
      },
    ],
  };

  for (const provider of targetProviders) {
    const providerName = `${provider.firstName} ${provider.lastName}`;
    const lastName = provider.lastName;
    const caseIds = contactToCases.get(provider.id) || [casePool[0].id];
    const spec = providerSpecialties[lastName] || {
      providerType: "Physician",
      facilityName: "Medical Associates",
    };

    const templates = medChronTemplates[lastName];
    if (templates) {
      for (let i = 0; i < templates.length; i++) {
        const t = templates[i];
        const caseId = caseIds[i % caseIds.length];
        await db.insert(schema.medicalChronologyEntries).values({
          organizationId,
          caseId,
          entryType: t.entryType,
          eventDate: daysAgo(randomInt(30, 300) + i * 30),
          providerName,
          providerType: spec.providerType,
          facilityName: spec.facilityName,
          summary: t.summary,
          details: t.details,
          diagnoses: t.diagnoses,
          treatments: t.treatments,
          medications: t.medications,
          aiGenerated: false,
          isVerified: true,
          verifiedBy: medRecUser.id,
          verifiedAt: daysAgo(randomInt(1, 10)),
        });
        medChronCreated++;
      }
    }

    // Calendar events for providers
    const providerEvents = [
      {
        title: `Follow-up Appointment - ${providerName}`,
        description: `Scheduled follow-up appointment with ${providerName} at ${spec.facilityName}. Review treatment progress and update functional capacity assessment.`,
        eventType: "follow_up" as const,
        startAt: daysFromNow(randomInt(7, 45)),
        location: spec.facilityName,
        createdBy: medRecUser.id,
      },
      {
        title: `CE Exam with ${providerName}`,
        description: `Consultative examination ordered by SSA. ${providerName} to evaluate claimant's current functional limitations.`,
        eventType: "appointment" as const,
        startAt: daysFromNow(randomInt(14, 60)),
        location: spec.facilityName,
        createdBy: caseMgrUser.id,
      },
    ];

    for (const evt of providerEvents) {
      const caseId = caseIds[0];
      await db.insert(schema.calendarEvents).values({
        organizationId,
        caseId,
        title: evt.title,
        description: evt.description,
        eventType: evt.eventType,
        startAt: evt.startAt,
        endAt: hoursLater(evt.startAt, 1),
        location: evt.location,
        createdBy: evt.createdBy,
      });
      providerEventsCreated++;
    }
  }

  console.log(
    `  Providers: ${medChronCreated} medical chronology entries, ${providerEventsCreated} calendar events`,
  );

  // -----------------------------------------------------------------------
  // 7. ATTORNEY enrichment (first 2)
  // -----------------------------------------------------------------------

  console.log("\n--- Enriching attorney contacts ---");

  const targetAttorneys = attorneys.slice(0, 2);
  let attorneyCommsCreated = 0;

  for (const attorney of targetAttorneys) {
    const attorneyName = `${attorney.firstName} ${attorney.lastName}`;
    const attorneyEmail = attorney.email || `${attorney.lastName.toLowerCase()}@lawfirm.com`;
    const caseId = getCaseForContact(attorney.id);

    const attorneyComms = [
      {
        type: "email_inbound" as const,
        subject: `Referral - New Disability Client`,
        body: `Dear Hogan & Smith,\n\nI am referring a client to your firm for Social Security disability representation. The client has been denied at the initial level and needs experienced representation for the reconsideration and potential hearing.\n\nI have enclosed the client's basic information and the denial letter. Please contact me if you have any questions about the referral.\n\nBest regards,\n${attorneyName}`,
        fromAddress: attorneyEmail,
        toAddress: "intake@hogansmith.com",
        userId: intakeUser.id,
        createdAt: daysAgo(randomInt(60, 120)),
      },
      {
        type: "email_outbound" as const,
        subject: `RE: Case Update - Referred Client`,
        body: `Dear ${attorney.firstName},\n\nThank you for the referral. I wanted to update you on the status of the case. We have filed the request for reconsideration and are currently gathering additional medical evidence.\n\nThe hearing has been scheduled and we are preparing the brief and exhibit packet. We will keep you informed of any significant developments.\n\nPlease let us know if you have any questions.\n\nBest regards,\nHogan & Smith Law`,
        fromAddress: "attorney@hogansmith.com",
        toAddress: attorneyEmail,
        userId: attorneyUser.id,
        createdAt: daysAgo(randomInt(20, 40)),
      },
      {
        type: "email_outbound" as const,
        subject: `Fee Agreement Discussion - Co-Counsel Arrangement`,
        body: `Dear ${attorney.firstName},\n\nI wanted to follow up on our discussion regarding the fee-splitting arrangement for the referred cases. Per our agreement, the standard 25% attorney fee will be divided equally between our firms upon a favorable decision.\n\nI have attached the proposed co-counsel agreement for your review. Please sign and return at your convenience.\n\nBest regards,\nHogan & Smith Law`,
        fromAddress: "admin@hogansmith.com",
        toAddress: attorneyEmail,
        userId: adminUser.id,
        createdAt: daysAgo(randomInt(45, 75)),
      },
    ];

    for (const comm of attorneyComms) {
      await db.insert(schema.communications).values({
        organizationId,
        caseId,
        type: comm.type,
        subject: comm.subject,
        body: comm.body,
        fromAddress: comm.fromAddress,
        toAddress: comm.toAddress,
        userId: comm.userId,
        createdAt: comm.createdAt,
      });
      attorneyCommsCreated++;
    }
  }

  console.log(`  Attorneys: ${attorneyCommsCreated} communications`);

  // -----------------------------------------------------------------------
  // 8. SSA OFFICE enrichment (first 2)
  // -----------------------------------------------------------------------

  console.log("\n--- Enriching SSA office contacts ---");

  const targetSSA = ssaOffices.slice(0, 2);
  let ssaEventsCreated = 0;
  let ssaCommsCreated = 0;

  for (const office of targetSSA) {
    const officeName = `SSA ${office.lastName} Office`;
    const caseIds = contactToCases.get(office.id) || [casePool[0].id];

    // Calendar events - hearings at this office
    const ssaEvents = [
      {
        title: `Hearing at ${officeName}`,
        description: `Administrative Law Judge hearing scheduled at the ${officeName}. Claimant, representative, and vocational expert to appear.`,
        eventType: "hearing" as const,
        startAt: daysFromNow(randomInt(21, 90)),
        location: `${office.lastName} ODAR, ${office.lastName}, ${randomItem(["AL", "GA", "TN"])}`,
        hearingOffice: `${office.lastName} ODAR`,
        adminLawJudge: randomItem([
          "Hon. Patricia Hartwell",
          "Hon. Robert Chen",
          "Hon. William Foster",
        ]),
        createdBy: hearingsUser.id,
      },
      {
        title: `Hearing at ${officeName} - Second Case`,
        description: `Scheduled hearing for a separate claimant at the ${officeName}. Video hearing format.`,
        eventType: "hearing" as const,
        startAt: daysFromNow(randomInt(30, 120)),
        location: `${office.lastName} ODAR, ${office.lastName}, ${randomItem(["AL", "GA", "TN"])}`,
        hearingOffice: `${office.lastName} ODAR`,
        adminLawJudge: randomItem([
          "Hon. Maria Santos",
          "Hon. Angela Richardson",
          "Hon. Susan Yamamoto",
        ]),
        createdBy: hearingsUser.id,
      },
    ];

    for (let i = 0; i < ssaEvents.length; i++) {
      const evt = ssaEvents[i];
      await db.insert(schema.calendarEvents).values({
        organizationId,
        caseId: caseIds[i % caseIds.length],
        title: evt.title,
        description: evt.description,
        eventType: evt.eventType,
        startAt: evt.startAt,
        endAt: hoursLater(evt.startAt, 2),
        location: evt.location,
        hearingOffice: evt.hearingOffice,
        adminLawJudge: evt.adminLawJudge,
        createdBy: evt.createdBy,
      });
      ssaEventsCreated++;
    }

    // Communications from SSA office
    const ssaComms = [
      {
        type: "email_inbound" as const,
        subject: `Notice of Hearing - ${officeName}`,
        body: `SOCIAL SECURITY ADMINISTRATION\nOffice of Disability Adjudication and Review\n${office.lastName} Hearing Office\n\nNOTICE OF HEARING\n\nYou are hereby notified that a hearing has been scheduled in the above-captioned case. The hearing will be held on the date and time specified in the enclosed notice.\n\nPlease acknowledge receipt of this notice and confirm attendance of the claimant and representative.\n\nIf you need to request a postponement, please contact this office immediately.`,
        fromAddress: `odar.${office.lastName.toLowerCase()}@ssa.gov`,
        toAddress: "hearings@hogansmith.com",
        userId: hearingsUser.id,
        createdAt: daysAgo(randomInt(30, 60)),
      },
      {
        type: "email_inbound" as const,
        subject: `Fully Favorable Decision Notice`,
        body: `SOCIAL SECURITY ADMINISTRATION\nOffice of Disability Adjudication and Review\n${office.lastName} Hearing Office\n\nDECISION\n\nAfter careful consideration of the entire record, the Administrative Law Judge finds the claimant has been under a disability as defined in the Social Security Act since the alleged onset date.\n\nThe claimant is entitled to a period of disability and disability insurance benefits.\n\nA copy of the full written decision is enclosed.`,
        fromAddress: `odar.${office.lastName.toLowerCase()}@ssa.gov`,
        toAddress: "attorney@hogansmith.com",
        userId: attorneyUser.id,
        createdAt: daysAgo(randomInt(5, 25)),
      },
    ];

    for (const comm of ssaComms) {
      await db.insert(schema.communications).values({
        organizationId,
        caseId: caseIds[0],
        type: comm.type,
        subject: comm.subject,
        body: comm.body,
        fromAddress: comm.fromAddress,
        toAddress: comm.toAddress,
        userId: comm.userId,
        createdAt: comm.createdAt,
      });
      ssaCommsCreated++;
    }
  }

  console.log(
    `  SSA Offices: ${ssaEventsCreated} calendar events, ${ssaCommsCreated} communications`,
  );

  // -----------------------------------------------------------------------
  // 9. EXPERT enrichment (both experts)
  // -----------------------------------------------------------------------

  console.log("\n--- Enriching expert contacts ---");

  let expertEventsCreated = 0;
  let expertCommsCreated = 0;

  for (const expert of experts.slice(0, 2)) {
    const expertName = `${expert.firstName} ${expert.lastName}`;
    const expertEmail = expert.email || `${expert.lastName.toLowerCase()}@vocationalexperts.com`;
    const caseIds = contactToCases.get(expert.id) || [casePool[0].id];

    // Calendar events - testimony dates
    const expertEvents = [
      {
        title: `VE Testimony - ${expertName}`,
        description: `${expertName} will provide vocational expert testimony at the scheduled hearing. Testimony will cover transferable skills, occupational base, and hypothetical questions from the ALJ.`,
        eventType: "hearing" as const,
        startAt: daysFromNow(randomInt(14, 60)),
        location: randomItem([
          "Birmingham ODAR",
          "Atlanta ODAR",
          "Nashville ODAR",
        ]),
        createdBy: hearingsUser.id,
      },
      {
        title: `VE Testimony - ${expertName} (Second Case)`,
        description: `Vocational expert testimony for a separate hearing. ${expertName} to testify regarding vocational profile and job numbers.`,
        eventType: "hearing" as const,
        startAt: daysFromNow(randomInt(30, 90)),
        location: randomItem([
          "Birmingham ODAR",
          "Atlanta ODAR",
          "Charlotte ODAR",
        ]),
        createdBy: hearingsUser.id,
      },
    ];

    for (let i = 0; i < expertEvents.length; i++) {
      const evt = expertEvents[i];
      await db.insert(schema.calendarEvents).values({
        organizationId,
        caseId: caseIds[i % caseIds.length],
        title: evt.title,
        description: evt.description,
        eventType: evt.eventType,
        startAt: evt.startAt,
        endAt: hoursLater(evt.startAt, 2),
        location: evt.location,
        createdBy: evt.createdBy,
      });
      expertEventsCreated++;
    }

    // Communication - scheduling email
    await db.insert(schema.communications).values({
      organizationId,
      caseId: caseIds[0],
      type: "email_outbound",
      subject: `Hearing Testimony Scheduling - ${expertName}`,
      body: `Dear ${expert.firstName},\n\nWe would like to schedule your testimony as a vocational expert for an upcoming hearing. The hearing is currently set for the date referenced above.\n\nPlease confirm your availability and let us know if you need any additional case materials to prepare your testimony.\n\nWe will send the claimant's vocational profile, work history, and residual functional capacity assessments in advance of the hearing.\n\nThank you for your continued assistance.\n\nBest regards,\nHogan & Smith Law`,
      fromAddress: "hearings@hogansmith.com",
      toAddress: expertEmail,
      userId: hearingsUser.id,
      createdAt: daysAgo(randomInt(10, 30)),
    });
    expertCommsCreated++;
  }

  console.log(
    `  Experts: ${expertEventsCreated} calendar events, ${expertCommsCreated} communications`,
  );

  // -----------------------------------------------------------------------
  // 10. AUDIT LOG entries for ALL contacts
  // -----------------------------------------------------------------------

  console.log("\n--- Creating audit log entries for contacts ---");

  let auditCreated = 0;

  // All deduplicated contacts get audit entries
  for (const contact of contacts) {
    const contactName = `${contact.firstName} ${contact.lastName}`;

    // "create" audit entry
    await db.insert(schema.auditLog).values({
      organizationId,
      userId: contact.createdBy || adminUser.id,
      entityType: "contact",
      entityId: contact.id,
      action: "create",
      changes: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        contactType: contact.contactType,
        email: contact.email,
      },
      createdAt: daysAgo(randomInt(60, 180)),
    });
    auditCreated++;

    // "update" audit entries (2-4 per contact)
    const updateCount = randomInt(2, 4);
    const updateTemplates = [
      {
        action: "update",
        changes: {
          field: "phone",
          description: `Updated phone number for ${contactName}`,
        },
      },
      {
        action: "update",
        changes: {
          field: "email",
          description: `Updated email address for ${contactName}`,
        },
      },
      {
        action: "update",
        changes: {
          field: "address",
          description: `Updated mailing address for ${contactName}`,
        },
      },
      {
        action: "assign",
        changes: {
          description: `Linked ${contactName} to case`,
          relationship: contact.contactType,
        },
      },
    ];

    for (let i = 0; i < updateCount; i++) {
      const template = updateTemplates[i % updateTemplates.length];
      await db.insert(schema.auditLog).values({
        organizationId,
        userId: randomItem(existingUsers).id,
        entityType: "contact",
        entityId: contact.id,
        action: template.action,
        changes: template.changes,
        createdAt: daysAgo(randomInt(1, 60)),
      });
      auditCreated++;
    }
  }

  console.log(`  Created ${auditCreated} audit log entries across ${contacts.length} contacts`);

  // -----------------------------------------------------------------------
  // 11. Insert seed marker
  // -----------------------------------------------------------------------

  await db.insert(schema.auditLog).values({
    organizationId,
    userId: adminUser.id,
    entityType: "system",
    entityId: adminUser.id,
    action: SEED_MARKER,
    changes: {
      seededAt: new Date().toISOString(),
      script: "seed-contact-profiles.ts",
    },
  });

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  console.log("\n=== Contact Profile Enrichment Complete ===");
  console.log(`  Case links created: ${linksCreated}`);
  console.log(`  Communications: ${commsCreated + attorneyCommsCreated + ssaCommsCreated + expertCommsCreated}`);
  console.log(`  Calendar events: ${eventsCreated + providerEventsCreated + ssaEventsCreated + expertEventsCreated}`);
  console.log(`  Medical chronology entries: ${medChronCreated}`);
  console.log(`  Audit log entries: ${auditCreated}`);

  await client.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
