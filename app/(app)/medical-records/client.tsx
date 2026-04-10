"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  ShieldKeyIcon,
  Medicine02Icon,
  StethoscopeIcon,
  UserGroupIcon,
  Calendar03Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import {
  addProviderCredential,
  type MrQueueRow,
  type ProviderCredentialGroup,
  type RfcTrackerRow,
  type TeamWorkloadRow,
} from "@/app/actions/medical-records";

// ── Design tokens ─────────────────────────────────────────────────
const BRAND = "#263c94";
const STATUS_ACTIVE = "#1d72b8";
const SUBTLE_BG = "rgba(38,60,148,0.08)";

const TEAM_COLORS: Record<
  string,
  { label: string; hex: string; soft: string }
> = {
  blue: { label: "Blue", hex: "#3b82f6", soft: "rgba(59,130,246,0.12)" },
  orange: { label: "Orange", hex: "#f97316", soft: "rgba(249,115,22,0.12)" },
  green: { label: "Green", hex: "#16a34a", soft: "rgba(22,163,74,0.12)" },
  yellow: { label: "Yellow", hex: "#eab308", soft: "rgba(234,179,8,0.15)" },
  purple: { label: "Purple", hex: "#a855f7", soft: "rgba(168,85,247,0.12)" },
};

const MR_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  requesting: "Requesting",
  partial: "Partial",
  in_review: "In review",
  complete: "Complete",
};

const RFC_STATUS_LABELS: Record<string, string> = {
  not_requested: "Not requested",
  requested: "Requested",
  received: "Received",
  completed: "Completed",
};

// ── Component ─────────────────────────────────────────────────────
type Props = {
  queue: MrQueueRow[];
  credentialGroups: ProviderCredentialGroup[];
  rfcRows: RfcTrackerRow[];
  workload: TeamWorkloadRow[];
};

