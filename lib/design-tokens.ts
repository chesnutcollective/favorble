/**
 * Centralized design tokens for the Favorble UI.
 * Use these constants instead of hardcoded hex colors.
 */
export const COLORS = {
  // Brand
  brand: "#263c94",
  brandHover: "#1f3280",
  brandActive: "#18286a",
  brandSubtle: "rgba(38,60,148,0.08)",
  brandMuted: "rgba(38,60,148,0.14)",

  // Status
  ok: "#1d72b8",
  okHover: "#185f9b",
  okSubtle: "rgba(29,114,184,0.08)",
  okMuted: "rgba(29,114,184,0.14)",

  warn: "#cf8a00",
  warnSubtle: "rgba(207,138,0,0.10)",

  bad: "#d1453b",
  badSubtle: "rgba(209,69,59,0.10)",

  // Surfaces
  bg: "#FAFAF8",
  surface: "#F8F9FC",
  borderSubtle: "rgba(59,89,152,0.08)",
  borderDefault: "rgba(59,89,152,0.13)",

  // Text
  // Phase 7a — bumped text3 from #8b8b97 (3.6:1, failed AA) to #6b6b75
  // (5.4:1, passes AA). text2 is already AAA (~7.7:1 on white); text1 is
  // essentially black. text4 remains for placeholder/ghost use only and is
  // not used on body copy.
  text1: "#18181a",
  text2: "#52525e",
  text3: "#6b6b75",
  text4: "#c4c4ce",

  // Dashboard accent palette (used by per-persona dashboards)
  emerald: "#22c55e",
  emeraldDeep: "#16a34a",
  cyan: "#06b6d4",
  midnight: "#0E1633",
  parchment: "#FAFAF8",
  brass: "#b58a3c",
  gold: "#eab308",
  indigoDeep: "#1e1b4b",
} as const;

export const SPACING = {
  cardPadding: "p-6",
  cardRadius: "rounded-[10px]",
  buttonRadius: "rounded-[7px]",
  inputRadius: "rounded-[6px]",
  sectionGap: "space-y-6",
  rowGap: "gap-4",
} as const;

/**
 * Per-persona signature accent colors. Each persona's dashboard uses its accent
 * for the hero highlight, key callouts, and motion treatments. Most accents
 * keep brand-blue as the structural color and add a single secondary hue to
 * give the page identity.
 */
export type PersonaAccent = {
  /** Primary accent colour (used for hero number, key icons) */
  accent: string;
  /** Subtle background tint of the accent */
  accentSubtle: string;
  /** The dashboard canvas — most are bg, a few invert to dark or warm */
  canvas: "default" | "midnight" | "warm-paper" | "chamber";
  /** Optional secondary accent for gradients */
  accentTo?: string;
};

export const PERSONA_ACCENTS: Record<string, PersonaAccent> = {
  admin: {
    accent: "#1d72b8",
    accentSubtle: "rgba(29,114,184,0.10)",
    canvas: "default",
    accentTo: "#22c55e",
  },
  attorney: {
    accent: "#1e1b4b",
    accentSubtle: "rgba(30,27,75,0.08)",
    canvas: "default",
  },
  case_manager: {
    accent: "#263c94",
    accentSubtle: "rgba(38,60,148,0.08)",
    canvas: "default",
  },
  filing_agent: {
    accent: "#22c55e",
    accentSubtle: "rgba(34,197,94,0.10)",
    canvas: "default",
  },
  intake_agent: {
    accent: "#0E1633",
    accentSubtle: "rgba(14,22,51,0.08)",
    canvas: "midnight",
    accentTo: "#22c55e",
  },
  mail_clerk: {
    accent: "#1d72b8",
    accentSubtle: "rgba(29,114,184,0.08)",
    canvas: "default",
  },
  medical_records: {
    accent: "#22c55e",
    accentSubtle: "rgba(34,197,94,0.10)",
    canvas: "default",
  },
  phi_sheet_writer: {
    accent: "#b58a3c",
    accentSubtle: "rgba(181,138,60,0.10)",
    canvas: "warm-paper",
  },
  reviewer: {
    accent: "#263c94",
    accentSubtle: "rgba(38,60,148,0.08)",
    canvas: "default",
    accentTo: "#22c55e",
  },
  fee_collection: {
    accent: "#22c55e",
    accentSubtle: "rgba(34,197,94,0.12)",
    canvas: "midnight",
  },
  appeals_council: {
    accent: "#b58a3c",
    accentSubtle: "rgba(181,138,60,0.10)",
    canvas: "chamber",
  },
  post_hearing: {
    accent: "#06b6d4",
    accentSubtle: "rgba(6,182,212,0.10)",
    canvas: "midnight",
    accentTo: "#22c55e",
  },
  pre_hearing_prep: {
    accent: "#0E1633",
    accentSubtle: "rgba(14,22,51,0.08)",
    canvas: "midnight",
    accentTo: "#22c55e",
  },
};

export function getPersonaAccent(personaId: string): PersonaAccent {
  return PERSONA_ACCENTS[personaId] ?? PERSONA_ACCENTS.admin;
}

/**
 * Canvas surface colours for each canvas variant.
 */
export const CANVAS_SURFACES = {
  default: { bg: "#FAFAF8", surface: "#FFFFFF", text: "#18181a" },
  midnight: { bg: "#0E1633", surface: "rgba(255,255,255,0.04)", text: "#F5F5F7" },
  "warm-paper": { bg: "#F7F2E8", surface: "#FFFCF4", text: "#2A2520" },
  chamber: { bg: "#0E1633", surface: "#F5EDD8", text: "#2A2520" },
} as const;

/**
 * Animation timings used across dashboard primitives. Keep all motion
 * synchronised on these so the page has a coherent rhythm.
 */
export const ANIMATION = {
  /** Hero number / counter mount */
  countUp: 600,
  /** Section fade-up on mount */
  fadeUp: 300,
  /** Stagger between siblings in a grid */
  stagger: 60,
  /** Radial gauge arc draw on first paint */
  arcDraw: 1200,
  /** Breathing halo cadence (slows when value high) */
  breatheSlow: 3000,
  breatheFast: 1200,
  /** Live ticker scroll speed (px/s) */
  tickerScrollPxPerSec: 8,
  /** Pellet travel duration between stage cards (ms) */
  pelletTravel: 600,
} as const;
