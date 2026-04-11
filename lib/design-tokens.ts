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
  text1: "#18181a",
  text2: "#52525e",
  text3: "#8b8b97",
  text4: "#c4c4ce",
} as const;

export const SPACING = {
  cardPadding: "p-6",
  cardRadius: "rounded-[10px]",
  buttonRadius: "rounded-[7px]",
  inputRadius: "rounded-[6px]",
  sectionGap: "space-y-6",
  rowGap: "gap-4",
} as const;
