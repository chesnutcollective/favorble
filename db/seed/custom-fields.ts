/**
 * Default custom field definitions organized by team.
 *
 * These represent the commonly used fields for SSA disability case management.
 * Fields with team=null are global (visible to all teams).
 */
export const defaultCustomFields = [
  // Global fields
  {
    name: "Emergency Contact Name",
    slug: "emergency_contact_name",
    fieldType: "text" as const,
    team: null,
    section: "Contact Info",
  },
  {
    name: "Emergency Contact Phone",
    slug: "emergency_contact_phone",
    fieldType: "phone" as const,
    team: null,
    section: "Contact Info",
  },
  {
    name: "Mother's First and Last Name",
    slug: "mothers_name",
    fieldType: "text" as const,
    team: null,
    section: "Personal Info",
  },
  {
    name: "Father's First and Last Name",
    slug: "fathers_name",
    fieldType: "text" as const,
    team: null,
    section: "Personal Info",
  },
  {
    name: "Place of Birth",
    slug: "place_of_birth",
    fieldType: "text" as const,
    team: null,
    section: "Personal Info",
  },

  // Intake team fields
  {
    name: "Disability Description",
    slug: "disability_description",
    fieldType: "textarea" as const,
    team: "intake" as const,
    section: "Disability Info",
  },
  {
    name: "Currently Working",
    slug: "currently_working",
    fieldType: "boolean" as const,
    team: "intake" as const,
    section: "Employment",
  },
  {
    name: "Last Date Worked",
    slug: "last_date_worked",
    fieldType: "date" as const,
    team: "intake" as const,
    section: "Employment",
  },
  {
    name: "Monthly Household Income",
    slug: "monthly_income",
    fieldType: "currency" as const,
    team: "intake" as const,
    section: "Financial Info",
  },
  {
    name: "Referral Source",
    slug: "referral_source",
    fieldType: "select" as const,
    team: "intake" as const,
    section: "Lead Info",
    options: [
      "Website",
      "Referral",
      "Social Media",
      "TV/Radio",
      "Previous Client",
      "Other",
    ],
  },

  // Medical records team fields
  {
    name: "Primary Treating Physician",
    slug: "primary_physician",
    fieldType: "text" as const,
    team: "medical_records" as const,
    section: "Medical Providers",
  },
  {
    name: "Primary Physician Phone",
    slug: "primary_physician_phone",
    fieldType: "phone" as const,
    team: "medical_records" as const,
    section: "Medical Providers",
  },
  {
    name: "Records Requested Date",
    slug: "records_requested_date",
    fieldType: "date" as const,
    team: "medical_records" as const,
    section: "Records Tracking",
  },
  {
    name: "Records Received Date",
    slug: "records_received_date",
    fieldType: "date" as const,
    team: "medical_records" as const,
    section: "Records Tracking",
  },
  {
    name: "Medical Summary Completed",
    slug: "medical_summary_completed",
    fieldType: "boolean" as const,
    team: "medical_records" as const,
    section: "Records Tracking",
  },

  // Filing team fields
  {
    name: "SSDI Application Number",
    slug: "ssdi_application_number",
    fieldType: "text" as const,
    team: "filing" as const,
    section: "Application Details",
  },
  {
    name: "SSI Application Number",
    slug: "ssi_application_number",
    fieldType: "text" as const,
    team: "filing" as const,
    section: "Application Details",
  },
  {
    name: "Filing Date",
    slug: "filing_date",
    fieldType: "date" as const,
    team: "filing" as const,
    section: "Application Details",
  },
  {
    name: "Protective Filing Date",
    slug: "protective_filing_date",
    fieldType: "date" as const,
    team: "filing" as const,
    section: "Application Details",
  },

  // Hearings team fields
  {
    name: "Hearing Date",
    slug: "hearing_date",
    fieldType: "date" as const,
    team: "hearings" as const,
    section: "Hearing Details",
  },
  {
    name: "Hearing Time",
    slug: "hearing_time",
    fieldType: "text" as const,
    team: "hearings" as const,
    section: "Hearing Details",
  },
  {
    name: "ALJ Name",
    slug: "alj_name",
    fieldType: "text" as const,
    team: "hearings" as const,
    section: "Hearing Details",
  },
  {
    name: "Hearing Type",
    slug: "hearing_type",
    fieldType: "select" as const,
    team: "hearings" as const,
    section: "Hearing Details",
    options: ["In Person", "Video", "Phone"],
  },
  {
    name: "Pre-Hearing Brief Submitted",
    slug: "prehearing_brief_submitted",
    fieldType: "boolean" as const,
    team: "hearings" as const,
    section: "Hearing Prep",
  },

  // Case management fields
  {
    name: "Next Follow-Up Date",
    slug: "next_followup_date",
    fieldType: "date" as const,
    team: "case_management" as const,
    section: "Case Tracking",
  },
  {
    name: "Case Priority",
    slug: "case_priority",
    fieldType: "select" as const,
    team: "case_management" as const,
    section: "Case Tracking",
    options: ["Low", "Normal", "High", "Urgent"],
  },
  {
    name: "Decision Date",
    slug: "decision_date",
    fieldType: "date" as const,
    team: "case_management" as const,
    section: "Decision Info",
  },
  {
    name: "Decision Type",
    slug: "decision_type",
    fieldType: "select" as const,
    team: "case_management" as const,
    section: "Decision Info",
    options: [
      "Fully Favorable",
      "Partially Favorable",
      "Unfavorable",
      "Dismissed",
    ],
  },
];
