import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getExecDashboardData } from "@/app/actions/exec-dashboard";
import { ExecDashboardClient } from "./client";

export const metadata: Metadata = {
  title: "Executive Dashboard",
};

export default async function ExecDashboardPage() {
  await requireSession();

  const data = await getExecDashboardData();

  return <ExecDashboardClient data={data} />;
}
