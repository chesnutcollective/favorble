/**
 * Pattern analysis primitives — stddev, z-score, outlier detection,
 * week-over-week delta. Pure stats library, no DB or server-only
 * imports. Used by RP-3, RP-4, CC-3, SM-4, PR-3.
 */

export type StatsSummary = {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stddev: number;
};

export function computeStats(values: number[]): StatsSummary {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, min: 0, max: 0, stddev: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median =
    sorted.length % 2 === 1
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return {
    count: values.length,
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stddev: Math.sqrt(variance),
  };
}

/**
 * Z-score of a value within a distribution. Negative = below mean,
 * positive = above.
 */
export function zScore(value: number, stats: StatsSummary): number {
  if (stats.stddev === 0) return 0;
  return (value - stats.mean) / stats.stddev;
}

/**
 * Identify outliers in a labeled dataset. Returns users whose value
 * is more than `thresholdStddev` away from the mean.
 */
export type LabeledValue = { label: string; value: number };

export function findOutliers(
  data: LabeledValue[],
  thresholdStddev = 2,
): Array<{ label: string; value: number; zScore: number; kind: "high" | "low" }> {
  const stats = computeStats(data.map((d) => d.value));
  const outliers: Array<{
    label: string;
    value: number;
    zScore: number;
    kind: "high" | "low";
  }> = [];
  for (const d of data) {
    const z = zScore(d.value, stats);
    if (Math.abs(z) >= thresholdStddev) {
      outliers.push({
        label: d.label,
        value: d.value,
        zScore: z,
        kind: z > 0 ? "high" : "low",
      });
    }
  }
  return outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

/**
 * Classify a metric problem as a "process problem" (team-wide gap) or
 * a "people problem" (individual outlier). Feeds RP-3.
 *
 * Logic:
 *   - If ≥70% of the team is below the target, it's a PROCESS problem.
 *   - If <30% of the team is below the target and there are outliers,
 *     it's a PEOPLE problem.
 *   - Otherwise, unclear (needs human review).
 */
export type ClassifyInput = {
  values: LabeledValue[];
  target: number;
  direction: "higher_is_better" | "lower_is_better";
};

export type Classification = {
  kind: "process" | "people" | "unclear";
  reason: string;
  belowTargetCount: number;
  totalCount: number;
  outliers: Array<{ label: string; value: number; zScore: number }>;
};

export function classifyProblem(input: ClassifyInput): Classification {
  const { values, target, direction } = input;
  const total = values.length;
  if (total === 0) {
    return {
      kind: "unclear",
      reason: "No data",
      belowTargetCount: 0,
      totalCount: 0,
      outliers: [],
    };
  }

  const belowTarget = values.filter((v) =>
    direction === "higher_is_better" ? v.value < target : v.value > target,
  );
  const ratio = belowTarget.length / total;
  const outliers = findOutliers(values);

  if (ratio >= 0.7) {
    return {
      kind: "process",
      reason: `${belowTarget.length} of ${total} (${Math.round(ratio * 100)}%) are below target — this is team-wide`,
      belowTargetCount: belowTarget.length,
      totalCount: total,
      outliers: outliers
        .filter((o) => o.kind === "low")
        .map((o) => ({ label: o.label, value: o.value, zScore: o.zScore })),
    };
  }

  if (ratio < 0.3 && outliers.length > 0) {
    return {
      kind: "people",
      reason: `Only ${belowTarget.length} of ${total} (${Math.round(ratio * 100)}%) are below target — the rest of the team is healthy`,
      belowTargetCount: belowTarget.length,
      totalCount: total,
      outliers: outliers.map((o) => ({
        label: o.label,
        value: o.value,
        zScore: o.zScore,
      })),
    };
  }

  return {
    kind: "unclear",
    reason: `${belowTarget.length} of ${total} below target — mixed signal`,
    belowTargetCount: belowTarget.length,
    totalCount: total,
    outliers: outliers.map((o) => ({
      label: o.label,
      value: o.value,
      zScore: o.zScore,
    })),
  };
}

/**
 * Compute week-over-week delta for a time series. Returns the percent
 * change from the previous period to the current period.
 */
export function computeDelta(
  current: number,
  previous: number,
): { delta: number; deltaPercent: number | null } {
  const delta = current - previous;
  const deltaPercent =
    previous === 0 ? null : Math.round((delta / previous) * 1000) / 10;
  return { delta, deltaPercent };
}

/**
 * Classify a trend direction over a time series of values
 * (oldest first). Returns "improving" / "declining" / "stable".
 */
export function classifyTrend(
  values: number[],
  direction: "higher_is_better" | "lower_is_better",
): "improving" | "declining" | "stable" {
  if (values.length < 2) return "stable";

  // Simple linear regression slope
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return "stable";
  const slope = num / den;

  const threshold = Math.abs(yMean) * 0.05; // 5% of mean is meaningful
  if (Math.abs(slope) < threshold) return "stable";

  const improving =
    direction === "higher_is_better" ? slope > 0 : slope < 0;
  return improving ? "improving" : "declining";
}
