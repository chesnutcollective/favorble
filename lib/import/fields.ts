/**
 * Available CaseFlow fields that CSV columns can map to during import.
 *
 * Lives in a non-"use server" module so it can be imported by both the
 * server action file (`app/actions/import.ts`) and the client wizard
 * (`app/(app)/import/client.tsx`). Next.js 16 only allows async function
 * exports from "use server" files.
 */
export const CASFLOW_FIELDS = [
  { value: "firstName", label: "First Name", group: "Contact" },
  { value: "lastName", label: "Last Name", group: "Contact" },
  { value: "email", label: "Email", group: "Contact" },
  { value: "phone", label: "Phone", group: "Contact" },
  { value: "address", label: "Address", group: "Contact" },
  { value: "city", label: "City", group: "Contact" },
  { value: "state", label: "State", group: "Contact" },
  { value: "zip", label: "ZIP Code", group: "Contact" },
  { value: "dateOfBirth", label: "Date of Birth", group: "Case" },
  { value: "ssaClaimNumber", label: "SSA Claim Number", group: "Case" },
  { value: "ssaOffice", label: "SSA Office", group: "Case" },
  {
    value: "applicationTypePrimary",
    label: "Application Type (Primary)",
    group: "Case",
  },
  {
    value: "applicationTypeSecondary",
    label: "Application Type (Secondary)",
    group: "Case",
  },
  { value: "allegedOnsetDate", label: "Alleged Onset Date", group: "Case" },
  { value: "dateLastInsured", label: "Date Last Insured", group: "Case" },
  { value: "hearingOffice", label: "Hearing Office", group: "Case" },
  { value: "adminLawJudge", label: "Admin Law Judge", group: "Case" },
] as const;

export type CaseFlowFieldValue = (typeof CASFLOW_FIELDS)[number]["value"];
