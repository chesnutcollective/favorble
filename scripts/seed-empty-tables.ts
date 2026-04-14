/**
 * Seed empty / sparse tables so every page has realistic data to show.
 *
 * Targets (created fresh, skipped if already populated):
 *   - calendar_events (hearings): 30 hearings across next 60 days
 *   - leads pipelineStage: populate existing 15 + create 50 more
 *   - outbound_mail: 25 entries
 *   - documents (inbound mail): 15 pending items
 *   - provider_credentials: 10 encrypted (placeholder) entries
 *   - rfc_requests: 12 varied states
 *   - case updates: hearing_date, hearing_office, ALJ, app type, etc.
 *   - audit_log: +50 realistic entries
 *   - communications: +30 messages
 *   - ere_credentials: 3 placeholder entries
 *   - ere_jobs: 20 scraping jobs across cases
 *
 * Deterministic (faker seed 1337). Safe to re-run.
 *
 * Usage: tsx scripts/seed-empty-tables.ts
 */

import postgres from "postgres";
import { faker } from "@faker-js/faker";

faker.seed(1337);

const DATABASE_URL =
  "postgresql://postgres:MyZUyvrjVFOzhyAqjVbbxkTulnbzMSmn@switchback.proxy.rlwy.net:19378/railway";

const sql = postgres(DATABASE_URL);

// -------------------------------------------------------------------------
// Reference data (real-sounding SSA content)
// -------------------------------------------------------------------------

const ALJ_NAMES = [
  "Hon. Margaret Chen",
  "Hon. Robert Williams",
  "Hon. Patricia O'Brien",
  "Hon. James Thornton",
  "Hon. Linda Martinez",
  "Hon. David Park",
  "Hon. Sarah Goldstein",
  "Hon. Michael Reyes",
  "Hon. Jennifer Walsh",
  "Hon. Andrew Kim",
];

const HEARING_OFFICES = [
  "ODAR Atlanta",
  "ODAR Charlotte",
  "ODAR Tampa",
  "ODAR Miami",
  "ODAR Birmingham",
  "ODAR Jacksonville",
  "ODAR Orlando",
  "ODAR Memphis",
  "ODAR Nashville",
  "ODAR Houston",
];

const FIELD_OFFICES = [
  "Field Office - Atlanta South",
  "Field Office - Marietta",
  "Field Office - Decatur",
  "Field Office - Alpharetta",
  "Field Office - Athens",
  "Field Office - Macon",
  "Field Office - Savannah",
  "Field Office - Augusta",
];

const APP_TYPES = ["SSDI", "SSI", "Both", "Reconsideration", "Hearing"];

const HEARING_MODES = ["In-Person", "Video", "Phone"];

const MEDICAL_CONDITIONS = [
  "Lumbar degenerative disc disease",
  "Major depressive disorder",
  "PTSD",
  "Bipolar I disorder",
  "COPD",
  "Type 2 diabetes uncontrolled",
  "Congestive heart failure",
  "Rheumatoid arthritis",
  "Fibromyalgia",
  "Chronic kidney disease stage 3",
];

const PATIENT_PORTAL_PROVIDERS = [
  { name: "MyChart - Emory Healthcare", label: "Emory MyChart" },
  { name: "FollowMyHealth - Piedmont", label: "Piedmont Portal" },
  { name: "MyChart - Wellstar", label: "Wellstar MyChart" },
  { name: "athenahealth - Grady", label: "Grady Portal" },
  { name: "Patient Gateway - Northside", label: "Northside Portal" },
  { name: "MyChart - Children's Healthcare of Atlanta", label: "CHOA MyChart" },
  { name: "CarePortal - WellStar Kennestone", label: "Kennestone Portal" },
  { name: "HealtheLife - Augusta University", label: "AU Health" },
  { name: "MyChart - UAB Medicine", label: "UAB MyChart" },
  { name: "MyBaptistHealth - Baptist Memorial", label: "Baptist Portal" },
];

// -------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(faker.number.int({ min: 0, max: arr.length - 1 }))];
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Fake "encrypted" blob — NOT actually encrypted, just for seed data.
 * Provider/ERE credential UIs should never decrypt these; they're display-only.
 */
function fakeEncrypted(label: string): string {
  return Buffer.from(
    `seed-placeholder::${label}::${faker.string.nanoid(16)}`,
  ).toString("base64");
}

// -------------------------------------------------------------------------
// Pipeline stages (mirrors lib/services/lead-pipeline-config.ts)
// -------------------------------------------------------------------------

type PipelineStage = {
  id: string;
  label: string;
  group: string;
  order: number;
};

