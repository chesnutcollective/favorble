import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getCasePicker, getTimeEntries } from "@/app/actions/billing";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { NewTimeEntryDialog } from "@/components/billing/new-time-entry-dialog";

export const metadata: Metadata = { title: "Time Entries" };
export const dynamic = "force-dynamic";

export default async function TimePage() {
  await requireSession();

  const [entries, cases] = await Promise.all([
    getTimeEntries().catch(() => []),
    getCasePicker().catch(() => []),
  ]);
  const totalMinutes = entries.reduce(
    (sum, e) => sum + (e.durationMinutes ?? 0),
    0,
  );
  const billableMinutes = entries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Entries"
        description="Track billable and non-billable hours across cases."
        actions={<NewTimeEntryDialog cases={cases} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Total Hours"
          value={`${(totalMinutes / 60).toFixed(1)}h`}
          subtitle={`${entries.length} entries`}
        />
        <StatsCard
          title="Billable Hours"
          value={`${(billableMinutes / 60).toFixed(1)}h`}
          subtitle="Across loaded entries"
        />
        <StatsCard
          title="Non-billable"
          value={`${((totalMinutes - billableMinutes) / 60).toFixed(1)}h`}
          subtitle="Internal work"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState
              icon={Clock01Icon}
              title="No time entries yet"
              description="Log your first time entry using the New Time Entry button above."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Billable</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">
                      {t.entryDate.toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.userFirstName} {t.userLastName}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.caseNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                      {t.description}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {(t.durationMinutes / 60).toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {t.hourlyRate ? `$${t.hourlyRate}` : "—"}
                    </TableCell>
                    <TableCell>
                      {t.billable ? (
                        <Badge variant="outline">Billable</Badge>
                      ) : (
                        <span className="text-xs text-[#666]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.billedAt ? "default" : "secondary"}>
                        {t.billedAt ? "Billed" : "Unbilled"}
                      </Badge>
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
