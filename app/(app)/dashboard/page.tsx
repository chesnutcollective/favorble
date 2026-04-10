import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getDashboardData } from "@/app/actions/dashboard-data";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Per-user dashboard — always dynamic.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireSession();

  const data = await getDashboardData();

  return <DashboardClient data={data} />;
}
