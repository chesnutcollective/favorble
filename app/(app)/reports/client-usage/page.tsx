import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getClientUsageReport } from "@/app/actions/client-usage";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActivationPeriod } from "@/app/actions/client-activation";

export const metadata: Metadata = {
  title: "Client Portal Usage",
};

const PERIOD_LABELS: Record<ActivationPeriod, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

function isValidPeriod(value: string | undefined): value is ActivationPeriod {
  return value === "7d" || value === "30d" || value === "90d" || value === "all";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "invited":
      return "Invited";
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "deactivated":
      return "Deactivated";
    default:
      return status;
  }
}

export default async function ClientUsageReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSession();
  const params = await searchParams;
  const period: ActivationPeriod = isValidPeriod(params.period)
    ? params.period
    : "30d";

  let report: Awaited<ReturnType<typeof getClientUsageReport>> = {
    metrics: {
      period,
      periodStart: null,
      invited: 0,
      activated: 0,
      engaged: 0,
      closed: 0,
      activationRate: 0,
      engagementRate: 0,
    },
    rows: [],
  };
  try {
    report = await getClientUsageReport(period);
  } catch {
    // DB unavailable — render zeros.
  }

  const { metrics, rows } = report;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Portal Usage"
        description={`Activation funnel and per-claimant engagement — ${PERIOD_LABELS[period]}.`}
      />

      {/* Period filter */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(PERIOD_LABELS) as ActivationPeriod[]).map((p) => (
          <a
            key={p}
            href={`/reports/client-usage?period=${p}`}
            className={
              "rounded-md border px-3 py-1 text-[13px] transition-colors " +
              (p === period
                ? "border-[#1d72b8] bg-[rgba(29,114,184,0.08)] text-[#185f9b]"
                : "border-[#EAEAEA] bg-white text-[#666] hover:border-[#CCC]")
            }
          >
            {PERIOD_LABELS[p]}
          </a>
        ))}
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Invited"
          value={metrics.invited}
          subtitle="invitations sent"
        />
        <StatsCard
          title="Activated"
          value={metrics.activated}
          subtitle={`${formatPercent(metrics.activationRate)} activation rate`}
        />
        <StatsCard
          title="Engaged"
          value={metrics.engaged}
          subtitle={`${formatPercent(metrics.engagementRate)} of activated`}
        />
        <StatsCard
          title="Closed"
          value={metrics.closed}
          subtitle="cases closed in period"
        />
      </div>

      {/* Per-claimant table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claimant</TableHead>
              <TableHead>Case</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Invited</TableHead>
              <TableHead className="hidden md:table-cell">Activated</TableHead>
              <TableHead className="hidden md:table-cell">
                Last login
              </TableHead>
              <TableHead className="text-right">Logins</TableHead>
              <TableHead className="text-right">30d events</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No portal users yet. Send invites from a contact record to
                  populate this report.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.portalUserId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {r.lastName}, {r.firstName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.caseNumber ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        "inline-block rounded-[3px] border px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.04em] " +
                        (r.status === "active"
                          ? "border-[#1d72b8]/30 bg-[rgba(29,114,184,0.08)] text-[#185f9b]"
                          : r.status === "invited"
                            ? "border-[#EAEAEA] bg-[#FAFAFA] text-[#999]"
                            : "border-[#EE0000]/30 bg-[rgba(238,0,0,0.08)] text-[#EE0000]")
                      }
                    >
                      {statusLabel(r.status)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(r.invitedAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(r.activatedAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(r.lastLoginAt)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {r.loginCount}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {r.activityCount30d}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
