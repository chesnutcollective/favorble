import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getStaffUsage } from "@/app/actions/firm-insights";
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

export const metadata: Metadata = {
  title: "Staff usage",
};

type SearchParams = Promise<{
  range?: string;
  sort?: string;
  dir?: string;
  start?: string;
  end?: string;
}>;

const RANGE_PRESETS: Array<{ key: string; label: string; days: number }> = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

type SortKey =
  | "name"
  | "role"
  | "lastLogin"
  | "cases"
  | "messages"
  | "response"
  | "drafts"
  | "hours";

const SORT_OPTIONS: Array<{
  key: SortKey;
  label: string;
  align: "left" | "right";
}> = [
  { key: "name", label: "Name", align: "left" },
  { key: "role", label: "Role", align: "left" },
  { key: "lastLogin", label: "Last login", align: "left" },
  { key: "cases", label: "Active cases", align: "right" },
  { key: "messages", label: "Messages sent", align: "right" },
  { key: "response", label: "Avg resp (min)", align: "right" },
  { key: "drafts", label: "AI drafts", align: "right" },
  { key: "hours", label: "AI hrs saved", align: "right" },
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

function formatLastLogin(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return d.toISOString().slice(0, 10);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toISOString().slice(0, 10);
}

export default async function StaffUsagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSession();
  const sp = await searchParams;

  const { start, end, rangeKey } = resolveRange(sp.range, sp.start, sp.end);

  const sortKey: SortKey = (SORT_OPTIONS.find((s) => s.key === sp.sort)?.key ??
    "messages") as SortKey;
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const data = await getStaffUsage({ startDate: start, endDate: end });
  const { tiles, perUser, aiAdoption } = data;

  const sortedUsers = [...perUser].sort((a, b) => {
    const mult = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "name":
        return mult * a.name.localeCompare(b.name);
      case "role":
        return mult * a.role.localeCompare(b.role);
      case "lastLogin": {
        const ax = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
        const bx = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
        return mult * (ax - bx);
      }
      case "cases":
        return mult * (a.activeCaseCount - b.activeCaseCount);
      case "response":
        return mult * (a.avgResponseMinutes - b.avgResponseMinutes);
      case "drafts":
        return mult * (a.aiDraftsApproved - b.aiDraftsApproved);
      case "hours":
        return mult * (a.aiHoursSaved - b.aiHoursSaved);
      case "messages":
      default:
        return mult * (a.messagesSent - b.messagesSent);
    }
  });

  const sortQs = (key: SortKey): string => {
    const params = new URLSearchParams();
    params.set("range", rangeKey);
    params.set("sort", key);
    params.set(
      "dir",
      key === sortKey ? (sortDir === "asc" ? "desc" : "asc") : "desc",
    );
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff usage"
        description="Firm-adoption dashboard. Who's logged in, how many messages they sent, and how much AI they're using. Complements Team Performance (KPI-focused) with an engagement-first view."
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
                    href={`/reports/staff-usage?range=${r.key}`}
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

      {/* Top tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Active users"
          value={tiles.activeUsersThisPeriod.toLocaleString()}
          sub="With activity this period"
        />
        <MetricTile
          label="Avg cases / user"
          value={tiles.avgCasesPerUser.toFixed(1)}
        />
        <MetricTile
          label="Avg response"
          value={
            tiles.avgResponseMinutes > 0
              ? tiles.avgResponseMinutes.toFixed(1)
              : "—"
          }
          sub="minutes"
        />
        <MetricTile
          label="AI-assisted actions"
          value={tiles.totalAiAssistedActions.toLocaleString()}
          sub="Drafts + automated sends"
        />
      </div>

      {/* Per-user table */}
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
              Per-user engagement · {start} → {end}
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Click a column header to sort. Defaults to messages sent,
              descending.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {SORT_OPTIONS.map((opt) => {
                  const isActive = opt.key === sortKey;
                  return (
                    <TableHead
                      key={opt.key}
                      className={
                        opt.align === "right" ? "text-right" : undefined
                      }
                    >
                      <Link
                        href={`/reports/staff-usage${sortQs(opt.key)}`}
                        className="inline-flex items-center gap-1 hover:underline"
                        style={{
                          color: isActive ? COLORS.brand : COLORS.text2,
                        }}
                      >
                        {opt.label}
                        {isActive ? (
                          <span aria-hidden="true">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        ) : null}
                      </Link>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={SORT_OPTIONS.length}
                    className="text-center text-[#999] py-6"
                  >
                    No users to display
                  </TableCell>
                </TableRow>
              ) : (
                sortedUsers.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <Link
                        href={`/reports/team-performance/${u.userId}`}
                        className="hover:underline"
                        style={{ color: COLORS.brand }}
                      >
                        {u.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-[#666] capitalize">
                      {u.role.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-xs text-[#666]">
                      {formatLastLogin(u.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.activeCaseCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {u.messagesSent}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {u.avgResponseMinutes > 0
                        ? u.avgResponseMinutes.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {u.aiDraftsApproved}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#666]">
                      {u.aiHoursSaved > 0 ? u.aiHoursSaved.toFixed(1) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* AI adoption row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p
              className="text-[11px] uppercase tracking-wide"
              style={{ color: COLORS.text3 }}
            >
              AI-drafted outbound
            </p>
            <p
              className="mt-1 text-3xl font-semibold tabular-nums"
              style={{ color: COLORS.brand }}
            >
              {aiAdoption.aiDraftedOutboundPct}%
            </p>
            <p className="mt-1 text-xs" style={{ color: COLORS.text3 }}>
              Share of outbound messages flagged as AI-assisted or automated.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p
              className="text-[11px] uppercase tracking-wide"
              style={{ color: COLORS.text3 }}
            >
              Total AI hours saved
            </p>
            <p
              className="mt-1 text-3xl font-semibold tabular-nums"
              style={{ color: COLORS.ok }}
            >
              {aiAdoption.totalAiHoursSaved.toFixed(1)}
            </p>
            <p className="mt-1 text-xs" style={{ color: COLORS.text3 }}>
              Derived from approved AI drafts across the period.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p
              className="text-[11px] uppercase tracking-wide mb-2"
              style={{ color: COLORS.text3 }}
            >
              Top AI users
            </p>
            {aiAdoption.topUsers.length === 0 ? (
              <p
                className="text-sm"
                style={{ color: COLORS.text3 }}
              >
                No AI drafts approved yet.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {aiAdoption.topUsers.map((u, idx) => (
                  <li
                    key={u.userId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{
                          background: COLORS.brandSubtle,
                          color: COLORS.brand,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <Link
                        href={`/reports/team-performance/${u.userId}`}
                        className="hover:underline"
                        style={{ color: COLORS.text1 }}
                      >
                        {u.name}
                      </Link>
                    </span>
                    <span
                      className="tabular-nums text-xs"
                      style={{ color: COLORS.text3 }}
                    >
                      {u.aiDraftsApproved} drafts
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p
          className="text-[11px] uppercase tracking-wide"
          style={{ color: COLORS.text3 }}
        >
          {label}
        </p>
        <p
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={{ color: COLORS.text1 }}
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
