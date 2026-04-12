import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import {
  getUpcomingHearings,
  type UpcomingHearing,
} from "@/app/actions/hearings";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  Clock01Icon,
  CourtHouseIcon,
  JusticeScale01Icon,
  Video01Icon,
  TelephoneIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

export const metadata: Metadata = {
  title: "Hearings",
};

const PRIMARY = "#263c94";
const STATUS_READY = "#1d72b8";
const STATUS_PARTIAL = "#cf8a00";
const STATUS_URGENT = "#d1453b";
const TINT = "rgba(38,60,148,0.08)";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function bucketHearings(hearings: UpcomingHearing[]) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  const in7Days = addDays(today, 8);
  const in30Days = addDays(today, 31);

  const hero: UpcomingHearing[] = [];
  const thisWeek: UpcomingHearing[] = [];
  const upcoming: UpcomingHearing[] = [];

  for (const h of hearings) {
    const when = h.startAt;
    if (when >= today && when < dayAfterTomorrow) {
      hero.push(h);
    } else if (when >= dayAfterTomorrow && when < in7Days) {
      thisWeek.push(h);
    } else if (when >= in7Days && when < in30Days) {
      upcoming.push(h);
    }
  }
  return { hero, thisWeek, upcoming };
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWhen(date: Date) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const when = startOfDay(date);
  if (when.getTime() === today.getTime()) return `Today · ${formatTime(date)}`;
  if (when.getTime() === tomorrow.getTime())
    return `Tomorrow · ${formatTime(date)}`;
  return `${date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${formatTime(date)}`;
}

function modeIconFor(mode: UpcomingHearing["modeOfAppearance"]) {
  if (mode === "video") return Video01Icon;
  if (mode === "phone") return TelephoneIcon;
  if (mode === "in_person") return CourtHouseIcon;
  return Calendar03Icon;
}

function modeLabel(mode: UpcomingHearing["modeOfAppearance"]) {
  if (mode === "video") return "Video";
  if (mode === "phone") return "Phone";
  if (mode === "in_person") return "In-person";
  return "TBD";
}

function prepStatusStyles(status: UpcomingHearing["prepStatus"]) {
  if (status === "ready")
    return {
      color: STATUS_READY,
      bg: "rgba(29,114,184,0.10)",
      label: "Ready",
    };
  if (status === "partial")
    return {
      color: STATUS_PARTIAL,
      bg: "rgba(207,138,0,0.12)",
      label: "Partial",
    };
  return {
    color: STATUS_URGENT,
    bg: "rgba(209,69,59,0.10)",
    label: "Not ready",
  };
}

