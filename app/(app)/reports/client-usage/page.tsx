import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COLORS } from "@/lib/design-tokens";
import {
  getClientUsage,
  type ClientUsageData,
  type ClientUsagePeriod,
} from "@/app/actions/client-usage";

export const metadata: Metadata = {
  title: "Client Usage",
};

type SearchParams = Promise<{ period?: "day" | "week" | "month" }>;

function emptyState(period: ClientUsagePeriod): ClientUsageData {
  return {
    period,
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    tiles: {
      totalClients: 0,
      activatedClients: 0,
      engagementRate: 0,
      adoption: { mobile: 0, web: 0, sms: 0 },
    },
    funnel: [
      {
        key: "new_contacts",
        label: "New contacts",
        count: 0,
        stub: false,
      },
      { key: "invited", label: "Invited", count: 0, stub: true },
      { key: "activated", label: "Activated", count: 0, stub: true },
      { key: "engaged", label: "Engaged", count: 0, stub: true },
      { key: "closed", label: "Closed", count: 0, stub: false },
    ],
    perCase: [],
    staleClients: [],
  };
}

export default async function ClientUsagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;
  const period: ClientUsagePeriod =
    sp.period === "day" || sp.period === "month" ? sp.period : "week";

  let data: ClientUsageData = emptyState(period);
  try {
    data = await getClientUsage(period);
  } catch {
    // DB unavailable → keep empty state
  }

  const { tiles, funnel, perCase, staleClients } = data;
  const funnelMax = Math.max(1, ...funnel.map((s) => s.count));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Usage"
        description="How clients engage with the firm and portal. Portal-driven metrics light up once the client portal ships."
      />

      {/* Period filter */}
      <Card>
        <CardContent className="p-5">
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text3 }}
            >
              Period
            </p>
            <div className="flex gap-2">
              {(["day", "week", "month"] as const).map((p) => (
                <Link
                  key={p}
                  href={`/reports/client-usage?period=${p}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs capitalize"
                  style={{
                    borderColor:
                      p === period ? COLORS.brand : COLORS.borderDefault,
                    color: p === period ? COLORS.brand : COLORS.text2,
                    background:
                      p === period ? COLORS.brandSubtle : "transparent",
                  }}
                >
                  {p}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="Total clients" value={tiles.totalClients} />
        <MetricTile
          label="Activated clients"
          value={tiles.activatedClients}
          stub
        />
        <MetricTile
          label="Engagement rate"
          value={tiles.engagementRate}
          suffix="%"
          stub
        />
        <AdoptionTile adoption={tiles.adoption} />
      </div>

      {/* Client funnel */}
      <Card>
        <CardContent className="p-0">
          <div
            className="px-6 py-3 border-b flex items-center justify-between gap-3"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <div>
              <h2
                className="text-sm font-semibold"
                style={{ color: COLORS.text1 }}
              >
                Client funnel · {period}
              </h2>
              <p className="text-xs" style={{ color: COLORS.text3 }}>
                New contacts → Invited → Activated → Engaged → Closed.
              </p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-3">
            {funnel.map((stage) => {
              const pct = Math.round((stage.count / funnelMax) * 100);
              return (
                <div key={stage.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span style={{ color: COLORS.text2 }}>
                        {stage.label}
                      </span>
                      {stage.stub && <ShipsWithPortalPill />}
                    </div>
                    <span
                      className="tabular-nums font-semibold"
                      style={{ color: COLORS.text1 }}
                    >
                      {stage.count.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="h-2.5 rounded-full overflow-hidden"
                    style={{ background: COLORS.borderSubtle }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(stage.count > 0 ? 4 : 0, pct)}%`,
                        background: stage.stub ? COLORS.text4 : COLORS.brand,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Per-case engagement */}
      <Card>
        <CardContent className="p-0">
          <div
            className="px-6 py-3 border-b"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <h2
              className="text-sm font-semibold"
              style={{ color: COLORS.text1 }}
            >
              Top cases by recent activity
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Sorted by most recent firm communication. Client-message tracking
              ships with the portal.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case #</TableHead>
                <TableHead>Claimant</TableHead>
                <TableHead>Last firm message</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1.5">
                    Last client message
                    <ShipsWithPortalPill />
                  </span>
                </TableHead>
                <TableHead className="text-right">Days since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perCase.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-[#999] py-6"
                  >
                    No case activity in this window
                  </TableCell>
                </TableRow>
              ) : (
                perCase.map((r) => (
                  <TableRow key={r.caseId}>
                    <TableCell>
                      <Link
                        href={`/cases/${r.caseId}`}
                        className="hover:underline"
                        style={{ color: COLORS.brand }}
                      >
                        {r.caseNumber}
                      </Link>
                    </TableCell>
                    <TableCell style={{ color: COLORS.text2 }}>
                      {r.claimantName}
                    </TableCell>
                    <TableCell
                      className="tabular-nums"
                      style={{ color: COLORS.text2 }}
                    >
                      {r.lastFirmMessageAt
                        ? new Date(r.lastFirmMessageAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell style={{ color: COLORS.text3 }}>—</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        style={{
                          color:
                            r.daysSinceLastInteraction == null
                              ? COLORS.text3
                              : r.daysSinceLastInteraction >= 14
                                ? COLORS.bad
                                : r.daysSinceLastInteraction >= 7
                                  ? COLORS.warn
                                  : COLORS.text2,
                        }}
                      >
                        {r.daysSinceLastInteraction ?? "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stale clients */}
      <Card>
        <CardContent className="p-0">
          <div
            className="px-6 py-3 border-b"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <h2
              className="text-sm font-semibold"
              style={{ color: COLORS.text1 }}
            >
              Stale clients · 14+ days without contact
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Clients with no recorded interaction in two weeks or more. Based
              on communications only — portal activity will fold in once the
              portal ships.
            </p>
          </div>
          {staleClients.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm" style={{ color: COLORS.text3 }}>
                No stale clients right now.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claimant</TableHead>
                  <TableHead>Case #</TableHead>
                  <TableHead>Last interaction</TableHead>
                  <TableHead className="text-right">Days stale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleClients.map((r, i) => (
                  <TableRow key={`${r.caseId ?? "no-case"}-${i}`}>
                    <TableCell style={{ color: COLORS.text1 }}>
                      {r.claimantName}
                    </TableCell>
                    <TableCell>
                      {r.caseId && r.caseNumber ? (
                        <Link
                          href={`/cases/${r.caseId}`}
                          className="hover:underline"
                          style={{ color: COLORS.brand }}
                        >
                          {r.caseNumber}
                        </Link>
                      ) : (
                        <span style={{ color: COLORS.text3 }}>—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="tabular-nums"
                      style={{ color: COLORS.text2 }}
                    >
                      {r.lastInteractionAt
                        ? new Date(r.lastInteractionAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        style={{
                          color:
                            r.daysStale >= 30
                              ? COLORS.bad
                              : r.daysStale >= 14
                                ? COLORS.warn
                                : COLORS.text2,
                        }}
                      >
                        {r.daysStale}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShipsWithPortalPill() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
      style={{
        color: COLORS.text3,
        background: COLORS.borderSubtle,
      }}
      title="This metric activates once the client portal ships."
    >
      Ships with portal
    </span>
  );
}

function MetricTile({
  label,
  value,
  suffix,
  sub,
  stub,
}: {
  label: string;
  value: number;
  suffix?: string;
  sub?: string;
  stub?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-[11px] uppercase tracking-wide"
            style={{ color: COLORS.text3 }}
          >
            {label}
          </p>
          {stub && <ShipsWithPortalPill />}
        </div>
        <p
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={{ color: stub ? COLORS.text3 : COLORS.text1 }}
        >
          {value.toLocaleString()}
          {suffix ?? ""}
        </p>
        {sub && (
          <p className="mt-0.5 text-xs" style={{ color: COLORS.text3 }}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AdoptionTile({
  adoption,
}: {
  adoption: { mobile: number; web: number; sms: number };
}) {
  const total = adoption.mobile + adoption.web + adoption.sms;
  const slices: Array<{
    key: "mobile" | "web" | "sms";
    label: string;
    color: string;
  }> = [
    { key: "mobile", label: "Mobile", color: COLORS.brand },
    { key: "web", label: "Web", color: COLORS.ok },
    { key: "sms", label: "SMS", color: COLORS.warn },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-[11px] uppercase tracking-wide"
            style={{ color: COLORS.text3 }}
          >
            Adoption split
          </p>
          <ShipsWithPortalPill />
        </div>
        <div className="mt-2 flex items-center gap-3">
          <StubPie />
          <ul className="space-y-1 flex-1 min-w-0">
            {slices.map((s) => {
              const v = adoption[s.key];
              const pct = total > 0 ? Math.round((v / total) * 100) : 0;
              return (
                <li
                  key={s.key}
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: s.color }}
                  />
                  <span style={{ color: COLORS.text2 }} className="flex-1">
                    {s.label}
                  </span>
                  <span
                    className="tabular-nums"
                    style={{ color: COLORS.text3 }}
                  >
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/** Placeholder pie — a muted donut shape so the card has visual anchor. */
function StubPie() {
  const size = 44;
  const r = 18;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.text4} strokeWidth={6} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={COLORS.borderSubtle}
        strokeWidth={6}
        strokeDasharray={`${(2 * Math.PI * r) / 3} ${2 * Math.PI * r}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
}
