/**
 * Seed script for Workflow Templates and Document Templates.
 *
 * Populates the database with:
 *   - 6 workflow templates with associated task templates
 *   - 8 document templates with merge fields and placeholder content
 *
 * Run with: npx tsx scripts/seed-workflows-templates.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskTemplateDef {
  title: string;
  description: string;
  assignToTeam: (typeof TEAM_VALUES)[number];
  priority: "low" | "medium" | "high" | "urgent";
  dueDaysOffset: number;
  dueBusinessDaysOnly: boolean;
}

interface WorkflowDef {
  name: string;
  description: string;
  triggerStageCode: string;
  sendClientMessage: boolean;
  clientMessageTemplate: string | null;
  tasks: TaskTemplateDef[];
}

interface DocumentTemplateDef {
  name: string;
  description: string;
  category: string;
  requiresSignature: boolean;
  mergeFields: string[];
  templateContent: string;
}

const TEAM_VALUES = [
  "intake",
  "filing",
  "medical_records",
  "mail_sorting",
  "case_management",
  "hearings",
  "administration",
] as const;

// ---------------------------------------------------------------------------
// Workflow Definitions
// ---------------------------------------------------------------------------

const WORKFLOW_DEFS: WorkflowDef[] = [
  {
    name: "New Intake Processing",
    description:
      "Automatically creates onboarding tasks when a new claimant signs up. Ensures the welcome process, authorization forms, and initial conflict checks are completed promptly.",
    triggerStageCode: "1A", // Signed Up
    sendClientMessage: true,
    clientMessageTemplate:
      "Welcome to Hogan & Smith Law! We have received your signed retainer and are beginning to process your case. You will hear from our intake team within 1-2 business days.",
    tasks: [
      {
        title: "Send welcome letter",
        description:
          "Generate and send the client welcome letter explaining next steps, team contact information, and what to expect during the intake process.",
        assignToTeam: "intake",
        priority: "high",
        dueDaysOffset: 1,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Schedule intake call",
        description:
          "Contact the claimant to schedule an initial intake call. Confirm phone number, best times to reach, and any language or accessibility needs.",
        assignToTeam: "intake",
        priority: "high",
        dueDaysOffset: 2,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Request SSA authorization form (SSA-1696)",
        description:
          "Send the SSA-1696 Appointment of Representative form to the claimant for signature. Follow up if not returned within 3 business days.",
        assignToTeam: "intake",
        priority: "urgent",
        dueDaysOffset: 1,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Run conflicts check",
        description:
          "Search the firm's case management system and external databases for potential conflicts of interest before proceeding with representation.",
        assignToTeam: "administration",
        priority: "high",
        dueDaysOffset: 1,
        dueBusinessDaysOnly: true,
      },
    ],
  },
  {
    name: "Application Filed",
    description:
      "Triggers when a disability application is filed with SSA. Creates follow-up tasks to verify submission, upload records, and begin medical evidence gathering.",
    triggerStageCode: "2B", // Application Filed - SSDI
    sendClientMessage: true,
    clientMessageTemplate:
      "Your disability application has been filed with the Social Security Administration. We will monitor its progress and keep you updated. Please continue to attend all medical appointments.",
    tasks: [
      {
        title: "Verify application submission",
        description:
          "Confirm the application was received by SSA by checking the ERE portal. Record the confirmation number and filing date in the case.",
        assignToTeam: "filing",
        priority: "high",
        dueDaysOffset: 1,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Upload filed application to case",
        description:
          "Download the filed application from ERE and upload a copy to the case document management system for record keeping.",
        assignToTeam: "filing",
        priority: "medium",
        dueDaysOffset: 2,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Set 90-day follow-up reminder",
        description:
          "Create a calendar reminder to check application status in 90 days. If no decision by then, contact the local SSA field office for a status update.",
        assignToTeam: "case_management",
        priority: "medium",
        dueDaysOffset: 3,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Request medical records from treating physicians",
        description:
          "Send medical records request letters to all treating physicians identified during intake. Include authorization forms and specify the relevant treatment date ranges.",
        assignToTeam: "medical_records",
        priority: "high",
        dueDaysOffset: 2,
        dueBusinessDaysOnly: true,
      },
    ],
  },
  {
    name: "Hearing Preparation",
    description:
      "Comprehensive hearing preparation workflow triggered when a hearing date is scheduled. Ensures all exhibits, briefs, and client preparation are completed before the hearing.",
    triggerStageCode: "4D", // Hearing Scheduled
    sendClientMessage: true,
    clientMessageTemplate:
      "Your hearing has been scheduled. Our team will contact you soon to begin preparation. Please gather any recent medical records or documents you have not yet provided.",
    tasks: [
      {
        title: "Prepare exhibit packet",
        description:
          "Compile all medical records, work history, and supporting documentation into a paginated exhibit packet following ODAR formatting requirements. Include exhibit index and table of contents.",
        assignToTeam: "hearings",
        priority: "high",
        dueDaysOffset: 14,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Generate medical chronology",
        description:
          "Create a detailed chronological summary of all medical evidence, noting diagnoses, treatments, functional limitations, and provider opinions relevant to disability determination.",
        assignToTeam: "medical_records",
        priority: "high",
        dueDaysOffset: 10,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Draft pre-hearing brief",
        description:
          "Prepare the pre-hearing brief addressing the five-step sequential evaluation, listing/medical-vocational framework arguments, and citing relevant medical evidence and rulings.",
        assignToTeam: "hearings",
        priority: "high",
        dueDaysOffset: 7,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Schedule client prep meeting",
        description:
          "Contact the claimant to schedule a hearing preparation meeting. Review what to expect at the hearing, practice testimony, and discuss appearance and demeanor.",
        assignToTeam: "hearings",
        priority: "high",
        dueDaysOffset: 5,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Request updated medical records",
        description:
          "Send updated records requests to all treating providers for any treatment since the last records were received. Ensure the exhibit packet includes the most recent evidence.",
        assignToTeam: "medical_records",
        priority: "medium",
        dueDaysOffset: 3,
        dueBusinessDaysOnly: true,
      },
    ],
  },
  {
    name: "Post-Hearing Follow-up",
    description:
      "Tasks to complete after a hearing is held. Maintains client communication and tracks decision timelines.",
    triggerStageCode: "4E", // Hearing Held - Awaiting Decision
    sendClientMessage: true,
    clientMessageTemplate:
      "Your hearing has been completed. The judge typically issues a decision within 60-90 days. We will notify you as soon as we receive it.",
    tasks: [
      {
        title: "Send thank-you letter to client",
        description:
          "Send a letter to the claimant thanking them for attending the hearing, summarizing what happened, and explaining the expected timeline for a decision.",
        assignToTeam: "hearings",
        priority: "medium",
        dueDaysOffset: 1,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Follow up with ALJ office on decision timeline",
        description:
          "Contact the ALJ's office or check CPMS to determine the expected decision timeline. Note any post-hearing evidence requests from the ALJ.",
        assignToTeam: "hearings",
        priority: "medium",
        dueDaysOffset: 5,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Update case status in ERE",
        description:
          "Log into the ERE portal and verify the hearing status is reflected correctly. Note any discrepancies and update the internal case management system.",
        assignToTeam: "case_management",
        priority: "low",
        dueDaysOffset: 2,
        dueBusinessDaysOnly: true,
      },
    ],
  },
  {
    name: "Favorable Decision Processing",
    description:
      "Triggered when a favorable decision is received. Handles fee calculation, client notification, and payment processing.",
    triggerStageCode: "5A", // Favorable Decision
    sendClientMessage: true,
    clientMessageTemplate:
      "Congratulations! We have received a favorable decision on your case. Our team will be in touch shortly to discuss your benefits and next steps.",
    tasks: [
      {
        title: "Calculate past-due benefits",
        description:
          "Review the favorable decision notice to determine the established onset date, calculate the amount of past-due benefits, and document the calculation for fee petition purposes.",
        assignToTeam: "administration",
        priority: "high",
        dueDaysOffset: 3,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Prepare fee petition",
        description:
          "Prepare and file the fee petition with SSA, including itemized time records, fee agreement, and supporting documentation per 42 U.S.C. § 406(a).",
        assignToTeam: "administration",
        priority: "high",
        dueDaysOffset: 5,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Notify client of approval",
        description:
          "Call the claimant to congratulate them on the favorable decision. Explain what to expect regarding back pay, ongoing benefits, Medicare/Medicaid eligibility, and the fee process.",
        assignToTeam: "case_management",
        priority: "urgent",
        dueDaysOffset: 1,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Request fee agreement payment",
        description:
          "Submit the fee agreement to SSA for direct payment authorization. Track the withholding of fees from past-due benefits and follow up on payment timeline.",
        assignToTeam: "administration",
        priority: "medium",
        dueDaysOffset: 10,
        dueBusinessDaysOnly: true,
      },
    ],
  },
  {
    name: "Denial Response",
    description:
      "Triggered when an initial denial is received. Creates tasks to review the denial, discuss options with the client, and prepare the appeal within the 60-day deadline.",
    triggerStageCode: "3A", // Initial Denial Received
    sendClientMessage: true,
    clientMessageTemplate:
      "We received the initial denial on your case. This is a normal part of the process — most initial applications are denied. We are already preparing your appeal.",
    tasks: [
      {
        title: "Review denial notice",
        description:
          "Carefully review the denial notice to identify the stated reasons for denial, the evidence considered, and any factual errors or mischaracterizations that can be addressed on appeal.",
        assignToTeam: "case_management",
        priority: "urgent",
        dueDaysOffset: 2,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Draft appeal brief",
        description:
          "Draft the reconsideration appeal brief addressing each reason for denial, citing medical evidence, and arguing why the claimant meets listing-level severity or grid rule directs a finding of disabled.",
        assignToTeam: "hearings",
        priority: "high",
        dueDaysOffset: 14,
        dueBusinessDaysOnly: true,
      },
      {
        title: "Discuss options with client",
        description:
          "Schedule a call with the claimant to explain the denial, discuss the appeal process, and confirm they wish to proceed with reconsideration. Document the conversation.",
        assignToTeam: "case_management",
        priority: "high",
        dueDaysOffset: 3,
        dueBusinessDaysOnly: true,
      },
      {
        title: "File Request for Hearing within 60 days",
        description:
          "Prepare and file the SSA-561 Request for Reconsideration within the 60-day appeal deadline. Confirm receipt and note the deadline in the case calendar.",
        assignToTeam: "filing",
        priority: "urgent",
        dueDaysOffset: 30,
        dueBusinessDaysOnly: false,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Document Template Definitions
// ---------------------------------------------------------------------------

const DOCUMENT_TEMPLATE_DEFS: DocumentTemplateDef[] = [
  {
    name: "Retainer Agreement",
    description:
      "Standard contingency fee retainer agreement for SSA disability representation. Covers fee structure, scope of representation, and client obligations.",
    category: "Legal",
    requiresSignature: true,
    mergeFields: [
      "claimant_name",
      "claimant_address",
      "case_number",
      "date",
      "attorney_name",
      "firm_name",
    ],
    templateContent: `CONTINGENCY FEE RETAINER AGREEMENT

Date: {{date}}

This agreement is entered into between {{claimant_name}} ("Client") residing at {{claimant_address}}, and {{firm_name}} ("Firm"), represented by {{attorney_name}}.

1. SCOPE OF REPRESENTATION
The Firm agrees to represent the Client in connection with their claim for Social Security disability benefits (Case No. {{case_number}}), including applications, reconsiderations, hearings before Administrative Law Judges, and Appeals Council review as necessary.

2. FEE ARRANGEMENT
The Client agrees to pay the Firm a fee equal to 25% of past-due benefits awarded, not to exceed the maximum fee permitted by the Social Security Administration, currently $7,200. No fee is owed if the claim is not successful.

3. EXPENSES
The Firm will advance costs for obtaining medical records and other necessary documentation. These costs are the responsibility of the Client regardless of the outcome of the case.

4. CLIENT OBLIGATIONS
The Client agrees to:
  a) Provide truthful and complete information
  b) Attend all scheduled appointments and hearings
  c) Notify the Firm of any changes in address, phone number, or medical condition
  d) Continue medical treatment as recommended by treating physicians

5. TERMINATION
Either party may terminate this agreement at any time by providing written notice to the other party.

SIGNATURES:

_________________________________          Date: ____________
{{claimant_name}}, Client

_________________________________          Date: ____________
{{attorney_name}}, Attorney`,
  },
  {
    name: "SSA-1696 Appointment of Representative",
    description:
      "Cover letter and instructions accompanying the SSA-1696 form for appointing the firm as the claimant's representative before SSA.",
    category: "SSA Forms",
    requiresSignature: false,
    mergeFields: [
      "claimant_name",
      "claimant_ssn",
      "case_number",
      "attorney_name",
      "firm_name",
      "firm_address",
      "firm_phone",
      "date",
    ],
    templateContent: `APPOINTMENT OF REPRESENTATIVE — COVER LETTER

Date: {{date}}

Social Security Administration
Office of Disability Adjudication and Review

Re: {{claimant_name}}
SSN: {{claimant_ssn}}
Case No: {{case_number}}

Dear Sir or Madam:

Please accept this letter and the enclosed SSA-1696 form as notification that {{firm_name}} has been appointed as the representative for the above-referenced claimant.

All future correspondence regarding this claim should be directed to:

{{attorney_name}}
{{firm_name}}
{{firm_address}}
Phone: {{firm_phone}}

Please update your records accordingly. If you have any questions, please contact our office.

Respectfully submitted,

{{attorney_name}}
{{firm_name}}`,
  },
  {
    name: "Medical Records Request Letter",
    description:
      "Standard letter requesting medical records from treating physicians and medical facilities. Includes HIPAA authorization reference.",
    category: "Medical",
    requiresSignature: false,
    mergeFields: [
      "claimant_name",
      "claimant_dob",
      "claimant_ssn",
      "provider_name",
      "provider_address",
      "date_range_start",
      "date_range_end",
      "attorney_name",
      "firm_name",
      "firm_address",
      "firm_phone",
      "firm_fax",
      "date",
    ],
    templateContent: `MEDICAL RECORDS REQUEST

Date: {{date}}

{{provider_name}}
{{provider_address}}

Re: Medical Records Request
Patient: {{claimant_name}}
DOB: {{claimant_dob}}
SSN: {{claimant_ssn}}

Dear Medical Records Department:

Our firm represents the above-referenced patient in connection with a Social Security disability claim. Pursuant to the enclosed HIPAA-compliant authorization, we are requesting copies of the following records:

1. Complete medical records from {{date_range_start}} through {{date_range_end}}, including:
   - Office visit notes and progress notes
   - Diagnostic test results (labs, imaging, EMG/NCS, etc.)
   - Treatment plans and medication lists
   - Referral letters
   - Mental health treatment notes (if applicable)
   - Physical therapy / occupational therapy notes
   - Any RFC assessments or functional capacity evaluations

2. Any medical source statements or opinion letters regarding the patient's functional limitations

Please send records to:
{{firm_name}}
{{firm_address}}
Fax: {{firm_fax}}

If there are any fees associated with this request, please contact our office at {{firm_phone}} before processing.

Thank you for your prompt attention to this request.

Sincerely,

{{attorney_name}}
{{firm_name}}`,
  },
  {
    name: "Pre-Hearing Brief",
    description:
      "Template for the pre-hearing brief submitted to the ALJ before a disability hearing. Covers sequential evaluation, medical evidence summary, and legal arguments.",
    category: "Legal",
    requiresSignature: false,
    mergeFields: [
      "claimant_name",
      "claimant_ssn",
      "case_number",
      "hearing_date",
      "hearing_time",
      "hearing_location",
      "alj_name",
      "alleged_onset_date",
      "attorney_name",
      "firm_name",
      "date",
    ],
    templateContent: `PRE-HEARING BRIEF

Date: {{date}}

The Honorable {{alj_name}}
Office of Disability Adjudication and Review

Re: {{claimant_name}}
SSN: {{claimant_ssn}}
Case No: {{case_number}}
Hearing Date: {{hearing_date}} at {{hearing_time}}
Hearing Location: {{hearing_location}}

Dear Judge {{alj_name}}:

Please accept this pre-hearing brief on behalf of {{claimant_name}}, who has applied for disability benefits with an alleged onset date of {{alleged_onset_date}}.

I. STATEMENT OF THE CASE
[Provide brief background of the claimant, including age, education, past relevant work, and alleged impairments.]

II. MEDICAL EVIDENCE SUMMARY
[Summarize relevant medical evidence chronologically, citing exhibit numbers.]

III. SEQUENTIAL EVALUATION ANALYSIS

A. Step One — Substantial Gainful Activity
[Address whether the claimant has engaged in SGA since the alleged onset date.]

B. Step Two — Severe Impairments
[List and discuss the claimant's severe impairments.]

C. Step Three — Listings
[Discuss whether any impairment meets or medically equals a listed impairment.]

D. Step Four — Residual Functional Capacity and Past Relevant Work
[Discuss the claimant's RFC and ability to perform past relevant work.]

E. Step Five — Other Work in the National Economy
[Address whether the claimant can perform other work considering age, education, work experience, and RFC.]

IV. CONCLUSION
For the foregoing reasons, we respectfully request that the Administrative Law Judge find {{claimant_name}} disabled as of {{alleged_onset_date}}.

Respectfully submitted,

{{attorney_name}}
{{firm_name}}`,
  },
  {
    name: "Client Welcome Letter",
    description:
      "Welcome letter sent to new clients after signing the retainer agreement. Introduces the team, explains the process, and outlines next steps.",
    category: "Correspondence",
    requiresSignature: false,
    mergeFields: [
      "claimant_name",
      "claimant_address",
      "case_number",
      "case_manager_name",
      "case_manager_phone",
      "case_manager_email",
      "firm_name",
      "firm_address",
      "firm_phone",
      "date",
    ],
    templateContent: `{{date}}

{{claimant_name}}
{{claimant_address}}

Re: Welcome to {{firm_name}} — Case No. {{case_number}}

Dear {{claimant_name}},

Welcome to {{firm_name}}. We are pleased to represent you in your Social Security disability claim and look forward to working with you.

YOUR CASE TEAM

Your primary point of contact will be:
  Name: {{case_manager_name}}
  Phone: {{case_manager_phone}}
  Email: {{case_manager_email}}

Please do not hesitate to contact your case manager with any questions or updates about your condition.

WHAT HAPPENS NEXT

1. We will file any necessary paperwork with the Social Security Administration on your behalf.
2. We will request your medical records from all treating providers you identified during intake.
3. We will keep you informed of all developments in your case.

WHAT WE NEED FROM YOU

- Continue attending all medical appointments and following your treatment plans
- Notify us immediately if your address or phone number changes
- Let us know about any new doctors, hospitalizations, or changes in your condition
- Respond promptly to any requests for information

IMPORTANT REMINDERS

- Never contact the Social Security Administration directly about your case without speaking with us first
- Keep copies of all documents you send to or receive from SSA
- Attend all scheduled consultative examinations — missing one can delay your case

We understand this process can be stressful, and we are here to help. Please call us at {{firm_phone}} if you have any questions.

Sincerely,

{{firm_name}}
{{firm_address}}
{{firm_phone}}`,
  },
  {
    name: "Fee Agreement",
    description:
      "Fee agreement for direct payment of representative fees from past-due benefits, submitted to SSA for approval under 42 U.S.C. § 406(a).",
    category: "Legal",
    requiresSignature: true,
    mergeFields: [
      "claimant_name",
      "claimant_ssn",
      "case_number",
      "attorney_name",
      "attorney_bar_number",
      "firm_name",
      "firm_address",
      "date",
    ],
    templateContent: `FEE AGREEMENT FOR SERVICES UNDER TITLE II AND/OR TITLE XVI
OF THE SOCIAL SECURITY ACT

Date: {{date}}

Claimant: {{claimant_name}}
SSN: {{claimant_ssn}}
Case No: {{case_number}}

I, {{claimant_name}}, hereby agree to pay {{attorney_name}} (Bar No. {{attorney_bar_number}}) of {{firm_name}}, located at {{firm_address}}, a fee for representation in my Social Security disability claim.

FEE TERMS:
The fee shall be the LESSER of:
  (a) 25% of all past-due benefits awarded, OR
  (b) $7,200.00 (the current statutory maximum)

This fee is contingent upon a favorable decision. If no past-due benefits are awarded, no fee is owed.

I understand that:
1. SSA must approve this fee agreement before any fee can be charged.
2. SSA will withhold 25% of my past-due benefits for direct payment to my representative.
3. I may request SSA to review the fee if I believe it is unreasonable.
4. I am responsible for expenses incurred in developing my case (medical records, etc.) regardless of the outcome.

SIGNATURES:

_________________________________          Date: ____________
{{claimant_name}}, Claimant

_________________________________          Date: ____________
{{attorney_name}}, Representative
{{firm_name}}`,
  },
  {
    name: "Consultative Exam Follow-up",
    description:
      "Letter sent to the claimant before a scheduled consultative examination, explaining what to expect and how to prepare.",
    category: "Medical",
    requiresSignature: false,
    mergeFields: [
      "claimant_name",
      "claimant_address",
      "case_number",
      "ce_date",
      "ce_time",
      "ce_doctor_name",
      "ce_location",
      "ce_type",
      "firm_name",
      "firm_phone",
      "date",
    ],
    templateContent: `{{date}}

{{claimant_name}}
{{claimant_address}}

Re: Scheduled Consultative Examination — Case No. {{case_number}}

Dear {{claimant_name}},

The Social Security Administration has scheduled a consultative examination for your disability case. Please review the details below carefully.

APPOINTMENT DETAILS:
  Date: {{ce_date}}
  Time: {{ce_time}}
  Doctor: {{ce_doctor_name}}
  Location: {{ce_location}}
  Type: {{ce_type}}

IMPORTANT — PLEASE READ:

1. YOU MUST ATTEND THIS APPOINTMENT. Failure to attend may result in a denial of your claim or a decision based on insufficient evidence.

2. Arrive 15 minutes early and bring a valid photo ID.

3. Be honest and thorough about your symptoms and limitations. Do not exaggerate, but do not minimize your difficulties either.

4. Describe your WORST days, not just how you feel on the day of the exam.

5. Mention ALL of your conditions, not just the primary one.

6. If you need to reschedule, contact our office IMMEDIATELY at {{firm_phone}}. Do not contact SSA directly.

7. This doctor was NOT chosen by us — they are selected by SSA. The exam is typically brief (15-30 minutes).

TIPS FOR YOUR EXAM:
- Bring a list of all medications you currently take
- Be prepared to describe your daily activities and limitations
- If you use assistive devices (cane, walker, brace), bring them
- Do not drive yourself if your condition makes it unsafe

Please call us at {{firm_phone}} if you have any questions about this appointment.

Sincerely,

{{firm_name}}`,
  },
  {
    name: "Appeals Council Brief Template",
    description:
      "Template for a brief submitted to the SSA Appeals Council requesting review of an unfavorable ALJ decision. Outlines legal errors and evidentiary issues.",
    category: "Legal",
    requiresSignature: false,
    mergeFields: [
      "claimant_name",
      "claimant_ssn",
      "case_number",
      "alj_name",
      "hearing_date",
      "decision_date",
      "attorney_name",
      "firm_name",
      "date",
    ],
    templateContent: `BRIEF IN SUPPORT OF REQUEST FOR REVIEW BY THE APPEALS COUNCIL

Date: {{date}}

Appeals Council
Office of Appellate Operations
Social Security Administration

Re: {{claimant_name}}
SSN: {{claimant_ssn}}
Case No: {{case_number}}
ALJ: {{alj_name}}
Hearing Date: {{hearing_date}}
Decision Date: {{decision_date}}

Dear Appeals Council:

Please accept this brief in support of the Request for Review of the unfavorable decision issued by Administrative Law Judge {{alj_name}} on {{decision_date}}.

I. INTRODUCTION
{{claimant_name}} respectfully requests that the Appeals Council review the decision of ALJ {{alj_name}} for the reasons set forth below. The ALJ's decision contains errors of law and is not supported by substantial evidence.

II. STATEMENT OF THE CASE
[Summarize the procedural history, including application date, initial denial, reconsideration denial, and hearing.]

III. ISSUES ON APPEAL

A. The ALJ Failed to Properly Evaluate the Medical Opinion Evidence
[Discuss how the ALJ erred in weighing medical opinions under the applicable regulations.]

B. The ALJ's RFC Assessment Is Not Supported by Substantial Evidence
[Identify specific RFC limitations that are unsupported or contradicted by the record.]

C. The ALJ Failed to Properly Evaluate the Claimant's Subjective Symptoms
[Discuss errors in the ALJ's credibility/subjective symptom analysis under SSR 16-3p.]

D. [Additional Issues as Applicable]
[Address any other errors, such as Step Three listing analysis, vocational expert testimony issues, etc.]

IV. NEW AND MATERIAL EVIDENCE
[If applicable, identify any new evidence submitted with the Request for Review and explain why it is material.]

V. CONCLUSION
For the foregoing reasons, the claimant respectfully requests that the Appeals Council grant review and either reverse the ALJ's decision or remand for a new hearing.

Respectfully submitted,

{{attorney_name}}
{{firm_name}}`,
  },
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

  console.log("=== Workflow & Document Template Seed ===\n");

  // -----------------------------------------------------------------------
  // 1. Resolve organization
  // -----------------------------------------------------------------------

  const org = await db.query.organizations.findFirst();
  if (!org) {
    throw new Error("No organization found. Run the base seed first.");
  }
  const organizationId = org.id;
  console.log(`Organization: ${org.name} (${organizationId})`);

  // -----------------------------------------------------------------------
  // 2. Load existing stages
  // -----------------------------------------------------------------------

  const allStages = await db.query.caseStages.findMany({
    where: eq(schema.caseStages.organizationId, organizationId),
  });
  if (allStages.length === 0) {
    throw new Error("No stages found. Run the base seed first.");
  }
  console.log(`Found ${allStages.length} stages`);

  const stageByCode = new Map(allStages.map((s) => [s.code, s]));

  // -----------------------------------------------------------------------
  // 3. Idempotency check — skip if workflows already exist
  // -----------------------------------------------------------------------

  const existingWorkflows = await db.query.workflowTemplates.findMany({
    where: eq(schema.workflowTemplates.organizationId, organizationId),
  });
  const existingDocTemplates = await db.query.documentTemplates.findMany({
    where: eq(schema.documentTemplates.organizationId, organizationId),
  });

  const hasWorkflows = existingWorkflows.length > 0;
  const hasDocTemplates = existingDocTemplates.length > 0;

  if (hasWorkflows && hasDocTemplates) {
    console.log(
      `\nAlready seeded: ${existingWorkflows.length} workflows, ${existingDocTemplates.length} document templates. Skipping.`,
    );
    console.log("To re-seed, delete existing data or reset the database.");
    await client.end();
    return;
  }

  // -----------------------------------------------------------------------
  // 4. Seed Workflow Templates + Task Templates
  // -----------------------------------------------------------------------

  if (!hasWorkflows) {
    console.log("\n--- Creating workflow templates ---");

    for (const wfDef of WORKFLOW_DEFS) {
      const stage = stageByCode.get(wfDef.triggerStageCode);
      if (!stage) {
        console.warn(
          `  Stage ${wfDef.triggerStageCode} not found, skipping workflow "${wfDef.name}"`,
        );
        continue;
      }

      const [workflow] = await db
        .insert(schema.workflowTemplates)
        .values({
          organizationId,
          name: wfDef.name,
          description: wfDef.description,
          triggerType: "stage_enter",
          triggerStageId: stage.id,
          triggerConfig: {},
          isActive: true,
          notifyAssignees: true,
          notifyCaseManager: true,
          sendClientMessage: wfDef.sendClientMessage,
          clientMessageTemplate: wfDef.clientMessageTemplate,
        })
        .returning();

      console.log(
        `  Created workflow: "${wfDef.name}" (triggers on ${stage.name})`,
      );

      // Insert task templates for this workflow
      for (let i = 0; i < wfDef.tasks.length; i++) {
        const taskDef = wfDef.tasks[i];
        await db.insert(schema.workflowTaskTemplates).values({
          workflowTemplateId: workflow.id,
          title: taskDef.title,
          description: taskDef.description,
          assignToTeam: taskDef.assignToTeam,
          priority: taskDef.priority,
          dueDaysOffset: taskDef.dueDaysOffset,
          dueBusinessDaysOnly: taskDef.dueBusinessDaysOnly,
          displayOrder: i,
        });
      }

      console.log(`    Added ${wfDef.tasks.length} task templates`);
    }
  } else {
    console.log(
      `\nSkipping workflows — ${existingWorkflows.length} already exist.`,
    );
  }

  // -----------------------------------------------------------------------
  // 5. Seed Document Templates
  // -----------------------------------------------------------------------

  if (!hasDocTemplates) {
    console.log("\n--- Creating document templates ---");

    for (const dtDef of DOCUMENT_TEMPLATE_DEFS) {
      await db.insert(schema.documentTemplates).values({
        organizationId,
        name: dtDef.name,
        description: dtDef.description,
        category: dtDef.category,
        templateContent: dtDef.templateContent,
        mergeFields: dtDef.mergeFields,
        requiresSignature: dtDef.requiresSignature,
        isActive: true,
      });

      console.log(
        `  Created template: "${dtDef.name}" (${dtDef.category}${dtDef.requiresSignature ? ", requires signature" : ""})`,
      );
    }
  } else {
    console.log(
      `\nSkipping document templates — ${existingDocTemplates.length} already exist.`,
    );
  }

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------

  console.log(`
=== Seed Complete ===

Summary:
  [x] ${WORKFLOW_DEFS.length} workflow templates with task templates
  [x] ${DOCUMENT_TEMPLATE_DEFS.length} document templates with merge fields
`);

  await client.end();
}

main().catch((err) => {
  console.error("Workflow/template seed failed:", err);
  process.exit(1);
});
