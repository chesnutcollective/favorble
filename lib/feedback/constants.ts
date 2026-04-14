export const FEEDBACK_CATEGORIES = [
  "bug",
  "feature",
  "ux",
  "data",
  "question",
  "other",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = [
  "open",
  "building",
  "testing",
  "staging",
  "production",
  "wont_fix",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  feature: "Feature",
  ux: "UX",
  data: "Data",
  question: "Question",
  other: "Other",
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "Open",
  building: "Building",
  testing: "Testing",
  staging: "Staging",
  production: "Production",
  wont_fix: "Won't fix",
};

export const CATEGORY_COLORS: Record<
  FeedbackCategory,
  { bg: string; fg: string }
> = {
  bug: { bg: "rgba(209,69,59,0.10)", fg: "#d1453b" },
  feature: { bg: "rgba(155,89,182,0.10)", fg: "#8e44ad" },
  ux: { bg: "rgba(207,138,0,0.10)", fg: "#cf8a00" },
  data: { bg: "rgba(29,114,184,0.10)", fg: "#1d72b8" },
  question: { bg: "rgba(100,100,120,0.10)", fg: "#64646f" },
  other: { bg: "rgba(100,100,120,0.10)", fg: "#64646f" },
};

export const STATUS_COLORS: Record<FeedbackStatus, { bg: string; fg: string }> = {
  open: { bg: "rgba(207,138,0,0.10)", fg: "#cf8a00" },
  building: { bg: "rgba(155,89,182,0.10)", fg: "#8e44ad" },
  testing: { bg: "rgba(230,126,34,0.10)", fg: "#d27524" },
  staging: { bg: "rgba(29,114,184,0.10)", fg: "#1d72b8" },
  production: { bg: "rgba(22,163,148,0.10)", fg: "#0f9e8a" },
  wont_fix: { bg: "rgba(100,100,120,0.10)", fg: "#64646f" },
};