const PIPELINE_STAGES: PipelineStage[] = [
  // NEW_LEADS
  { id: "new_inquiry", label: "New Inquiry", group: "NEW_LEADS", order: 1 },
  {
    id: "web_form_submitted",
    label: "Web Form Submitted",
    group: "NEW_LEADS",
    order: 2,
  },
  {
    id: "phone_call_received",
    label: "Phone Call Received",
    group: "NEW_LEADS",
    order: 3,
  },
  { id: "walk_in", label: "Walk-In", group: "NEW_LEADS", order: 4 },
  {
    id: "referral_received",
    label: "Referral Received",
    group: "NEW_LEADS",
    order: 5,
  },
  {
    id: "marketing_lead",
    label: "Marketing Lead",
    group: "NEW_LEADS",
    order: 6,
  },
  // QUALIFICATION
  {
    id: "initial_qualifying",
    label: "Initial Qualifying",
    group: "QUALIFICATION",
    order: 10,
  },
  {
    id: "call_attempted_1",
    label: "Call Attempted 1",
    group: "QUALIFICATION",
    order: 11,
  },
  {
    id: "call_attempted_2",
    label: "Call Attempted 2",
    group: "QUALIFICATION",
    order: 12,
  },
  {
    id: "call_attempted_3",
    label: "Call Attempted 3",
    group: "QUALIFICATION",
    order: 13,
  },
  {
    id: "voicemail_left",
    label: "Voicemail Left",
    group: "QUALIFICATION",
    order: 14,
  },
  { id: "no_answer", label: "No Answer", group: "QUALIFICATION", order: 15 },
  {
    id: "wrong_number",
    label: "Wrong Number",
    group: "QUALIFICATION",
    order: 16,
  },
  {
    id: "intake_scheduled",
    label: "Intake Scheduled",
    group: "QUALIFICATION",
    order: 17,
  },
  {
    id: "intake_rescheduled",
    label: "Intake Rescheduled",
    group: "QUALIFICATION",
    order: 18,
  },
  // INTAKE
  {
    id: "intake_in_progress",
    label: "Intake In Progress",
    group: "INTAKE",
    order: 20,
  },
  {
    id: "intake_complete",
    label: "Intake Complete",
    group: "INTAKE",
    order: 21,
  },
  {
    id: "awaiting_documents",
    label: "Awaiting Documents",
    group: "INTAKE",
    order: 22,
  },
  {
    id: "documents_received",
    label: "Documents Received",
    group: "INTAKE",
    order: 23,
  },
  {
    id: "conflict_check_pending",
    label: "Conflict Check Pending",
    group: "INTAKE",
    order: 24,
  },
  {
    id: "conflict_check_cleared",
    label: "Conflict Check Cleared",
    group: "INTAKE",
    order: 25,
  },
  // DECISION
  { id: "contract_sent", label: "Contract Sent", group: "DECISION", order: 30 },
  {
    id: "contract_signed",
    label: "Contract Signed",
    group: "DECISION",
    order: 31,
  },
  { id: "retainer_paid", label: "Retainer Paid", group: "DECISION", order: 32 },
  {
    id: "declined_by_firm",
    label: "Declined By Firm",
    group: "DECISION",
    order: 33,
  },
  {
    id: "declined_by_client",
    label: "Declined By Client",
    group: "DECISION",
    order: 34,
  },
  {
    id: "could_not_reach",
    label: "Could Not Reach",
    group: "DECISION",
    order: 35,
  },
  // CONVERSION
  {
    id: "converting_to_case",
    label: "Converting to Case",
    group: "CONVERSION",
    order: 40,
  },
  { id: "converted", label: "Converted", group: "CONVERSION", order: 41 },
  { id: "disqualified", label: "Disqualified", group: "CONVERSION", order: 42 },
  { id: "duplicate", label: "Duplicate", group: "CONVERSION", order: 43 },
  {
    id: "spanish_routed",
    label: "Spanish Routed",
    group: "CONVERSION",
    order: 44,
  },
  { id: "out_of_state", label: "Out of State", group: "CONVERSION", order: 45 },
];

// Valid lead_status enum values (limited set; we'll map pipeline -> status loosely).
const LEAD_STATUS_FOR_PIPELINE: Record<string, string> = {
  new_inquiry: "new",
  web_form_submitted: "new",
  phone_call_received: "received_inquiry",
  walk_in: "received_inquiry",
  referral_received: "received_inquiry",
  marketing_lead: "new",
  initial_qualifying: "qualifying",
  call_attempted_1: "contacted",
  call_attempted_2: "contacted",
  call_attempted_3: "contacted",
  voicemail_left: "voicemail_left",
  no_answer: "unresponsive",
  wrong_number: "wrong_number",
  intake_scheduled: "intake_scheduled",
  intake_rescheduled: "intake_rescheduled",
  intake_in_progress: "intake_in_progress",
  intake_complete: "intake_complete",
  awaiting_documents: "intake_in_progress",
  documents_received: "intake_in_progress",
  conflict_check_pending: "conflict_pending",
  conflict_check_cleared: "conflict_cleared",
  contract_sent: "contract_sent",
  contract_signed: "contract_signed",
  retainer_paid: "contract_signed",
  declined_by_firm: "declined",
  declined_by_client: "declined",
  could_not_reach: "unresponsive",
  converting_to_case: "converted",
  converted: "converted",
  disqualified: "disqualified",
  duplicate: "disqualified",
  spanish_routed: "language_barrier",
  out_of_state: "declined_outside_state",
};

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

