/**
 * Seed script for SSD-specific Document Templates.
 *
 * Populates the database with 8 realistic Social Security Disability
 * document templates with merge fields and placeholder content.
 *
 * Idempotent — checks by template name before inserting.
 *
 * Usage:
 *   pnpm tsx scripts/seed-templates.ts                   # local DB only
 *   pnpm tsx scripts/seed-templates.ts --yes-staging     # remote/staging DB
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Safety: --yes-staging guard
// ---------------------------------------------------------------------------

const argv = new Set(process.argv.slice(2));

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}
const DATABASE_URL = rawUrl.replace(/\\n$/, "").replace(/\n$/, "").trim();

const hostMatch = DATABASE_URL.match(/@([^/:?]+)(?::|\/|\?|$)/);
const host = hostMatch?.[1] ?? "";
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!isLocal && !argv.has("--yes-staging")) {
  console.error(
    `Refusing: DATABASE_URL host is "${host}". Pass --yes-staging to run against a remote DB.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Template Definitions
// ---------------------------------------------------------------------------

interface TemplateDef {
  name: string;
  description: string;
  category: string;
  requiresSignature: boolean;
  mergeFields: string[];
  templateContent: string;
}

const TEMPLATE_DEFS: TemplateDef[] = [
  {
    name: "SSA-1696 Fee Agreement",
    description:
      "Fee agreement submitted with the SSA-1696 Appointment of Representative form. Authorizes the firm to collect a fee from past-due benefits upon a favorable decision.",
    category: "fee_agreement",
    requiresSignature: true,
    mergeFields: ["claimant_name", "ssn_last4", "attorney_name", "date"],
    templateContent: `FEE AGREEMENT UNDER SSA-1696

Date: {{date}}

Claimant: {{claimant_name}}
SSN (last 4): xxx-xx-{{ssn_last4}}

I, {{claimant_name}}, hereby authorize {{attorney_name}} to serve as my appointed representative before the Social Security Administration in connection with my claim for disability benefits.

FEE TERMS:
I agree to pay my representative a fee equal to the lesser of:
  (a) 25% of all past-due benefits awarded, or
  (b) $7,200.00 (the current statutory maximum).

No fee is due unless benefits are awarded. This agreement is subject to approval by the Social Security Administration pursuant to 42 U.S.C. § 406(a).

I understand that I may request a review of the fee if I believe it is unreasonable.

SIGNATURES:

_________________________________          Date: ____________
{{claimant_name}}, Claimant

_________________________________          Date: ____________
{{attorney_name}}, Representative`,
  },
  {
    name: "Pre-Hearing Brief",
    description:
      "Brief submitted to the Administrative Law Judge prior to a disability hearing. Addresses the five-step sequential evaluation and summarizes the medical evidence.",
    category: "brief",
    requiresSignature: false,
    mergeFields: [
      "claimant_name",
      "case_number",
      "alj_name",
      "hearing_date",
      "alleged_onset",
      "dli",
    ],
    templateContent: `PRE-HEARING BRIEF

Re: {{claimant_name}}
Case No: {{case_number}}
Hearing Date: {{hearing_date}}
ALJ: The Honorable {{alj_name}}
Alleged Onset Date: {{alleged_onset}}
Date Last Insured: {{dli}}

Dear Judge {{alj_name}}:

Please accept this pre-hearing brief on behalf of {{claimant_name}}, who has applied for disability benefits with an alleged onset date of {{alleged_onset}} and a date last insured of {{dli}}.

I. STATEMENT OF THE CASE
[Provide background of the claimant including age, education, past relevant work, and alleged impairments.]

II. MEDICAL EVIDENCE SUMMARY
[Summarize treating source records, consultative examinations, and agency medical opinions, citing exhibit numbers.]

III. SEQUENTIAL EVALUATION ANALYSIS

A. Step One — Substantial Gainful Activity
The claimant has not engaged in substantial gainful activity since {{alleged_onset}}.

B. Step Two — Severe Impairments
[List and discuss the claimant's medically determinable severe impairments.]

C. Step Three — Listings
[Analyze whether any impairment meets or medically equals a listed impairment under 20 CFR Part 404, Subpart P, Appendix 1.]

D. Step Four — Residual Functional Capacity & Past Relevant Work
[Discuss the claimant's RFC and inability to perform past relevant work.]

E. Step Five — Other Work in the National Economy
[Address whether the claimant can perform other work considering age, education, work experience, and RFC under the Medical-Vocational Guidelines.]

IV. CONCLUSION
For the foregoing reasons, we respectfully request that the Administrative Law Judge find {{claimant_name}} disabled as of {{alleged_onset}}.

Respectfully submitted,
[Attorney Name]`,
  },
  {
    name: "Medical Source Statement Request",
    description:
      "Letter sent to a treating physician requesting a medical source statement regarding the claimant's functional limitations. Critical for building the RFC argument.",
    category: "correspondence",
    requiresSignature: false,
    mergeFields: ["provider_name", "claimant_name", "case_number", "date"],
    templateContent: `MEDICAL SOURCE STATEMENT REQUEST

Date: {{date}}

{{provider_name}}

Re: Medical Source Statement Request
Patient: {{claimant_name}}
Case No: {{case_number}}

Dear {{provider_name}}:

Our firm represents {{claimant_name}} in a claim for Social Security disability benefits (Case No. {{case_number}}). We are writing to request your professional medical opinion regarding our client's functional limitations.

Your opinion as a treating source carries significant weight in the disability determination process. We have enclosed a Medical Source Statement form for your convenience. Please address the following:

1. DIAGNOSES: List all diagnoses relevant to our client's functional limitations.

2. PHYSICAL LIMITATIONS (if applicable):
   - Maximum hours the patient can sit, stand, and walk in an 8-hour workday
   - Maximum weight the patient can lift/carry occasionally and frequently
   - Any postural limitations (bending, stooping, crouching, climbing)
   - Any manipulative limitations (reaching, handling, fingering)

3. MENTAL LIMITATIONS (if applicable):
   - Ability to understand, remember, and carry out instructions
   - Ability to maintain concentration, persistence, and pace
   - Ability to interact with supervisors, coworkers, and the public
   - Ability to adapt to changes in a routine work setting

4. EXPECTED ABSENCES: How many days per month would the patient likely be absent from work due to their conditions or treatment?

5. DURATION: How long have these limitations existed, and are they expected to last at least 12 months?

Please return the completed form to our office at your earliest convenience. If you have any questions, please do not hesitate to contact us.

Thank you for your time and dedication to our client's care.

Sincerely,
[Attorney Name]`,
  },
  {
    name: "Claimant Function Report Cover Letter",
    description:
      "Cover letter accompanying the SSA Function Report (Form SSA-3373). Provides instructions to the claimant on how to complete the form effectively.",
    category: "correspondence",
    requiresSignature: false,
    mergeFields: ["claimant_name", "date", "return_address"],
    templateContent: `FUNCTION REPORT COVER LETTER

Date: {{date}}

{{claimant_name}}

Re: Function Report — Please Complete and Return

Dear {{claimant_name}},

Enclosed please find the Social Security Administration's Function Report (Form SSA-3373). This form asks about your daily activities and how your conditions affect your ability to function. Your answers are very important to your disability claim.

INSTRUCTIONS:

1. DESCRIBE YOUR WORST DAYS — Do not describe how you function on a good day. SSA needs to understand how your conditions affect you on your most difficult days.

2. BE SPECIFIC — Instead of saying "I can't do much," explain exactly what you cannot do and why. For example: "I cannot stand longer than 10 minutes because my back pain becomes unbearable and I need to lie down."

3. INCLUDE ALL CONDITIONS — Even if you think a condition is minor, mention it. The combination of all your conditions matters.

4. DESCRIBE WHAT OTHERS DO FOR YOU — If family members or friends help you with daily tasks, explain what they do and why you need that help.

5. MENTION SIDE EFFECTS — If your medications cause drowsiness, nausea, dizziness, or other side effects that affect your functioning, describe them.

6. BE HONEST — Do not exaggerate, but do not minimize your difficulties either.

Please complete the form and return it to our office at:
{{return_address}}

If you need help completing this form, please call our office and we will schedule a time to assist you.

Sincerely,
[Attorney Name]`,
  },
  {
    name: "Request for Hearing (HA-501) Cover Sheet",
    description:
      "Cover sheet submitted with the HA-501 Request for Hearing form. Identifies the claimant, lists enclosed documents, and requests a hearing before an ALJ.",
    category: "form",
    requiresSignature: false,
    mergeFields: ["claimant_name", "ssn_last4", "hearing_office"],
    templateContent: `REQUEST FOR HEARING — COVER SHEET

Social Security Administration
Office of Disability Adjudication and Review
{{hearing_office}}

Re: Request for Hearing Before an Administrative Law Judge
Claimant: {{claimant_name}}
SSN (last 4): xxx-xx-{{ssn_last4}}

Dear Sir or Madam:

Please accept the enclosed Request for Hearing (Form HA-501-U5) on behalf of {{claimant_name}}. The claimant is requesting a hearing before an Administrative Law Judge to review the unfavorable reconsideration determination.

ENCLOSED DOCUMENTS:
  [ ] Form HA-501-U5 — Request for Hearing by Administrative Law Judge
  [ ] Form SSA-1696 — Appointment of Representative (if not already on file)
  [ ] Fee Agreement (if not already on file)
  [ ] Updated Medical Records (if available)
  [ ] Claimant Brief / Position Statement (if available)

HEARING PREFERENCES:
  - The claimant requests a hearing at the earliest available date.
  - The claimant is available for either in-person or video teleconference hearing.
  - The representative requests at least 30 days' notice before the hearing date.

SPECIAL ACCOMMODATIONS:
  [Note any language interpretation needs, mobility accommodations, or other special requirements here.]

Please confirm receipt of this filing and provide the assigned ALJ name and hearing office once available.

Respectfully submitted,
[Attorney Name]`,
  },
  {
    name: "Appeals Council Review Brief",
    description:
      "Brief submitted to the SSA Appeals Council requesting review of an unfavorable ALJ decision. Identifies legal errors, evidentiary gaps, and grounds for remand.",
    category: "brief",
    requiresSignature: false,
    mergeFields: ["claimant_name", "case_number", "alj_name", "decision_date"],
    templateContent: `BRIEF IN SUPPORT OF REQUEST FOR REVIEW BY THE APPEALS COUNCIL

Re: {{claimant_name}}
Case No: {{case_number}}
ALJ: The Honorable {{alj_name}}
Decision Date: {{decision_date}}

Appeals Council
Office of Appellate Operations
Social Security Administration

Dear Appeals Council:

Please accept this brief in support of the Request for Review of the unfavorable decision issued by Administrative Law Judge {{alj_name}} on {{decision_date}}.

I. INTRODUCTION
{{claimant_name}} respectfully requests that the Appeals Council review the ALJ's decision, which contains errors of law and is not supported by substantial evidence in the record.

II. PROCEDURAL HISTORY
[Summarize the procedural history: application date, initial denial, reconsideration denial, hearing date, and unfavorable decision.]

III. ISSUES ON APPEAL

A. The ALJ Failed to Properly Evaluate the Treating Source Opinions
The ALJ erred by failing to give controlling weight to the opinions of {{claimant_name}}'s treating physicians, as required under the applicable regulations. [Cite specific treating source opinions and the ALJ's stated reasons for discounting them.]

B. The ALJ's RFC Assessment Is Not Supported by Substantial Evidence
The RFC finding does not account for all of the claimant's credibly established limitations. Specifically: [Identify specific RFC limitations that lack evidentiary support or are contradicted by the record.]

C. The ALJ Failed to Properly Evaluate Subjective Symptoms Under SSR 16-3p
The ALJ's subjective symptom evaluation does not comply with SSR 16-3p. [Discuss specific errors in the ALJ's analysis of the claimant's reported symptoms and limitations.]

D. The ALJ's Step Five Finding Is Erroneous
[If applicable, address errors in the vocational expert testimony or the ALJ's reliance on it.]

IV. NEW AND MATERIAL EVIDENCE
[If applicable, identify new evidence submitted with the Request for Review and explain materiality.]

V. CONCLUSION
For the foregoing reasons, the claimant respectfully requests that the Appeals Council grant review and either reverse the ALJ's decision or remand for a new hearing with instructions to:
  1. Properly evaluate treating source opinions
  2. Reassess the RFC consistent with the record evidence
  3. Obtain supplemental vocational expert testimony

Respectfully submitted,
[Attorney Name]`,
  },
  {
    name: "Client Retainer Agreement",
    description:
      "Standard contingency-fee retainer agreement between the claimant and the firm for Social Security disability representation. Covers fee structure, client obligations, and scope of representation.",
    category: "fee_agreement",
    requiresSignature: true,
    mergeFields: ["claimant_name", "attorney_name", "date", "fee_percentage"],
    templateContent: `CLIENT RETAINER AGREEMENT

Date: {{date}}

PARTIES:
  Client: {{claimant_name}}
  Attorney: {{attorney_name}}

This Retainer Agreement ("Agreement") is entered into between {{claimant_name}} ("Client") and {{attorney_name}} ("Attorney") for the purpose of representation in the Client's Social Security disability claim.

1. SCOPE OF REPRESENTATION
The Attorney agrees to represent the Client in pursuing Social Security Disability Insurance (SSDI) and/or Supplemental Security Income (SSI) benefits, including but not limited to:
  - Initial applications and reconsiderations
  - Hearings before Administrative Law Judges
  - Appeals Council review
  - Federal court review (if separately agreed upon)

2. FEE ARRANGEMENT
The Client agrees to pay the Attorney a contingency fee equal to {{fee_percentage}}% of all past-due benefits awarded, not to exceed the statutory maximum currently set by the Social Security Administration. No fee is owed if the claim is unsuccessful.

3. EXPENSES
The Attorney may advance costs for obtaining medical records, consultative examinations, and other case-related expenses. These costs remain the Client's responsibility regardless of the outcome. The Attorney will provide an itemized accounting of expenses upon request.

4. CLIENT RESPONSIBILITIES
The Client agrees to:
  a) Provide truthful, complete, and timely information about their medical conditions, treatment, and daily activities
  b) Attend all scheduled medical appointments, hearings, and consultative examinations
  c) Notify the Attorney promptly of any change in address, phone number, medical condition, or work activity
  d) Cooperate with reasonable requests for information and documentation
  e) Not contact the Social Security Administration directly regarding the claim without first consulting the Attorney

5. ATTORNEY RESPONSIBILITIES
The Attorney agrees to:
  a) Diligently pursue the Client's claim
  b) Keep the Client informed of all material developments
  c) Respond to the Client's reasonable inquiries within a timely manner
  d) Maintain client confidences in accordance with applicable rules of professional conduct

6. TERMINATION
Either party may terminate this Agreement at any time by providing written notice. Upon termination, the Attorney may file a fee petition for work performed to date.

SIGNATURES:

_________________________________          Date: ____________
{{claimant_name}}, Client

_________________________________          Date: ____________
{{attorney_name}}, Attorney`,
  },
  {
    name: "Medical Records Request Letter",
    description:
      "Standard letter sent to medical providers requesting complete treatment records for a specified date range. Includes HIPAA authorization reference and record categories.",
    category: "correspondence",
    requiresSignature: false,
    mergeFields: [
      "provider_name",
      "provider_address",
      "claimant_name",
      "dob",
      "date_range",
    ],
    templateContent: `MEDICAL RECORDS REQUEST

{{provider_name}}
{{provider_address}}

Re: Medical Records Request
Patient: {{claimant_name}}
Date of Birth: {{dob}}
Date Range: {{date_range}}

Dear Medical Records Department:

Our firm represents {{claimant_name}} (DOB: {{dob}}) in connection with a Social Security disability claim. Pursuant to the enclosed HIPAA-compliant authorization signed by the patient, we are requesting complete copies of the following medical records for the period of {{date_range}}:

1. OFFICE VISIT / PROGRESS NOTES
   - All office visit notes, telephone encounter notes, and nurse visit notes

2. DIAGNOSTIC TESTING
   - Laboratory results (blood work, urinalysis, etc.)
   - Imaging studies (X-ray, MRI, CT scan reports and films/CDs if available)
   - Electrodiagnostic studies (EMG/NCS)
   - Pulmonary function tests, cardiac studies, sleep studies

3. TREATMENT RECORDS
   - Medication lists and prescription histories
   - Treatment plans and referral letters
   - Physical therapy / occupational therapy notes
   - Mental health treatment notes and psychological testing

4. SPECIALIST OPINIONS
   - Any medical source statements or opinion letters
   - Functional capacity evaluations
   - Residual functional capacity assessments
   - Disability questionnaires completed by the provider

5. HOSPITAL RECORDS (if applicable)
   - Admission and discharge summaries
   - Emergency room visit records
   - Surgical / operative reports

Please send all records to our office. If there is a fee for copying, please contact us before processing so we can authorize payment.

Thank you for your prompt attention to this request.

Sincerely,
[Attorney Name]`,
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const client = postgres(DATABASE_URL);
  const db = drizzle(client, { schema });

  console.log("=== SSD Document Template Seed ===\n");

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
  // 2. Idempotency — check which templates already exist
  // -----------------------------------------------------------------------

  const existing = await db.query.documentTemplates.findMany({
    where: eq(schema.documentTemplates.organizationId, organizationId),
  });
  const existingNames = new Set(existing.map((t) => t.name));

  const toInsert = TEMPLATE_DEFS.filter((t) => !existingNames.has(t.name));

  if (toInsert.length === 0) {
    console.log(
      `\nAll ${TEMPLATE_DEFS.length} templates already exist. Nothing to do.`,
    );
    await client.end();
    return;
  }

  console.log(
    `\nFound ${existing.length} existing templates, inserting ${toInsert.length} new ones.`,
  );

  // -----------------------------------------------------------------------
  // 3. Insert templates
  // -----------------------------------------------------------------------

  for (const def of toInsert) {
    await db.insert(schema.documentTemplates).values({
      organizationId,
      name: def.name,
      description: def.description,
      category: def.category,
      templateContent: def.templateContent,
      mergeFields: def.mergeFields,
      requiresSignature: def.requiresSignature,
      isActive: true,
    });

    console.log(
      `  Created: "${def.name}" (${def.category}${def.requiresSignature ? ", requires signature" : ""})`,
    );
  }

  // -----------------------------------------------------------------------
  // 4. Verify
  // -----------------------------------------------------------------------

  const total = await db.query.documentTemplates.findMany({
    where: and(
      eq(schema.documentTemplates.organizationId, organizationId),
      eq(schema.documentTemplates.isActive, true),
    ),
  });

  console.log(`
=== Seed Complete ===

Summary:
  Inserted: ${toInsert.length} new document templates
  Skipped:  ${TEMPLATE_DEFS.length - toInsert.length} (already existed)
  Total active templates in DB: ${total.length}
`);

  await client.end();
}

main().catch((err) => {
  console.error("Template seed failed:", err);
  process.exit(1);
});
