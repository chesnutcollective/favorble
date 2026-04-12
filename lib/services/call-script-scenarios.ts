/**
 * Scenario library for call script generation (SA-4).
 *
 * Each scenario provides a system prompt addition and structure hints
 * that tailor the AI-generated call script to a specific situation.
 * The `draftCallScript` function in `ai-drafts.ts` merges the active
 * scenario into the Claude prompt so output quality is much higher
 * than a one-size-fits-all instruction.
 */

export type CallScenario = {
  id: string;
  label: string;
  systemPromptAddition: string;
  structureHints: string[];
};

export const CALL_SCENARIOS: CallScenario[] = [
  {
    id: "client_update",
    label: "Client status update",
    systemPromptAddition:
      "You're calling the client to give a case status update. Be warm, clear, mention specific dates and next steps. Reassure them that their case is on track and tell them exactly what will happen next.",
    structureHints: [
      "Greet by name and confirm you're calling from Hogan Smith Law",
      "Summarize where the case stands in plain English",
      "Mention specific upcoming dates or milestones",
      "Explain what the firm is doing next",
      "Ask if they have any questions or life changes to report",
    ],
  },
  {
    id: "denial_notification",
    label: "Denial notification",
    systemPromptAddition:
      "You're calling to inform the client about a denial. Lead with empathy, explain what happened, explain the appeal path, and be clear about the timeline. Never minimize the client's feelings.",
    structureHints: [
      "Open with warmth: acknowledge this is not the news they hoped for",
      "State the denial clearly and simply (avoid jargon)",
      "Explain the specific appeal path (reconsideration or ALJ hearing)",
      "Give the deadline for appeal (usually 60 days from decision date)",
      "Reassure them the firm is already working on the next steps",
      "Ask about any new medical evidence or changes in condition",
    ],
  },
  {
    id: "provider_followup",
    label: "Provider follow-up",
    systemPromptAddition:
      "You're calling a medical provider to follow up on outstanding records. Be professional, reference the specific records needed, give a deadline, and make it easy for the records department to comply.",
    structureHints: [
      "Identify yourself, the firm, and the patient (confirm SSN/DOB as needed)",
      "Reference the original request date and what was requested",
      "Specify which records are still outstanding",
      "Provide a firm but polite deadline (7-10 business days)",
      "Offer to re-fax the authorization if needed",
    ],
  },
  {
    id: "ssa_inquiry",
    label: "SSA inquiry",
    systemPromptAddition:
      "You're calling SSA to inquire about a case. Be formal, have the claim number ready, ask specific questions, and document every answer. Reference the claimant's SSN and claim number.",
    structureHints: [
      "State your name, firm, and representative capacity",
      "Provide the claimant's SSN and claim number upfront",
      "Ask specific, numbered questions about case status",
      "If asking about a hearing, confirm date/time/location/format (video vs in-person)",
      "Request the name of the examiner or ALJ if applicable",
      "Note the SSA rep's name and any reference/confirmation number",
    ],
  },
  {
    id: "hearing_prep",
    label: "Hearing preparation",
    systemPromptAddition:
      "You're calling the client to prepare them for their upcoming hearing. Cover what to expect, what to wear, how to answer questions, and any documents to bring. Be reassuring but thorough.",
    structureHints: [
      "Confirm the hearing date, time, and location/format",
      "Explain who will be present (ALJ, vocational expert, etc.)",
      "Coach on how to answer questions: be honest, specific, don't exaggerate",
      "Advise on appearance: business casual, arrive early",
      "List any documents or ID they need to bring",
      "Remind them the attorney will be there to help",
    ],
  },
  {
    id: "welcome_call",
    label: "Welcome call (new client)",
    systemPromptAddition:
      "You're making the initial welcome call to a new client. Introduce yourself and the firm, set expectations for the process, ask about their condition, and confirm contact info. First impressions matter.",
    structureHints: [
      "Welcome them warmly and introduce yourself by name and role",
      "Briefly explain what Hogan Smith Law does and how the process works",
      "Set timeline expectations: the disability process can take months",
      "Ask about their primary conditions and how they affect daily life",
      "Confirm their contact info, preferred contact method, and best times to call",
      "Explain what happens next (medical records requests, forms to fill out)",
    ],
  },
  {
    id: "fee_collection",
    label: "Fee collection",
    systemPromptAddition:
      "You're calling about an outstanding fee. Be polite but firm, reference the petition number and amount, and offer payment options. Stay professional and empathetic.",
    structureHints: [
      "Identify yourself and the reason for the call",
      "Reference the specific fee petition number and approved amount",
      "State the amount due and any payment already received",
      "Offer available payment options (check, ACH, payment plan)",
      "Set a clear deadline for payment or follow-up",
    ],
  },
  {
    id: "coaching_conversation",
    label: "Coaching conversation",
    systemPromptAddition:
      "You're a supervisor having a coaching conversation with a team member. Reference specific examples from recent performance data, be constructive, focus on improvement, and agree on concrete next steps.",
    structureHints: [
      "Open positively: acknowledge a recent win or strength",
      "Transition to the area of concern with specific, factual examples",
      "Ask open-ended questions to understand their perspective",
      "Collaboratively agree on 2-3 concrete improvement steps with timelines",
      "Close with encouragement and schedule a follow-up check-in",
    ],
  },
];

/** Look up a scenario by id, falling back to null if not found. */
export function getCallScenario(id: string): CallScenario | null {
  return CALL_SCENARIOS.find((s) => s.id === id) ?? null;
}
