import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getAllUsersPerformance } from "@/app/actions/leaderboards";

/**
 * GET /api/reports/team-performance/csv
 *
 * Returns a CSV download of team performance data. Accepts optional
 * `role` query param to filter by role.
 */
export async function GET(request: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const roleFilter = searchParams.get("role");

  let rows: Awaited<ReturnType<typeof getAllUsersPerformance>> = [];
  try {
    rows = await getAllUsersPerformance();
  } catch {
    return NextResponse.json(
      { error: "Failed to load performance data" },
      { status: 500 },
    );
  }

  if (roleFilter) {
    rows = rows.filter((r) => r.role === roleFilter);
  }

  // Build CSV
  const header = "Name,Email,Role,Team,Composite Score";
  const csvRows = rows.map((r) => {
    const name = `"${r.name.replace(/"/g, '""')}"`;
    const email = `"${r.email.replace(/"/g, '""')}"`;
    const role = `"${r.role.replace(/_/g, " ")}"`;
    const team = r.team ? `"${r.team.replace(/_/g, " ")}"` : '""';
    return `${name},${email},${role},${team},${r.compositeScore}`;
  });

  const csv = [header, ...csvRows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="team-performance-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
