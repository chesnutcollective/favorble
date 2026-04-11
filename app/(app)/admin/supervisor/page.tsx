import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  AlertDiamondIcon,
  ArrowRight01Icon,
  BinocularsIcon,
  Edit01Icon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons";

import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COLORS } from "@/lib/design-tokens";
import {
  getWorkloadMatrix,
  getOpenSupervisorEventCount,
  getOpenCoachingFlagCount,
  getOpenComplianceFindingCount,
  getHighRiskCaseCount,
  getOpenDraftCount,
} from "@/app/actions/workload-matrix";
import { WorkloadMatrixClient } from "./workload-matrix-client";

export const metadata: Metadata = {
  title: "Supervisor",
};

export const dynamic = "force-dynamic";

const SUPERVISOR_ROLES = new Set(["admin", "reviewer"]);

export default async function SupervisorHubPage() {
  const session = await requireSession();
  if (!SUPERVISOR_ROLES.has(session.role)) {
    notFound();
  }

  const [
    matrix,
    openEvents,
    openFlags,
    openFindings,
    highRisk,
    openDrafts,
  ] = await Promise.all([
    getWorkloadMatrix(),
    getOpenSupervisorEventCount(),
    getOpenCoachingFlagCount(),
    getOpenComplianceFindingCount(),
    getHighRiskCaseCount(),
    getOpenDraftCount(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervisor"
        description="Team performance, workload, and case risk — at a glance."
      />

      {/* Summary section: counts across surveillance surfaces */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          icon={BinocularsIcon}
          label="Open Supervisor Events"
          value={openEvents}
          description="Triggered events across every case still in-flight."
          href="/cases"
          cta="View timeline"
        />
        <SummaryCard
          icon={UserGroup02Icon}
          label="Coaching Flags"
          value={openFlags}
          description="Active coaching flags raised against team members."
          href="/coaching"
          cta="Open coaching"
        />
        <SummaryCard
          icon={AlertCircleIcon}
          label="Compliance Findings"
          value={openFindings}
          description="Bar, ethics, documentation or HIPAA findings outstanding."
          href="/admin/compliance"
          cta="Review findings"
        />
        <SummaryCard
          icon={AlertDiamondIcon}
          label="High-Risk Cases"
          value={highRisk}
          description="Cases currently scored as high or critical risk."
          href="/reports/risk"
          cta="Open risk report"
        />
        <SummaryCard
          icon={Edit01Icon}
          label="Drafts awaiting review"
          value={openDrafts}
          description="AI-generated drafts pending reviewer sign-off."
          href="/admin/supervisor/drafts"
          cta="Open draft inbox"
        />
        <SummaryCard
          icon={BinocularsIcon}
          label="Workload Imbalance"
          value={null}
          description="Per-role z-score detector + one-click reassignment."
          href="/admin/supervisor/workload"
          cta="Check balance"
        />
      </div>

      {/* Section 1: Workload matrix (SM-1) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: COLORS.text2 }}
          >
            Workload Matrix
          </h2>
          <span
            className="text-[11px]"
            style={{ color: COLORS.text3 }}
          >
            {matrix.length} active {matrix.length === 1 ? "user" : "users"}
          </span>
        </div>
        <WorkloadMatrixClient rows={matrix} />
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  description,
  href,
  cta,
}: {
  icon: typeof BinocularsIcon;
  label: string;
  value: number | null;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[7px]"
            style={{
              backgroundColor: COLORS.brandSubtle,
              color: COLORS.brand,
            }}
          >
            <HugeiconsIcon icon={icon} size={18} color={COLORS.brand} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[12px] font-medium"
              style={{ color: COLORS.text2 }}
            >
              {label}
            </p>
            {value !== null && (
              <p
                className="text-[28px] font-semibold leading-none mt-1"
                style={{ color: COLORS.text1 }}
              >
                {value}
              </p>
            )}
          </div>
        </div>
        <p
          className="text-[12px] leading-5"
          style={{ color: COLORS.text2 }}
        >
          {description}
        </p>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={href}>
            {cta}
            <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
