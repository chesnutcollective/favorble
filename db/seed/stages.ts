/**
 * Default case stage groups and stages for SSA disability case management.
 *
 * Reflects the actual SSA disability process with two parallel application
 * tracks (SSDI and SSI) and branching paths through denials, reconsideration,
 * and hearings.
 */
export const defaultStageGroups = [
  {
    name: "Intake",
    color: "#6B7280",
    clientVisibleName: "Getting Started",
    clientVisibleDescription:
      "We are processing your initial paperwork and preparing your case.",
    stages: [
      {
        name: "Signed Up",
        code: "1A",
        owningTeam: "intake" as const,
        isInitial: true,
      },
    ],
  },
  {
    name: "Application",
    color: "#10B981",
    clientVisibleName: "Application in Progress",
    clientVisibleDescription:
      "Your disability application is being prepared and filed with the Social Security Administration.",
    stages: [
      {
        name: "Application Ready to File",
        code: "2A",
        owningTeam: "filing" as const,
      },
      {
        name: "Application Filed - SSDI",
        code: "2B",
        owningTeam: "filing" as const,
      },
      {
        name: "Application Filed - SSI",
        code: "2C",
        owningTeam: "filing" as const,
      },
      {
        name: "Application Filed - Both",
        code: "2D",
        owningTeam: "filing" as const,
      },
      {
        name: "Application Pending Decision",
        code: "2E",
        owningTeam: "case_management" as const,
      },
    ],
  },
  {
    name: "Reconsideration",
    color: "#F59E0B",
    clientVisibleName: "Under Review",
    clientVisibleDescription:
      "We have requested the Social Security Administration to reconsider your case.",
    stages: [
      {
        name: "Initial Denial Received",
        code: "3A",
        owningTeam: "case_management" as const,
      },
      {
        name: "Reconsideration Ready to File",
        code: "3B",
        owningTeam: "filing" as const,
      },
      {
        name: "Reconsideration Filed",
        code: "3C",
        owningTeam: "filing" as const,
      },
      {
        name: "Reconsideration Pending Decision",
        code: "3D",
        owningTeam: "case_management" as const,
      },
      {
        name: "Reconsideration Denial Received",
        code: "3E",
        owningTeam: "case_management" as const,
      },
    ],
  },
  {
    name: "Hearing",
    color: "#3B82F6",
    clientVisibleName: "Hearing Process",
    clientVisibleDescription:
      "Your case is in the hearing process. We are preparing for your hearing before an Administrative Law Judge.",
    stages: [
      {
        name: "Request for Hearing - Not Complete",
        code: "4A",
        owningTeam: "hearings" as const,
      },
      {
        name: "Request for Hearing - Ready to File",
        code: "4B",
        owningTeam: "filing" as const,
      },
      {
        name: "Request for Hearing - Filed",
        code: "4C",
        owningTeam: "hearings" as const,
      },
      {
        name: "Hearing Scheduled",
        code: "4D",
        owningTeam: "hearings" as const,
      },
      {
        name: "Hearing Held - Awaiting Decision",
        code: "4E",
        owningTeam: "hearings" as const,
      },
    ],
  },
  {
    name: "Resolution",
    color: "#8B5CF6",
    clientVisibleName: "Case Decision",
    clientVisibleDescription:
      "A decision has been made on your case.",
    stages: [
      {
        name: "Favorable Decision",
        code: "5A",
        owningTeam: "case_management" as const,
        isTerminal: true,
      },
      {
        name: "Unfavorable Decision",
        code: "5B",
        owningTeam: "case_management" as const,
        isTerminal: true,
      },
      {
        name: "Case Withdrawn",
        code: "5C",
        owningTeam: "administration" as const,
        isTerminal: true,
      },
    ],
  },
];
