import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  BalanceScaleIcon,
} from "@hugeicons/core-free-icons";

import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COLORS } from "@/lib/design-tokens";
import {
  detectImbalance,
  recommendReassignments,
  type ImbalanceReport,
  type ReassignmentSuggestion,
} from "@/lib/services/workload-imbalance";
import { ROLE_METRICS } from "@/lib/services/role-metrics";
import { ReassignmentList } from "./reassignment-list";

export const metadata: Metadata = {
  title: "Workload Imbalance",
};

export const dynamic = "force-dynamic";

const SUPERVISOR_ROLES = new Set(["admin", "reviewer"]);

// Roles that carry task-driven workload — exclude pure-admin and viewer
// from imbalance detection since those don't track open-task queues.
const ROLES_TO_CHECK = Object.keys(ROLE_METRICS).filter(
  (r) => r !== "admin" && r !== "reviewer",
);

export default async function WorkloadImbalancePage() {
  const session = await requireSession();
  if (!SUPERVISOR_ROLES.has(session.role)) {
    notFound();
  }

  const canReassign = session.role === "admin";

  const results: Array<{
    role: string;
    label: string;
    report: ImbalanceReport;
    suggestions: ReassignmentSuggestion[];
  }> = [];

  for (const role of ROLES_TO_CHECK) {
    const [report, suggestions] = await Promise.all([
      detectImbalance(session.organizationId, role),
      recommendReassignments(session.organizationId, role),
    ]);
    results.push({
      role,
      label: ROLE_METRICS[role]?.label ?? role,
      report,
      suggestions,
    });
  }

  const anyDetected = results.some(
    (r) => r.report.overloaded.length + r.report.underutilized.length > 0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workload Imbalance"
        description="Z-score detection of overloaded and underutilized staff with one-click reassignment suggestions."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/supervisor">
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} className="mr-1" />
              Supervisor hub
            </Link>
          </Button>
        }
      />

      {!canReassign && (
        <Card
          style={{
            borderColor: COLORS.brandMuted,
            backgroundColor: COLORS.brandSubtle,
          }}
        >
          <CardContent className="p-4 flex items-start gap-3">
            <HugeiconsIcon
              icon={BalanceScaleIcon}
              size={18}
              color={COLORS.brand}
            />
            <p
              className="text-[12px] leading-5"
              style={{ color: COLORS.text2 }}
            >
              You&apos;re viewing workload imbalance in read-only mode. Only
              admins can apply reassignment suggestions.
            </p>
          </CardContent>
        </Card>
      )}

      {!anyDetected && (
        <Card>
          <CardContent className="p-6 text-center">
            <p
              className="text-[13px]"
              style={{ color: COLORS.text2 }}
            >
              No significant workload imbalance detected across any role.
              Every team is within ±1.25 standard deviations of its mean
              open-task count.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {results.map((r) => (
          <RoleImbalanceSection key={r.role} result={r} canReassign={canReassign} />
        ))}
      </div>
    </div>
  );
}

function RoleImbalanceSection({
  result,
  canReassign,
}: {
  result: {
    role: string;
    label: string;
    report: ImbalanceReport;
    suggestions: ReassignmentSuggestion[];
  };
  canReassign: boolean;
}) {
  const { report, suggestions, label } = result;
  const total = report.overloaded.length + report.underutilized.length;
  if (report.sampleSize < 3) {
    return null;
  }
  if (total === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: COLORS.text2 }}
        >
          {label}
        </h2>
        <span
          className="text-[11px]"
          style={{ color: COLORS.text3 }}
        >
          {report.sampleSize} active · mean {report.mean} open tasks
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 mb-3">
        <OutlierCard
          title="Overloaded"
          accent={COLORS.bad}
          subtle={COLORS.badSubtle}
          users={report.overloaded}
          emptyText="No overloaded users"
        />
        <OutlierCard
          title="Underutilized"
          accent={COLORS.ok}
          subtle={COLORS.okSubtle}
          users={report.underutilized}
          emptyText="No underutilized users"
        />
      </div>

      {suggestions.length > 0 && (
        <ReassignmentList
          suggestions={suggestions}
          canReassign={canReassign}
        />
      )}
    </section>
  );
}

function OutlierCard({
  title,
  accent,
  subtle,
  users,
  emptyText,
}: {
  title: string;
  accent: string;
  subtle: string;
  users: Array<{ userId: string; name: string; load: number; zScore: number }>;
  emptyText: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{ backgroundColor: subtle, color: accent }}
          >
            {title}
          </div>
          <span
            className="text-[11px]"
            style={{ color: COLORS.text3 }}
          >
            {users.length} {users.length === 1 ? "user" : "users"}
          </span>
        </div>
        {users.length === 0 ? (
          <p
            className="text-[12px]"
            style={{ color: COLORS.text3 }}
          >
            {emptyText}
          </p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.userId}
                className="flex items-center justify-between gap-3 text-[12px]"
              >
                <span
                  className="font-medium truncate"
                  style={{ color: COLORS.text1 }}
                >
                  {u.name}
                </span>
                <span style={{ color: COLORS.text2 }}>
                  {u.load} open · z={u.zScore}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