function HeroHearingCard({ hearing }: { hearing: UpcomingHearing }) {
  const prep = prepStatusStyles(hearing.prepStatus);
  const ModeIcon = modeIconFor(hearing.modeOfAppearance);
  const claimant =
    hearing.claimantFirstName || hearing.claimantLastName
      ? `${hearing.claimantFirstName ?? ""} ${hearing.claimantLastName ?? ""}`.trim()
      : hearing.title;

  const href = hearing.caseId ? `/hearings/${hearing.caseId}` : "#";

  return (
    <Link href={href} className="block">
      <Card
        className="h-full border-[#EAEAEA] hover:border-[#263c94] transition-colors"
        style={{ borderLeft: `3px solid ${PRIMARY}` }}
      >
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: PRIMARY }}
              >
                {formatWhen(hearing.startAt)}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground truncate">
                {claimant}
              </h3>
              {hearing.caseNumber && (
                <p className="text-xs text-muted-foreground">
                  {hearing.caseNumber}
                </p>
              )}
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ color: prep.color, backgroundColor: prep.bg }}
            >
              {prep.label}
            </span>
          </div>

          <div className="space-y-1.5 text-[13px]">
            {hearing.adminLawJudge && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <HugeiconsIcon
                  icon={JusticeScale01Icon}
                  size={14}
                  color={PRIMARY}
                />
                <span className="text-foreground">
                  ALJ {hearing.adminLawJudge}
                </span>
              </div>
            )}
            {hearing.hearingOffice && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <HugeiconsIcon
                  icon={CourtHouseIcon}
                  size={14}
                  color={PRIMARY}
                />
                <span className="text-foreground truncate">
                  {hearing.hearingOffice}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <HugeiconsIcon icon={ModeIcon} size={14} color={PRIMARY} />
              <span className="text-foreground">
                {modeLabel(hearing.modeOfAppearance)}
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-3 border-t pt-3 text-[11px] text-muted-foreground"
            style={{ borderColor: "#EAEAEA" }}
          >
            <span>Chronology: {hearing.chronologyCount}</span>
            <span>·</span>
            <span>PHI sheet: {hearing.hasPhiSheet ? "Done" : "Missing"}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function WeekRow({ hearing }: { hearing: UpcomingHearing }) {
  const prep = prepStatusStyles(hearing.prepStatus);
  const ModeIcon = modeIconFor(hearing.modeOfAppearance);
  const claimant =
    hearing.claimantFirstName || hearing.claimantLastName
      ? `${hearing.claimantFirstName ?? ""} ${hearing.claimantLastName ?? ""}`.trim()
      : hearing.title;

  const href = hearing.caseId ? `/hearings/${hearing.caseId}` : "#";

  return (
    <Link
      href={href}
      className="flex items-center gap-4 py-3 border-b last:border-b-0 border-[#EAEAEA] hover:bg-[#F8F9FC]"
    >
      <div className="w-28 shrink-0">
        <p className="text-[11px] font-medium" style={{ color: PRIMARY }}>
          {hearing.startAt.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatTime(hearing.startAt)}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {claimant}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {hearing.caseNumber && <span>{hearing.caseNumber}</span>}
          {hearing.adminLawJudge && (
            <>
              <span>·</span>
              <span>ALJ {hearing.adminLawJudge}</span>
            </>
          )}
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
        <HugeiconsIcon icon={ModeIcon} size={14} color={PRIMARY} />
        <span>{modeLabel(hearing.modeOfAppearance)}</span>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
        style={{ color: prep.color, backgroundColor: prep.bg }}
      >
        {prep.label}
      </span>
    </Link>
  );
}

function UpcomingGrid({ hearings }: { hearings: UpcomingHearing[] }) {
  // Group by date (YYYY-MM-DD)
  const byDay = new Map<string, UpcomingHearing[]>();
  for (const h of hearings) {
    const key = h.startAt.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(h);
  }

  const days = Array.from(byDay.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6">
        No hearings scheduled in the next 30 days.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {days.map(([key, items]) => {
        const date = new Date(`${key}T00:00:00`);
        return (
          <div
            key={key}
            className="rounded-md border border-[#EAEAEA] p-3"
            style={{ backgroundColor: "#F8F9FC" }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: PRIMARY }}
            >
              {date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </p>
            <div className="space-y-2">
              {items.map((h) => {
                const claimant =
                  h.claimantFirstName || h.claimantLastName
                    ? `${h.claimantFirstName ?? ""} ${h.claimantLastName ?? ""}`.trim()
                    : h.title;
                return (
                  <Link
                    key={h.id}
                    href={h.caseId ? `/hearings/${h.caseId}` : "#"}
                    className="block rounded border border-[#EAEAEA] bg-white p-2 hover:border-[#263c94]"
                  >
                    <p className="text-xs font-medium text-foreground truncate">
                      {claimant}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {formatTime(h.startAt)}
                      </span>
                      {h.adminLawJudge && (
                        <span className="text-[11px] text-muted-foreground truncate ml-2">
                          {h.adminLawJudge}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilterLinks({ current }: { current: "all" | "mine" }) {
  const base =
    "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors";
  const active = {
    borderColor: PRIMARY,
    backgroundColor: TINT,
    color: PRIMARY,
  };
  const inactive = {
    borderColor: "#EAEAEA",
    backgroundColor: "#ffffff",
    color: "#666",
  };
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/hearings?filter=all"
        className={base}
        style={current === "all" ? active : inactive}
      >
        All hearings
      </Link>
      <Link
        href="/hearings?filter=mine"
        className={base}
        style={current === "mine" ? active : inactive}
      >
        My hearings
      </Link>
    </div>
  );
}

export default async function HearingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireSession();
  const { filter: filterParam } = await searchParams;
  const filter: "all" | "mine" = filterParam === "mine" ? "mine" : "all";

  let hearings: UpcomingHearing[] = [];
  try {
    hearings = await getUpcomingHearings(filter);
  } catch {
    // DB unavailable
  }

  const { hero, thisWeek, upcoming } = bucketHearings(hearings);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Hearings"
        description="Unified prep view for upcoming SSA disability hearings."
        actions={<FilterLinks current={filter} />}
      />

      {/* Today + Tomorrow hero */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Clock01Icon} size={16} color={PRIMARY} />
          <h2 className="text-sm font-semibold text-foreground">
            Today &amp; Tomorrow
          </h2>
          <Badge variant="outline" className="ml-1 text-[10px]">
            {hero.length}
          </Badge>
        </div>
        {hero.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No hearings in the next 48 hours.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {hero.map((h) => (
              <HeroHearingCard key={h.id} hearing={h} />
            ))}
          </div>
        )}
      </section>

      {/* This Week */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Calendar03Icon} size={16} color={PRIMARY} />
          <h2 className="text-sm font-semibold text-foreground">This Week</h2>
          <Badge variant="outline" className="ml-1 text-[10px]">
            {thisWeek.length}
          </Badge>
        </div>
        <Card>
          <CardContent className="p-4">
            {thisWeek.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No hearings scheduled 2–7 days out.
              </p>
            ) : (
              <div>
                {thisWeek.map((h) => (
                  <WeekRow key={h.id} hearing={h} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Upcoming (8–30 days) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={UserGroupIcon} size={16} color={PRIMARY} />
          <h2 className="text-sm font-semibold text-foreground">Upcoming</h2>
          <Badge variant="outline" className="ml-1 text-[10px]">
            {upcoming.length}
          </Badge>
        </div>
        <UpcomingGrid hearings={upcoming} />
      </section>
    </div>
  );
}