export function MedicalRecordsClient({
  queue,
  credentialGroups,
  rfcRows,
  workload,
}: Props) {
  return (
    <div className="space-y-6" style={{ fontFamily: "var(--font-dm-sans)" }}>
      <PageHeader
        title="Medical Records"
        description="Manage MR collection, provider portal credentials, RFC tracking, and color-team workload."
      />

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="queue">MR Queue</TabsTrigger>
          <TabsTrigger value="credentials">Provider Credentials</TabsTrigger>
          <TabsTrigger value="rfc">RFC Tracker</TabsTrigger>
          <TabsTrigger value="workload">Team Workload</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          <MrQueueTab rows={queue} />
        </TabsContent>

        <TabsContent value="credentials" className="mt-6">
          <CredentialsTab groups={credentialGroups} />
        </TabsContent>

        <TabsContent value="rfc" className="mt-6">
          <RfcTab rows={rfcRows} />
        </TabsContent>

        <TabsContent value="workload" className="mt-6">
          <WorkloadTab workload={workload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── MR Queue ──────────────────────────────────────────────────────
function MrQueueTab({ rows }: { rows: MrQueueRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Medicine02Icon}
        title="No upcoming MR collection"
        description="There are no active cases with hearings in the next 60 days requiring medical records collection."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between rounded-[10px] px-4 py-3"
        style={{ backgroundColor: SUBTLE_BG }}
      >
        <div className="flex items-center gap-2 text-[13px]">
          <HugeiconsIcon
            icon={Calendar03Icon}
            size={16}
            style={{ color: BRAND }}
          />
          <span className="font-medium" style={{ color: BRAND }}>
            {rows.length} cases queued
          </span>
          <span className="text-muted-foreground">
            sorted by hearing date
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {rows.map((row) => (
          <MrQueueCard key={row.caseId} row={row} />
        ))}
      </div>
    </div>
  );
}

function MrQueueCard({ row }: { row: MrQueueRow }) {
  const daysUntil = row.daysUntil;
  const countdownColor =
    daysUntil == null
      ? "#666"
      : daysUntil < 7
        ? "#EE0000"
        : daysUntil < 30
          ? "#f59e0b"
          : STATUS_ACTIVE;

  const team = row.assignedTeamColor
    ? TEAM_COLORS[row.assignedTeamColor]
    : null;

  const hearing = row.hearingDate ? new Date(row.hearingDate) : null;
  const mrStatusLabel =
    MR_STATUS_LABELS[row.mrStatus] ?? row.mrStatus.replace(/_/g, " ");

  return (
    <Card className="rounded-[10px]">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/cases/${row.caseId}`}
                className="truncate text-[15px] font-semibold hover:underline"
                style={{ color: BRAND }}
              >
                {row.claimant}
              </Link>
              <Badge
                variant="outline"
                className="border-border text-[11px] font-normal"
              >
                {row.caseNumber}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <Badge
                variant="outline"
                className="border-border capitalize"
                style={{ color: STATUS_ACTIVE, borderColor: STATUS_ACTIVE }}
              >
                {mrStatusLabel}
              </Badge>
              {team && (
                <Badge
                  variant="outline"
                  className="border-transparent"
                  style={{ backgroundColor: team.soft, color: team.hex }}
                >
                  {team.label} team
                </Badge>
              )}
              {row.mrSpecialistName && (
                <span>Assigned to {row.mrSpecialistName}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div>
              <div
                className="text-[12px] font-medium uppercase tracking-wide"
                style={{ color: "#666" }}
              >
                Hearing
              </div>
              <div className="text-[13px] font-medium">
                {hearing ? hearing.toLocaleDateString() : "—"}
              </div>
            </div>
            <div className="min-w-[70px]">
              <div
                className="text-[12px] font-medium uppercase tracking-wide"
                style={{ color: "#666" }}
              >
                In
              </div>
              <div
                className="text-[18px] font-semibold tabular-nums"
                style={{ color: countdownColor }}
              >
                {daysUntil != null ? `${daysUntil}d` : "—"}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Provider Credentials ──────────────────────────────────────────
function CredentialsTab({ groups }: { groups: ProviderCredentialGroup[] }) {
  return (
    <div className="space-y-4">
      <Card
        className="rounded-[10px]"
        style={{ backgroundColor: SUBTLE_BG, borderColor: "transparent" }}
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <HugeiconsIcon
              icon={ShieldKeyIcon}
              size={20}
              style={{ color: BRAND }}
              className="mt-0.5 shrink-0"
            />
            <div>
              <p className="text-[13px] font-medium" style={{ color: BRAND }}>
                Encrypted credential vault
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Credentials replace the legacy plaintext HRG Tracker. All
                usernames, passwords, and TOTP secrets are encrypted at rest
                with AES-256-GCM.
              </p>
            </div>
          </div>
          <AddCredentialDialog />
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          icon={ShieldKeyIcon}
          title="No provider credentials"
          description="Add your first provider portal credential to start securing patient access."
          action={<AddCredentialDialog />}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.providerName}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[14px] font-semibold">
                  {group.providerName}
                </h3>
                <Badge variant="secondary" className="text-[11px]">
                  {group.credentials.length}
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.credentials.map((cred) => (
                  <Card key={cred.id} className="rounded-[10px]">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium">
                            {cred.label ?? "Untitled"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge
                              variant="outline"
                              className="border-border"
                              style={{
                                color: cred.isActive ? STATUS_ACTIVE : "#666",
                                borderColor: cred.isActive
                                  ? STATUS_ACTIVE
                                  : undefined,
                              }}
                            >
                              {cred.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {cred.hasTotp && (
                              <Badge
                                variant="outline"
                                className="border-border"
                              >
                                TOTP
                              </Badge>
                            )}
                            {cred.lastUsedAt && (
                              <span>
                                Last used{" "}
                                {new Date(
                                  cred.lastUsedAt,
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <HugeiconsIcon
                          icon={ShieldKeyIcon}
                          size={16}
                          style={{ color: BRAND }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddCredentialDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showTotp, setShowTotp] = useState(false);

  const [provider, setProvider] = useState("");
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");

  function reset() {
    setProvider("");
    setLabel("");
    setUsername("");
    setPassword("");
    setTotpSecret("");
    setError(null);
    setShowPassword(false);
    setShowTotp(false);
  }

  function handleSubmit() {
    if (!provider.trim() || !username.trim() || !password.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await addProviderCredential({
          provider: provider.trim(),
          label: label.trim(),
          username: username.trim(),
          password: password.trim(),
          totpSecret: totpSecret.trim() || undefined,
        });
        reset();
        setOpen(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save credential.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          style={{ backgroundColor: BRAND, color: "#fff" }}
          className="hover:opacity-90"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
          Add Credential
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Provider Credential</DialogTitle>
          <DialogDescription>
            Credentials are encrypted with AES-256-GCM before storage.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mr-provider">Provider Name</Label>
            <Input
              id="mr-provider"
              placeholder="e.g. Kaiser Permanente"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mr-label">Label (optional)</Label>
            <Input
              id="mr-label"
              placeholder="e.g. Main office portal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mr-username">Username</Label>
            <Input
              id="mr-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mr-password">Password</Label>
            <div className="relative">
              <Input
                id="mr-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={showPassword ? ViewOffIcon : ViewIcon}
                  size={16}
                />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mr-totp">TOTP Secret (optional)</Label>
            <div className="relative">
              <Input
                id="mr-totp"
                type={showTotp ? "text" : "password"}
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                disabled={isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowTotp(!showTotp)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={showTotp ? ViewOffIcon : ViewIcon}
                  size={16}
                />
              </button>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isPending ||
              !provider.trim() ||
              !username.trim() ||
              !password.trim()
            }
            style={{ backgroundColor: BRAND, color: "#fff" }}
            className="hover:opacity-90"
          >
            {isPending ? "Saving..." : "Save Credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── RFC Tracker ───────────────────────────────────────────────────
function RfcTab({ rows }: { rows: RfcTrackerRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={StethoscopeIcon}
        title="No RFC requests"
        description="Request for Functional Capacity forms will appear here once created."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <RfcCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function RfcCard({ row }: { row: RfcTrackerRow }) {
  const statusLabel = RFC_STATUS_LABELS[row.rfcStatus] ?? row.rfcStatus;
  const statusColor =
    row.rfcStatus === "completed"
      ? STATUS_ACTIVE
      : row.rfcStatus === "received"
        ? BRAND
        : row.rfcStatus === "requested"
          ? "#f59e0b"
          : "#666";

  const due = row.rfcDueDate ? new Date(row.rfcDueDate) : null;
  const now = new Date();
  const daysUntilDue = due
    ? Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card className="rounded-[10px]">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/cases/${row.caseId}`}
                className="truncate text-[15px] font-semibold hover:underline"
                style={{ color: BRAND }}
              >
                {row.claimant}
              </Link>
              <Badge variant="outline" className="border-border text-[11px]">
                {row.caseNumber}
              </Badge>
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {row.rfcProvider ?? "No provider assigned"}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge
              variant="outline"
              style={{ color: statusColor, borderColor: statusColor }}
            >
              {statusLabel}
            </Badge>
            <div className="text-right">
              <div
                className="text-[11px] uppercase tracking-wide"
                style={{ color: "#666" }}
              >
                Due
              </div>
              <div className="text-[13px] font-medium">
                {due ? due.toLocaleDateString() : "—"}
              </div>
              {daysUntilDue != null && daysUntilDue >= 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {daysUntilDue}d left
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Team Workload ─────────────────────────────────────────────────
function WorkloadTab({ workload }: { workload: TeamWorkloadRow[] }) {
  const totals = useMemo(
    () => ({
      cases: workload.reduce((acc, w) => acc + w.totalCases, 0),
      urgent: workload.reduce((acc, w) => acc + w.urgent, 0),
      complete: workload.reduce((acc, w) => acc + w.complete, 0),
    }),
    [workload],
  );

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-6 rounded-[10px] px-4 py-3"
        style={{ backgroundColor: SUBTLE_BG }}
      >
        <div className="flex items-center gap-2 text-[13px]">
          <HugeiconsIcon
            icon={UserGroupIcon}
            size={16}
            style={{ color: BRAND }}
          />
          <span className="font-medium" style={{ color: BRAND }}>
            {totals.cases} total
          </span>
        </div>
        <div className="text-[13px] text-muted-foreground">
          <span className="font-medium text-[#EE0000]">{totals.urgent}</span>{" "}
          urgent
        </div>
        <div className="text-[13px] text-muted-foreground">
          <span className="font-medium" style={{ color: STATUS_ACTIVE }}>
            {totals.complete}
          </span>{" "}
          complete
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {workload.map((team) => (
          <TeamCard key={team.color} team={team} />
        ))}
      </div>
    </div>
  );
}

function TeamCard({ team }: { team: TeamWorkloadRow }) {
  const meta = TEAM_COLORS[team.color] ?? {
    label: team.color,
    hex: "#666",
    soft: "rgba(0,0,0,0.05)",
  };

  return (
    <Card
      className="rounded-[10px] border-l-4"
      style={{ borderLeftColor: meta.hex }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: meta.soft, color: meta.hex }}
          >
            {meta.label}
          </div>
          <span
            className="text-[11px] font-medium"
            style={{ color: "#666" }}
          >
            Team
          </span>
        </div>
        <div className="mt-3 text-[28px] font-semibold leading-none tabular-nums">
          {team.totalCases}
        </div>
        <div className="mt-1 text-[12px] text-muted-foreground">
          active cases
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px]">
          <div>
            <div className="font-medium text-[#EE0000]">{team.urgent}</div>
            <div className="text-[11px] text-muted-foreground">urgent</div>
          </div>
          <div className="text-right">
            <div className="font-medium" style={{ color: STATUS_ACTIVE }}>
              {team.complete}
            </div>
            <div className="text-[11px] text-muted-foreground">done</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
