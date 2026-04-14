import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getExecRoi } from "@/app/actions/firm-insights";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHead,
  TableHeader,
} from "@/components/ui/table";
import { COLORS } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Exec ROI",
};

type SearchParams = Promise<{
  range?: string;
  start?: string;
  end?: string;
}>;

const RANGE_PRESETS: Array<{ key: string; label: string; days: number }> = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

function resolveRange(
  rangeKey: string | undefined,
  startParam: string | undefined,
  endParam: string | undefined,
): { start: string; end: string; rangeKey: string } {
  const today = new Date();
  const endStr = today.toISOString().slice(0, 10);

  if (startParam && endParam) {
    return { start: startParam, end: endParam, rangeKey: "custom" };
  }

  const preset =
    RANGE_PRESETS.find((r) => r.key === rangeKey) ?? RANGE_PRESETS[1];
  const start = new Date(today.getTime() - preset.days * 86400 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: endStr,
    rangeKey: preset.key,
  };
}

export default async function ExecRoiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const { start, end, rangeKey } = resolveRange(sp.range, sp.start, sp.end);

  const roi = await getExecRoi({ startDate: start, endDate: end });
  const { hero, revenue } = roi;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exec ROI"
        description="Executive-framing view of firm performance, AI impact, and revenue economics. Stubs clearly labeled where the data source hasn't shipped yet."
      />

      {/* Period selector */}
      <Card>
        <CardContent className="p-5">
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text3 }}
            >
              Period
            </p>
            <div className="flex flex-wrap gap-2">
              {RANGE_PRESETS.map((r) => {
                const active = rangeKey === r.key;
                return (
                  <Link
                    key={r.key}
                    href={`/reports/roi?range=${r.key}`}
                    className="inline-flex items-center px-3 py-1.5 rounded-md border text-xs"
                    style={{
                      borderColor: active
                        ? COLORS.brand
                        : COLORS.borderDefault,
                      color: active ? COLORS.brand : COLORS.text2,
                      background: active ? COLORS.brandSubtle : "transparent",
                    }}
                  >
                    {r.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricTile
          label="Active cases"
          value={hero.totalActiveCases.toLocaleString()}
          sub="Snapshot"
        />
        <MetricTile
          label="Client engagement"
          value={
            hero.clientEngagementPct > 0 ? `${hero.clientEngagementPct}%` : "—"
          }
          sub="Coming with portal"
          stub
        />
        <MetricTile
          label="User logins"
          value={hero.userLogins > 0 ? hero.userLogins.toLocaleString() : "—"}
          sub="Coming with portal"
          stub
        />
        <MetricTile
          label="FTE-equivalents saved"
          value={hero.fteEquivalentsSaved.toFixed(1)}
          sub="AI hours ÷ 160 hrs/mo"
        />
        <MetricTile
          label="NPS referral est."
          value={
            hero.npsReferralEstimate > 0
              ? hero.npsReferralEstimate.toLocaleString()
              : "—"
          }
          sub="Coming with portal"
          stub
        />
      </div>

      {/* Revenue / ROI block */}
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
              Revenue &amp; ROI
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Per-case economics. AI impact is derived from approved drafts
              over the selected window. Revenue metrics stubbed until billing
              integration ships.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  Cost to serve / case
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#999]">
                  —
                </TableCell>
                <TableCell className="text-xs" title="Coming with portal">
                  Coming with cost-tracking
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Revenue / case</TableCell>
                <TableCell className="text-right tabular-nums text-[#999]">
                  {revenue.revenuePerCase != null
                    ? `$${revenue.revenuePerCase.toLocaleString()}`
                    : "—"}
                </TableCell>
                <TableCell className="text-xs">
                  Coming with billing integration
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">AI savings ($)</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  ${revenue.aiDollarsSaved.toLocaleString()}
                </TableCell>
                <TableCell className="text-xs">
                  Derived from approved AI drafts · loaded rate $75/hr
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">AI hours saved</TableCell>
                <TableCell className="text-right tabular-nums">
                  {revenue.aiHoursSaved.toFixed(1)}
                </TableCell>
                <TableCell className="text-xs">
                  Author-minutes saved ÷ 60 · penalized by edit distance
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Net ROI</TableCell>
                <TableCell className="text-right tabular-nums text-[#999]">
                  —
                </TableCell>
                <TableCell className="text-xs">
                  Needs revenue + cost-to-serve
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs" style={{ color: COLORS.text3 }}>
        Window: {start} → {end}. Stub tiles are marked so finance can see what
        lands once the client portal and billing integration ship.
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  stub,
}: {
  label: string;
  value: string;
  sub?: string;
  stub?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4" title={stub ? "Available when client portal ships" : undefined}>
        <div className="flex items-center justify-between">
          <p
            className="text-[11px] uppercase tracking-wide"
            style={{ color: COLORS.text3 }}
          >
            {label}
          </p>
          {stub ? (
            <span
              className="text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 border"
              style={{
                color: COLORS.text3,
                borderColor: COLORS.borderDefault,
              }}
            >
              stub
            </span>
          ) : null}
        </div>
        <p
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={{ color: stub ? COLORS.text3 : COLORS.text1 }}
        >
          {value}
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
