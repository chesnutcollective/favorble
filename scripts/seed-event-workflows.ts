/**
 * Seed workflow templates for supervisor event types (SA-5).
 *
 * Populates `workflow_templates` + `workflow_task_templates` with a
 * library of event-triggered workflows so `executeEventWorkflows` has
 * real content to dispatch when a supervisor event fires. Every
 * workflow is created with `trigger_type = 'event_detected'` and a
 * `trigger_config` of `{ "eventType": "<name>" }`.
 *
 * Run (shell preload + react-server condition both required):
 *
 *   env $(cat .env.local | grep -v '^#' | xargs) \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     pnpm tsx scripts/seed-event-workflows.ts
 *
 * Or directly against a DB:
 *
 *   DATABASE_URL="postgres://..." pnpm tsx scripts/seed-event-workflows.ts
 *
 * The script is idempotent: if an event-triggered workflow with the
 * same (organization_id, name) already exists we skip it rather than
 * duplicating tasks.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";

type TaskPriority = "low" | "medium" | "high" | "urgent";
type AssignRole =
  | "case_manager"
  | "appeals_council"
  | "post_hearing"
  | "fee_collection"
  | "pre_hearing_prep"
  | "phi_sheet_writer"
  | "medical_records"
  | "hearing_advocate";

interface TaskTemplateDef {
  title: string;
  description: string;
  assignToRole: AssignRole;
  priority: TaskPriority;
  dueDaysOffset: number;
  dueBusinessDaysOnly?: boolean;
}

interface EventWorkflowDef {
  eventType: string;
  name: string;
  description: string;
  tasks: TaskTemplateDef[];
}

const EVENT_WORKFLOWS: EventWorkflowDef[] = [
  {
    eventType: "denial_received",
    name: "Denial Received Response",
    description:
      "Kicks off reconsideration prep when an initial denial lands. Ensures the client is notified fast and the appeal is drafted inside the 60-day window.",
    tasks: [
      {
        title: "Draft reconsideration request",
        description:
          "Prepare the SSA-561 Request for Reconsideration addressing every basis in the denial notice and citing updated medical evidence.",
        assignToRole: "case_manager",
        priority: "high",
        dueDaysOffset: 5,
      },
      {
        title: "Send client denial letter",
        description:
          "Mail the client a plain-language summary of the denial and the firm's appeal plan within 24 hours of the denial landing.",
        assignToRole: "case_manager",
        priority: "urgent",
        dueDaysOffset: 1,
      },
      {
        title: "Schedule client call to discuss next steps",
        description:
          "Call the client within three days to confirm they want to appeal, walk through the reconsideration process, and answer questions.",
        assignToRole: "case_manager",
        priority: "high",
        dueDaysOffset: 3,
      },
    ],
  },
  {
    eventType: "unfavorable_decision",
    name: "Unfavorable ALJ Decision Response",
    description:
      "Triggers after an unfavorable ALJ decision. Captures the AC filing workflow, client communication, and evidence review required for a strong Appeals Council brief.",
    tasks: [
      {
        title: "Draft Appeals Council request",
        description:
          "Prepare the Request for Review (HA-520) identifying the ALJ's errors of law and unsupported factual findings for AC filing.",
        assignToRole: "appeals_council",
        priority: "high",
        dueDaysOffset: 14,
      },
      {
        title: "Send client hearing outcome letter",
        description:
          "Send a written explanation of the unfavorable decision, the 60-day AC deadline, and the firm's plan to file the appeal.",
        assignToRole: "post_hearing",
        priority: "urgent",
        dueDaysOffset: 1,
      },
      {
        title: "Review medical evidence for AC brief",
        description:
          "Re-review the full medical record and chronology for evidence the ALJ misweighted or ignored, flagging any new-and-material evidence.",
        assignToRole: "appeals_council",
        priority: "high",
        dueDaysOffset: 7,
      },
      {
        title: "Schedule client call to discuss AC strategy",
        description:
          "Call the client within five days to walk through the AC process, manage expectations on timeline, and confirm they want to proceed.",
        assignToRole: "case_manager",
        priority: "high",
        dueDaysOffset: 5,
      },
    ],
  },
  {
    eventType: "favorable_decision",
    name: "Favorable Decision Processing",
    description:
      "Handles the celebratory path: start fee petition, let the client know in plain language, and advance the case to post-hearing processing.",
    tasks: [
      {
        title: "Draft fee petition",
        description:
          "Prepare the fee petition with itemized time records and supporting documentation, filed with SSA under 42 U.S.C. § 406(a).",
        assignToRole: "fee_collection",
        priority: "high",
        dueDaysOffset: 7,
      },
      {
        title: "Send client congratulations + next steps letter",
        description:
          "Send a warm letter congratulating the client and explaining back pay, ongoing benefits, Medicare/Medicaid timing, and the fee process.",
        assignToRole: "post_hearing",
        priority: "high",
        dueDaysOffset: 1,
      },
      {
        title: "Advance case stage to post-hearing processing",
        description:
          "Move the case into post-hearing processing so the closeout workflow fires automatically.",
        assignToRole: "post_hearing",
        priority: "medium",
        dueDaysOffset: 0,
      },
    ],
  },
  {
    eventType: "hearing_scheduled",
    name: "Hearing Scheduled Prep",
    description:
      "Comprehensive pre-hearing prep lane. Task due dates are expressed as offsets from the hearing date (negative = before hearing) so the engine can schedule against the event payload.",
    tasks: [
      {
        title: "Draft pre-hearing brief",
        description:
          "Prepare the pre-hearing brief addressing the five-step evaluation, listings arguments, and evidence cites. Submit 10 days before hearing.",
        assignToRole: "pre_hearing_prep",
        priority: "high",
        dueDaysOffset: -10,
      },
      {
        title: "Complete PHI sheet",
        description:
          "Populate the pre-hearing information sheet — impairments, RFC, vocational profile, listings analysis — for the advocate's review.",
        assignToRole: "phi_sheet_writer",
        priority: "high",
        dueDaysOffset: -14,
      },
      {
        title: "Verify all medical records received",
        description:
          "Confirm every treating provider has submitted records through the hearing month and upload any outstanding records to the exhibit list.",
        assignToRole: "medical_records",
        priority: "high",
        dueDaysOffset: -10,
      },
      {
        title: "Schedule client prep call",
        description:
          "Schedule a 45-minute client prep call one week before the hearing to walk through testimony, expectations, and logistics.",
        assignToRole: "case_manager",
        priority: "high",
        dueDaysOffset: -7,
      },
      {
        title: "Advocate hearing prep review",
        description:
          "Advocate reviews the brief, PHI sheet, and exhibit list three days before the hearing and flags anything missing for last-mile fixes.",
        assignToRole: "hearing_advocate",
        priority: "urgent",
        dueDaysOffset: -3,
      },
    ],
  },
  {
    eventType: "appeal_deadline_approaching",
    name: "Appeal Deadline Approaching",
    description:
      "Urgent single-task workflow fired when an appeal deadline is inside the danger window. Surfaces the case for same-day review by the case manager.",
    tasks: [
      {
        title: "Review case and advance appeal",
        description:
          "Pull the case, confirm appeal readiness, and either file the appeal or escalate to supervising attorney before the statutory deadline hits.",
        assignToRole: "case_manager",
        priority: "urgent",
        dueDaysOffset: 1,
      },
    ],
  },
  {
    eventType: "new_medical_evidence",
    name: "New Medical Evidence Review",
    description:
      "Fires when new medical evidence lands on an active case. Routes it through chronology + brief updates so the case stays audit-ready.",
    tasks: [
      {
        title: "Review new evidence and update chronology",
        description:
          "Summarize the new records, add any encounters to the medical chronology, and flag any changes to diagnoses or functional limitations.",
        assignToRole: "medical_records",
        priority: "medium",
        dueDaysOffset: 2,
      },
      {
        title: "Update pre-hearing brief if applicable",
        description:
          "If the case has a pending hearing, fold the new evidence into the pre-hearing brief and exhibit list before the 5-day evidence deadline.",
        assignToRole: "pre_hearing_prep",
        priority: "medium",
        dueDaysOffset: 5,
      },
    ],
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("=== Event Workflow Seed (SA-5) ===\n");

  const orgs = await db.query.organizations.findMany();
  if (orgs.length === 0) {
    throw new Error("No organizations found. Run the base seed first.");
  }
  console.log(`Found ${orgs.length} organization(s)`);

  let workflowsCreated = 0;
  let workflowsSkipped = 0;
  let tasksCreated = 0;

  for (const org of orgs) {
    console.log(`\n--- Org: ${org.name} (${org.id}) ---`);

    for (const wfDef of EVENT_WORKFLOWS) {
      // Idempotency: skip if a workflow with the same name already exists
      // for this org under the event_detected trigger.
      const existing = await db
        .select({ id: schema.workflowTemplates.id })
        .from(schema.workflowTemplates)
        .where(
          and(
            eq(schema.workflowTemplates.organizationId, org.id),
            eq(schema.workflowTemplates.triggerType, "event_detected"),
            eq(schema.workflowTemplates.name, wfDef.name),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(`  - ${wfDef.name}: already exists, skipped`);
        workflowsSkipped++;
        continue;
      }

      const [workflow] = await db
        .insert(schema.workflowTemplates)
        .values({
          organizationId: org.id,
          name: wfDef.name,
          description: wfDef.description,
          triggerType: "event_detected",
          triggerStageId: null,
          triggerConfig: { eventType: wfDef.eventType },
          isActive: true,
          notifyAssignees: true,
          notifyCaseManager: true,
          sendClientMessage: false,
          clientMessageTemplate: null,
        })
        .returning();

      workflowsCreated++;

      for (let i = 0; i < wfDef.tasks.length; i++) {
        const taskDef = wfDef.tasks[i];
        await db.insert(schema.workflowTaskTemplates).values({
          workflowTemplateId: workflow.id,
          title: taskDef.title,
          description: taskDef.description,
          assignToTeam: null,
          assignToRole: taskDef.assignToRole,
          priority: taskDef.priority,
          dueDaysOffset: taskDef.dueDaysOffset,
          dueBusinessDaysOnly: taskDef.dueBusinessDaysOnly ?? false,
          displayOrder: i,
        });
        tasksCreated++;
      }

      console.log(
        `  + ${wfDef.name} [${wfDef.eventType}] — ${wfDef.tasks.length} task template(s)`,
      );
    }
  }

  // Final verification query
  const [wfRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.triggerType, "event_detected"));
  const [ttRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(schema.workflowTaskTemplates);

  console.log(`\n=== Done ===`);
  console.log(`  Workflows created this run: ${workflowsCreated}`);
  console.log(`  Workflows skipped (existing): ${workflowsSkipped}`);
  console.log(`  Task templates created this run: ${tasksCreated}`);
  console.log(`  Total event_detected workflows in DB: ${wfRow?.n ?? 0}`);
  console.log(`  Total workflow_task_templates in DB: ${ttRow?.n ?? 0}`);

  await client.end();
}

main().catch((err) => {
  console.error("Event workflow seed failed:", err);
  process.exit(1);
});