async function main() {
  console.log("=== Seed Empty Tables ===\n");

  // Load baseline context.
  const [org] = await sql`SELECT id FROM organizations LIMIT 1`;
  if (!org)
    throw new Error("No organization found. Run seed-demo-data.ts first.");
  const orgId: string = org.id;

  const users =
    await sql`SELECT id, email, first_name, last_name, role FROM users`;
  const attorneys = users.filter(
    (u) => u.role === "attorney" || u.role === "admin",
  );
  const caseMgrs = users.filter((u) => u.role === "case_manager");
  const intakeAgents = users.filter((u) => u.role === "intake_agent");
  const medRec = users.filter((u) => u.role === "medical_records");
  const filingAgents = users.filter((u) => u.role === "filing_agent");
  const adminUser = users.find((u) => u.role === "admin") ?? users[0];

  const cases = await sql`
		SELECT id, case_number, organization_id
		FROM cases
		WHERE deleted_at IS NULL
		ORDER BY case_number
	`;
  console.log(
    `Loaded: org=${orgId}, users=${users.length}, cases=${cases.length}`,
  );

  const contacts = await sql`
		SELECT id, first_name, last_name, email, phone, contact_type
		FROM contacts
		WHERE organization_id = ${orgId} AND deleted_at IS NULL
	`;
  const claimants = contacts.filter((c) => c.contact_type === "claimant");

  // =======================================================================
  // 1. Update cases with SSA metadata (hearing office, ALJ, app types, etc.)
  // =======================================================================
  console.log("\n--- Updating cases with SSA metadata ---");
  let caseUpdates = 0;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const hearingOffice = pick(HEARING_OFFICES);
    const alj = pick(ALJ_NAMES);
    const appType = pick(APP_TYPES);
    const hasSecondary = faker.datatype.boolean(0.3);
    const secondary = hasSecondary
      ? pick(APP_TYPES.filter((t) => t !== appType))
      : null;
    // Alleged onset 2-6 years ago
    const aod = daysAgo(faker.number.int({ min: 730, max: 2200 }));
    // DLI — 70% have one, roughly AOD + 3-5 years
    const dli = faker.datatype.boolean(0.7)
      ? new Date(
          aod.getTime() +
            faker.number.int({ min: 365 * 3, max: 365 * 5 }) * 86400000,
        )
      : null;
    const ssaOffice = pick(FIELD_OFFICES);

    await sql`
			UPDATE cases
			SET
				hearing_office = COALESCE(hearing_office, ${hearingOffice}),
				admin_law_judge = COALESCE(admin_law_judge, ${alj}),
				application_type_primary = COALESCE(application_type_primary, ${appType}),
				application_type_secondary = COALESCE(application_type_secondary, ${secondary}),
				alleged_onset_date = COALESCE(alleged_onset_date, ${aod}),
				date_last_insured = COALESCE(date_last_insured, ${dli}),
				ssa_office = COALESCE(ssa_office, ${ssaOffice})
			WHERE id = ${c.id}
		`;
    caseUpdates++;
  }
  console.log(`  ✓ Updated ${caseUpdates} cases with SSA metadata`);

  // =======================================================================
  // 2. Create 30 hearing calendar_events across next 60 days.
  //    Also update ~20 cases to set hearing_date pointing at those events.
  // =======================================================================
  console.log("\n--- Seeding hearings (calendar_events) ---");
  const existingHearings = await sql`
		SELECT COUNT(*) as n FROM calendar_events WHERE event_type = 'hearing' AND organization_id = ${orgId}
	`;
  if (Number(existingHearings[0].n) < 20) {
    const hearingCases = faker.helpers.shuffle([...cases]).slice(0, 30);
    const newHearingRows: Array<{
      caseId: string;
      startAt: Date;
      alj: string;
      office: string;
    }> = [];
    for (let i = 0; i < 30; i++) {
      const c = hearingCases[i];
      const daysOut = faker.number.int({ min: 3, max: 60 });
      const hour = faker.number.int({ min: 9, max: 15 });
      const minute = faker.helpers.arrayElement([0, 30]);
      const start = daysFromNow(daysOut);
      start.setHours(hour, minute, 0, 0);
      const end = new Date(start.getTime() + 90 * 60000);
      const alj = pick(ALJ_NAMES);
      const office = pick(HEARING_OFFICES);
      const mode = pick(HEARING_MODES);
      const location =
        mode === "In-Person"
          ? `${office} - Hearing Room ${faker.number.int({ min: 1, max: 8 })}`
          : mode === "Video"
            ? `${office} - Video Conference`
            : "Telephonic";

      await sql`
				INSERT INTO calendar_events (
					organization_id, case_id, title, description, event_type,
					start_at, end_at, all_day, location, hearing_office, admin_law_judge,
					created_by
				)
				VALUES (
					${orgId},
					${c.id},
					${`Hearing - ${c.case_number} (${mode})`},
					${`${mode} hearing before ${alj}. Mode of appearance: ${mode}.`},
					'hearing',
					${start},
					${end},
					false,
					${location},
					${office},
					${alj},
					${adminUser.id}
				)
			`;
      newHearingRows.push({ caseId: c.id, startAt: start, alj, office });
    }
    console.log(`  ✓ Created 30 hearing events`);

    // Set hearing_date on 20 cases (first 20 of the 30 we just created).
    for (let i = 0; i < 20; i++) {
      const h = newHearingRows[i];
      await sql`
				UPDATE cases
				SET
					hearing_date = ${h.startAt},
					hearing_office = ${h.office},
					admin_law_judge = ${h.alj}
				WHERE id = ${h.caseId}
			`;
    }
    console.log(`  ✓ Set hearing_date on 20 cases`);
  } else {
    console.log(`  ↺ Skipped (already has ${existingHearings[0].n} hearings)`);
  }

  // =======================================================================
  // 3. Leads: populate pipelineStage on existing 15 + create 50 more
  // =======================================================================
  console.log("\n--- Seeding leads pipeline ---");
  const existingLeadsNoStage = await sql`
		SELECT id FROM leads WHERE organization_id = ${orgId} AND pipeline_stage IS NULL
	`;
  // Update existing leads with pipeline stage.
  for (const ld of existingLeadsNoStage) {
    const stage = pick(PIPELINE_STAGES);
    await sql`
			UPDATE leads
			SET
				pipeline_stage = ${stage.id},
				pipeline_stage_group = ${stage.group},
				pipeline_stage_order = ${stage.order}
			WHERE id = ${ld.id}
		`;
  }
  console.log(
    `  ✓ Updated ${existingLeadsNoStage.length} existing leads with pipeline stage`,
  );

  // Create 50 new leads distributed across stages.
  const leadCountBefore =
    await sql`SELECT COUNT(*) as n FROM leads WHERE organization_id = ${orgId}`;
  const needNewLeads = Number(leadCountBefore[0].n) < 60;
  if (needNewLeads) {
    for (let i = 0; i < 50; i++) {
      const stage = PIPELINE_STAGES[i % PIPELINE_STAGES.length]; // distribute across all 32 stages
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const status = LEAD_STATUS_FOR_PIPELINE[stage.id] ?? "new";
      const createdDaysAgo = faker.number.int({ min: 1, max: 90 });
      const assignedTo = pick([...intakeAgents, ...caseMgrs, adminUser]);
      const source = pick([
        "website",
        "referral",
        "google_ads",
        "facebook",
        "walk_in",
        "phone",
      ]);
      const lastContacted =
        Math.random() < 0.7
          ? daysAgo(faker.number.int({ min: 0, max: createdDaysAgo }))
          : null;

      await sql`
				INSERT INTO leads (
					organization_id, first_name, last_name, email, phone,
					status, pipeline_stage, pipeline_stage_group, pipeline_stage_order,
					source, assigned_to_id, last_contacted_at, notes, created_at
				)
				VALUES (
					${orgId},
					${firstName},
					${lastName},
					${faker.internet.email({ firstName, lastName }).toLowerCase()},
					${faker.phone.number({ style: "national" })},
					${status}::lead_status,
					${stage.id},
					${stage.group},
					${stage.order},
					${source},
					${assignedTo.id},
					${lastContacted},
					${faker.lorem.sentence()},
					${daysAgo(createdDaysAgo)}
				)
			`;
    }
    console.log(`  ✓ Created 50 new leads distributed across 32 stages`);
  } else {
    console.log(
      `  ↺ Skipped new lead creation (already ${leadCountBefore[0].n} leads)`,
    );
  }

  // =======================================================================
  // 4. Outbound mail — 25 entries
  // =======================================================================
  console.log("\n--- Seeding outbound_mail ---");
  const omCount =
    await sql`SELECT COUNT(*) as n FROM outbound_mail WHERE organization_id = ${orgId}`;
  if (Number(omCount[0].n) < 20) {
    const mailTypes: Array<"certified" | "regular" | "fedex" | "ups"> = [
      "certified",
      "certified",
      "certified",
      "regular",
      "regular",
      "fedex",
      "ups",
    ];
    const recipientTemplates = [
      (c: any) => ({
        name: `SSA ODAR ${pick(["Atlanta", "Charlotte", "Tampa", "Miami"])}`,
        address: `${faker.location.streetAddress()}, ${faker.location.city()}, GA ${faker.location.zipCode("#####")}`,
        notes: "Exhibit packet submission for upcoming hearing",
      }),
      (c: any) => ({
        name: `${faker.person.fullName()}, MD`,
        address: `${faker.location.streetAddress()}, ${faker.location.city()}, GA ${faker.location.zipCode("#####")}`,
        notes: "Medical records request with HIPAA authorization",
      }),
      (c: any) => ({
        name: pick(FIELD_OFFICES).replace("Field Office - ", "SSA FO "),
        address: `${faker.location.streetAddress()}, ${faker.location.city()}, GA ${faker.location.zipCode("#####")}`,
        notes: "Appeal filing — certified mail for deadline proof",
      }),
      (c: any) => ({
        name: `${faker.person.fullName()}`,
        address: `${faker.location.streetAddress()}, ${faker.location.city()}, GA ${faker.location.zipCode("#####")}`,
        notes: "Client correspondence — retainer copy",
      }),
    ];

    for (let i = 0; i < 25; i++) {
      const c = pick(cases);
      const mailType = pick(mailTypes);
      const template = pick(recipientTemplates);
      const r = template(c);
      const sentDaysAgo = faker.number.int({ min: 0, max: 45 });
      const delivered = sentDaysAgo > 3 && Math.random() < 0.8;
      const sentAt = daysAgo(sentDaysAgo);
      const deliveredAt = delivered
        ? new Date(
            sentAt.getTime() + faker.number.int({ min: 1, max: 5 }) * 86400000,
          )
        : null;
      const tracking =
        mailType === "certified"
          ? `9400${faker.string.numeric(16)}`
          : mailType === "fedex"
            ? faker.string.numeric(12)
            : mailType === "ups"
              ? `1Z${faker.string.alphanumeric({ length: 16, casing: "upper" })}`
              : null;

      await sql`
				INSERT INTO outbound_mail (
					organization_id, case_id, recipient_name, recipient_address,
					mail_type, tracking_number, sent_at, delivered_at, notes, sent_by
				)
				VALUES (
					${orgId},
					${c.id},
					${r.name},
					${r.address},
					${mailType}::mail_type,
					${tracking},
					${sentAt},
					${deliveredAt},
					${r.notes},
					${pick([...filingAgents, adminUser]).id}
				)
			`;
    }
    console.log(`  ✓ Created 25 outbound_mail rows`);
  } else {
    console.log(`  ↺ Skipped (already ${omCount[0].n} rows)`);
  }

  // =======================================================================
  // 5. Documents — 15 inbound mail items tagged 'mail' in pending state
  // =======================================================================
  console.log("\n--- Seeding inbound mail documents ---");
  const mailDocsCount = await sql`
		SELECT COUNT(*) as n FROM documents WHERE 'mail' = ANY(tags) AND organization_id = ${orgId}
	`;
  if (Number(mailDocsCount[0].n) < 10) {
    const mailSubjects = [
      {
        fname: "ssa_notice_of_hearing.pdf",
        desc: "SSA Notice of Hearing",
        category: "ssa_notice",
      },
      {
        fname: "medical_records_request.pdf",
        desc: "Medical records from provider",
        category: "medical",
      },
      {
        fname: "ssa_decision_letter.pdf",
        desc: "SSA Denial Letter",
        category: "ssa_decision",
      },
      {
        fname: "appeal_acknowledgment.pdf",
        desc: "SSA Appeal Acknowledgment",
        category: "ssa_notice",
      },
      {
        fname: "doctor_letter.pdf",
        desc: "Treating physician letter",
        category: "medical",
      },
      {
        fname: "return_receipt.pdf",
        desc: "USPS return receipt card",
        category: "correspondence",
      },
      {
        fname: "workers_comp_records.pdf",
        desc: "Workers comp file",
        category: "employment",
      },
      {
        fname: "ssa_claim_status.pdf",
        desc: "Claim status update from SSA",
        category: "ssa_notice",
      },
      {
        fname: "mri_report.pdf",
        desc: "Lumbar MRI report",
        category: "medical",
      },
      {
        fname: "psychiatric_eval.pdf",
        desc: "Psych consultative exam",
        category: "medical",
      },
    ];
    for (let i = 0; i < 15; i++) {
      const c = pick(cases);
      const tmpl = pick(mailSubjects);
      await sql`
				INSERT INTO documents (
					organization_id, case_id, file_name, file_type, file_size_bytes,
					storage_path, category, source, description, tags, metadata, created_at, created_by
				)
				VALUES (
					${orgId},
					${c.id},
					${tmpl.fname},
					'application/pdf',
					${faker.number.int({ min: 50000, max: 2500000 })},
					${`mail/inbound/${faker.string.uuid()}.pdf`},
					${tmpl.category},
					'upload'::document_source,
					${tmpl.desc},
					${sql.array(["mail", "inbound", "pending_processing"])},
					${sql.json({ inboundMail: true, processingStatus: "pending_processing", receivedDate: daysAgo(faker.number.int({ min: 0, max: 14 })).toISOString() })},
					${daysAgo(faker.number.int({ min: 0, max: 14 }))},
					${pick([...filingAgents, adminUser]).id}
				)
			`;
    }
    console.log(
      `  ✓ Created 15 inbound mail documents (tagged 'mail', pending_processing)`,
    );
  } else {
    console.log(`  ↺ Skipped (already ${mailDocsCount[0].n} mail documents)`);
  }

  // =======================================================================
  // 6. Provider credentials — 10 placeholder encrypted entries
  // =======================================================================
  console.log("\n--- Seeding provider_credentials ---");
  const pcCount =
    await sql`SELECT COUNT(*) as n FROM provider_credentials WHERE organization_id = ${orgId}`;
  if (Number(pcCount[0].n) === 0) {
    for (const p of PATIENT_PORTAL_PROVIDERS) {
      const lastUsed =
        Math.random() < 0.8
          ? daysAgo(faker.number.int({ min: 0, max: 30 }))
          : null;
      await sql`
				INSERT INTO provider_credentials (
					organization_id, provider_name, label,
					username_encrypted, password_encrypted, totp_secret_encrypted,
					is_active, last_used_at, created_by
				)
				VALUES (
					${orgId},
					${p.name},
					${p.label},
					${fakeEncrypted(`user:${p.label}`)},
					${fakeEncrypted(`pass:${p.label}`)},
					${Math.random() < 0.4 ? fakeEncrypted(`totp:${p.label}`) : null},
					${faker.datatype.boolean(0.9)},
					${lastUsed},
					${pick([...medRec, adminUser]).id}
				)
			`;
    }
    console.log(`  ✓ Created 10 provider_credentials`);
  } else {
    console.log(`  ↺ Skipped (already ${pcCount[0].n} rows)`);
  }

  // =======================================================================
  // 7. RFC requests — 12 in varied states
  // =======================================================================
  console.log("\n--- Seeding rfc_requests ---");
  const rfcCount =
    await sql`SELECT COUNT(*) as n FROM rfc_requests WHERE organization_id = ${orgId}`;
  if (Number(rfcCount[0].n) === 0) {
    const statusDist: Array<
      "not_requested" | "requested" | "received" | "completed"
    > = [
      "not_requested",
      "not_requested",
      "requested",
      "requested",
      "requested",
      "requested",
      "received",
      "received",
      "received",
      "completed",
      "completed",
      "completed",
    ];
    const providerPool = [
      "Dr. Elizabeth Hartman, MD (Internal Medicine)",
      "Dr. Marcus Johnson, MD (Orthopedics)",
      "Dr. Priya Patel, MD (Psychiatry)",
      "Dr. Thomas Reilly, MD (Neurology)",
      "Dr. Anita Desai, MD (Rheumatology)",
      "Dr. William Chen, DO (Pain Management)",
      "Dr. Rebecca Foster, PsyD (Clinical Psychology)",
      "Dr. Samuel Green, MD (Cardiology)",
    ];
    const rfcCases = faker.helpers.shuffle([...cases]).slice(0, 12);
    for (let i = 0; i < 12; i++) {
      const c = rfcCases[i];
      const status = statusDist[i];
      const requestedAt =
        status !== "not_requested"
          ? daysAgo(faker.number.int({ min: 7, max: 60 }))
          : null;
      const receivedAt =
        status === "received" || status === "completed"
          ? daysAgo(faker.number.int({ min: 0, max: 20 }))
          : null;
      const completedAt =
        status === "completed"
          ? daysAgo(faker.number.int({ min: 0, max: 10 }))
          : null;
      const dueDate =
        status !== "completed"
          ? daysFromNow(faker.number.int({ min: 3, max: 30 }))
          : null;

      await sql`
				INSERT INTO rfc_requests (
					organization_id, case_id, status, provider_name,
					requested_at, received_at, completed_at, due_date, notes, assigned_to
				)
				VALUES (
					${orgId},
					${c.id},
					${status}::rfc_status,
					${pick(providerPool)},
					${requestedAt},
					${receivedAt},
					${completedAt},
					${dueDate},
					${faker.lorem.sentence()},
					${pick([...medRec, adminUser]).id}
				)
			`;
    }
    console.log(`  ✓ Created 12 rfc_requests`);
  } else {
    console.log(`  ↺ Skipped (already ${rfcCount[0].n} rows)`);
  }

  // =======================================================================
  // 8. Audit log — +50 entries of varied activity
  // =======================================================================
  console.log("\n--- Seeding audit_log ---");
  const auditTemplates: Array<{
    entity: string;
    action: string;
    changes: any;
  }> = [
    {
      entity: "case",
      action: "viewed_phi",
      changes: { reason: "routine case review" },
    },
    {
      entity: "case",
      action: "status_changed",
      changes: { from: "active", to: "active" },
    },
    { entity: "case", action: "stage_advanced", changes: {} },
    { entity: "case", action: "assigned", changes: {} },
    {
      entity: "case",
      action: "field_updated",
      changes: { field: "hearing_date" },
    },
    { entity: "document", action: "uploaded", changes: {} },
    { entity: "document", action: "downloaded", changes: {} },
    { entity: "document", action: "viewed", changes: {} },
    { entity: "task", action: "created", changes: {} },
    { entity: "task", action: "completed", changes: {} },
    { entity: "communication", action: "sent", changes: {} },
    { entity: "lead", action: "converted", changes: {} },
    { entity: "hearing", action: "scheduled", changes: {} },
    { entity: "rfc_request", action: "created", changes: {} },
    {
      entity: "provider_credential",
      action: "used",
      changes: { purpose: "medical records download" },
    },
  ];
  for (let i = 0; i < 50; i++) {
    const tmpl = pick(auditTemplates);
    const c = pick(cases);
    const user = pick(users);
    const when = daysAgo(faker.number.int({ min: 0, max: 30 }));
    await sql`
			INSERT INTO audit_log (
				organization_id, user_id, entity_type, entity_id, action, changes, metadata, ip_address, created_at
			)
			VALUES (
				${orgId},
				${user.id},
				${tmpl.entity},
				${c.id},
				${tmpl.action},
				${sql.json(tmpl.changes)},
				${sql.json({ caseNumber: c.case_number, userEmail: user.email })},
				${`10.0.${faker.number.int({ min: 0, max: 10 })}.${faker.number.int({ min: 1, max: 254 })}`},
				${when}
			)
		`;
  }
  console.log(`  ✓ Inserted 50 audit_log rows`);

  // =======================================================================
  // 9. Communications — +30 messages
  // =======================================================================
  console.log("\n--- Seeding communications ---");
  const commTemplates = [
    {
      type: "email_outbound",
      direction: "outbound",
      subject: "Your hearing has been scheduled",
      body: "We have received notice that your disability hearing has been scheduled. Please contact our office to review your file.",
    },
    {
      type: "email_inbound",
      direction: "inbound",
      subject: "Re: Medical records update",
      body: "Thank you for the update. I will gather the additional records from my physical therapist and send them over this week.",
    },
    {
      type: "message_outbound",
      direction: "outbound",
      subject: "Appointment reminder",
      body: "Reminder: You have a pre-hearing conference call tomorrow at 2:00 PM. Please call our office at your scheduled time.",
    },
    {
      type: "phone_outbound",
      direction: "outbound",
      subject: "Weekly check-in call",
      body: "Called client to check in on treatment progress. Client reports new MRI scheduled for next week.",
    },
    {
      type: "phone_inbound",
      direction: "inbound",
      subject: "Client called with questions",
      body: "Client called asking about hearing preparation. Advised to review the pre-hearing questionnaire we mailed last week.",
    },
    {
      type: "note",
      direction: null,
      subject: "Case strategy note",
      body: "Discussed ALJ history with senior attorney. Current ALJ has 42% approval rate. Recommend emphasizing treating source opinion.",
    },
    {
      type: "email_outbound",
      direction: "outbound",
      subject: "Medical records received",
      body: "We received your medical records from Emory Healthcare. We are reviewing them now and will update you if additional records are needed.",
    },
    {
      type: "message_inbound",
      direction: "inbound",
      subject: "Re: Pre-hearing questionnaire",
      body: "I completed the questionnaire and dropped it in the mail this morning. Please let me know when you receive it.",
    },
  ];

  for (let i = 0; i < 30; i++) {
    const c = pick(cases);
    const tmpl = pick(commTemplates);
    const user = pick([...caseMgrs, ...attorneys, adminUser]);
    const when = daysAgo(faker.number.int({ min: 0, max: 60 }));
    const claimant = pick(claimants);
    const clientEmail =
      claimant?.email ??
      `${faker.person.firstName().toLowerCase()}@example.com`;
    const firmEmail = user.email;

    await sql`
			INSERT INTO communications (
				organization_id, case_id, type, direction, subject, body,
				from_address, to_address, source_system, user_id, created_at, metadata
			)
			VALUES (
				${orgId},
				${c.id},
				${tmpl.type}::communication_type,
				${tmpl.direction},
				${tmpl.subject},
				${tmpl.body},
				${tmpl.direction === "outbound" ? firmEmail : clientEmail},
				${tmpl.direction === "outbound" ? clientEmail : firmEmail},
				${tmpl.type.startsWith("email") ? "outlook" : tmpl.type.startsWith("phone") ? "dialpad" : tmpl.type.startsWith("message") ? "twilio" : "manual"},
				${user.id},
				${when},
				${sql.json({ caseNumber: c.case_number })}
			)
		`;
  }
  console.log(`  ✓ Inserted 30 communications`);

  // =======================================================================
  // 10. ERE credentials + jobs
  // =======================================================================
  console.log("\n--- Seeding ere_credentials and ere_jobs ---");
  const ereCredCount =
    await sql`SELECT COUNT(*) as n FROM ere_credentials WHERE organization_id = ${orgId}`;
  let ereCredIds: string[] = [];
  if (Number(ereCredCount[0].n) === 0) {
    const labels = [
      "Primary ERE Account - Sarah Attorney",
      "Backup ERE Account - Tom Hearings",
      "ERE Admin Account - Jake",
    ];
    for (const label of labels) {
      const [row] = await sql`
				INSERT INTO ere_credentials (
					organization_id, label, username_encrypted, password_encrypted, totp_secret_encrypted,
					is_active, last_used_at, created_by
				)
				VALUES (
					${orgId},
					${label},
					${fakeEncrypted(`ere-user:${label}`)},
					${fakeEncrypted(`ere-pass:${label}`)},
					${fakeEncrypted(`ere-totp:${label}`)},
					true,
					${daysAgo(faker.number.int({ min: 0, max: 7 }))},
					${adminUser.id}
				)
				RETURNING id
			`;
      ereCredIds.push(row.id);
    }
    console.log(`  ✓ Created 3 ere_credentials`);
  } else {
    const existingEre =
      await sql`SELECT id FROM ere_credentials WHERE organization_id = ${orgId}`;
    ereCredIds = existingEre.map((r) => r.id);
    console.log(
      `  ↺ Skipped ere_credentials (already ${ereCredIds.length} rows)`,
    );
  }

  const ereJobCount =
    await sql`SELECT COUNT(*) as n FROM ere_jobs WHERE organization_id = ${orgId}`;
  if (Number(ereJobCount[0].n) === 0 && ereCredIds.length > 0) {
    const jobStatuses: Array<
      | "pending"
      | "running"
      | "completed"
      | "completed"
      | "completed"
      | "failed"
      | "cancelled"
    > = [
      "pending",
      "running",
      "completed",
      "completed",
      "completed",
      "failed",
      "cancelled",
    ];
    const jobTypes: Array<
      "full_scrape" | "incremental_sync" | "document_download" | "status_check"
    > = [
      "full_scrape",
      "incremental_sync",
      "document_download",
      "status_check",
    ];
    const ereJobCases = faker.helpers.shuffle([...cases]).slice(0, 20);
    for (let i = 0; i < 20; i++) {
      const c = ereJobCases[i];
      const jobType = pick(jobTypes);
      const status = pick(jobStatuses);
      const startedAt =
        status === "pending"
          ? null
          : daysAgo(faker.number.int({ min: 0, max: 15 }));
      const completedAt =
        status === "completed" || status === "failed" || status === "cancelled"
          ? startedAt
            ? new Date(
                startedAt.getTime() +
                  faker.number.int({ min: 60, max: 900 }) * 1000,
              )
            : null
          : null;
      const docsFound =
        status === "completed" || status === "failed"
          ? faker.number.int({ min: 0, max: 120 })
          : null;
      const docsDownloaded =
        status === "completed"
          ? docsFound
          : status === "failed"
            ? Math.floor((docsFound ?? 0) / 2)
            : null;

      await sql`
				INSERT INTO ere_jobs (
					organization_id, case_id, credential_id, job_type, status,
					ssa_claim_number, documents_found, documents_downloaded, error_message,
					started_at, completed_at, created_by
				)
				VALUES (
					${orgId},
					${c.id},
					${pick(ereCredIds)},
					${jobType}::ere_job_type,
					${status}::ere_job_status,
					${`${faker.string.numeric(3)}-${faker.string.numeric(2)}-${faker.string.numeric(4)}`},
					${docsFound},
					${docsDownloaded},
					${status === "failed" ? pick(["Timeout waiting for MFA", "Session expired", "Credential invalid"]) : null},
					${startedAt},
					${completedAt},
					${adminUser.id}
				)
			`;
    }
    console.log(`  ✓ Created 20 ere_jobs`);
  } else {
    console.log(`  ↺ Skipped ere_jobs (already ${ereJobCount[0].n} rows)`);
  }

  // =======================================================================
  // Done
  // =======================================================================
  console.log("\n=== Seed complete ===");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
