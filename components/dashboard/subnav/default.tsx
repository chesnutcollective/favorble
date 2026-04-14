"use client";

import Link from "next/link";
import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavStatRow,
} from "./_primitives";
import type { DefaultSubnavData } from "@/lib/dashboard-subnav/types";

/**
 * Generic dashboard sub-nav fallback. Used by personas that don't yet have
 * a custom sub-nav component. Mirrors the prior hardcoded layout but pulls
 * real numbers from `getDashboardSubnavData()`.
 */
export function DefaultSubnav({ data }: { data: DefaultSubnavData }) {
  return (
    <SubnavShell title="Dashboard">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <div className="ttn-quick-actions">
        <Link href="/cases?action=new" className="ttn-quick-action-btn">
          <span>New Case</span>
        </Link>
        <Link href="/leads?action=new" className="ttn-quick-action-btn">
          <span>New Lead</span>
        </Link>
        <Link href="/documents" className="ttn-quick-action-btn">
          <span>Documents</span>
        </Link>
        <Link href="/calendar" className="ttn-quick-action-btn">
          <span>Schedule</span>
        </Link>
      </div>

      <SubnavSectionLabel>Today&apos;s Numbers</SubnavSectionLabel>
      <SubnavStatRow label="Active cases" value={data.casesCount} href="/cases" />
      <SubnavStatRow label="Tasks today" value={data.todayTaskCount} href="/queue?tab=today" />
      <SubnavStatRow label="Hearings (7d)" value={data.hearingsThisWeek} href="/hearings" />
    </SubnavShell>
  );
}
