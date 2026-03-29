"use client";

import { useState, useTransition } from "react";
import {
  inviteUser,
  updateUserRoleTeam,
  toggleUserActive,
} from "@/app/actions/users";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserGroupIcon,
  PlusSignIcon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";

type UserRole =
  | "admin"
  | "attorney"
  | "case_manager"
  | "filing_agent"
  | "intake_agent"
  | "mail_clerk"
  | "medical_records"
  | "viewer";

type Team =
  | "intake"
  | "filing"
  | "medical_records"
  | "mail_sorting"
  | "case_management"
  | "hearings"
  | "administration";

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  team: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "attorney", label: "Attorney" },
  { value: "case_manager", label: "Case Manager" },
  { value: "filing_agent", label: "Filing Agent" },
  { value: "intake_agent", label: "Intake Agent" },
  { value: "mail_clerk", label: "Mail Clerk" },
  { value: "medical_records", label: "Medical Records" },
  { value: "viewer", label: "Viewer" },
] as const;

const TEAM_OPTIONS = [
  { value: "intake", label: "Intake" },
  { value: "filing", label: "Filing" },
  { value: "medical_records", label: "Medical Records" },
  { value: "mail_sorting", label: "Mail Sorting" },
  { value: "case_management", label: "Case Mgmt" },
  { value: "hearings", label: "Hearings" },
  { value: "administration", label: "Admin" },
] as const;

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label]),
);

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  attorney: "default",
  case_manager: "secondary",
  filing_agent: "secondary",
  intake_agent: "secondary",
  mail_clerk: "outline",
  medical_records: "secondary",
  viewer: "outline",
};

const TEAM_LABELS: Record<string, string> = Object.fromEntries(
  TEAM_OPTIONS.map((t) => [t.value, t.label]),
);

// No team sentinel
const NO_TEAM = "__none__";

export function UsersClient({ users: userRows }: { users: UserRow[] }) {
  const activeUsers = userRows.filter((u) => u.isActive);
  const inactiveUsers = userRows.filter((u) => !u.isActive);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Teams"
        description="Manage user accounts, roles, and team assignments."
        actions={<InviteUserDialog />}
      />

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{userRows.length} total users</span>
        <span>{activeUsers.length} active</span>
        {inactiveUsers.length > 0 && (
          <span>{inactiveUsers.length} inactive</span>
        )}
      </div>

      {userRows.length === 0 ? (
        <EmptyState
          icon={UserGroupIcon}
          title="No users found"
          description="No user accounts have been created for this organization."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRows.map((user) => (
                  <UserTableRow key={user.id} user={user} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UserTableRow({ user }: { user: UserRow }) {
  const [isPending, startTransition] = useTransition();

  function handleToggleActive(checked: boolean) {
    startTransition(async () => {
      try {
        await toggleUserActive({ userId: user.id, isActive: checked });
      } catch {
        // Error handled silently
      }
    });
  }

  return (
    <TableRow className={!user.isActive ? "opacity-60" : ""}>
      <TableCell className="font-medium">
        {user.firstName} {user.lastName}
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Badge variant={ROLE_VARIANTS[user.role] ?? "outline"}>
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {user.team ? (TEAM_LABELS[user.team] ?? user.team) : "---"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={user.isActive}
            onCheckedChange={handleToggleActive}
            disabled={isPending}
            aria-label={`${user.isActive ? "Deactivate" : "Activate"} ${user.firstName} ${user.lastName}`}
          />
          <span className="text-xs text-muted-foreground">
            {user.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <EditUserDialog user={user} />
      </TableCell>
    </TableRow>
  );
}

function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("viewer");
  const [team, setTeam] = useState("");

  function resetForm() {
    setEmail("");
    setFirstName("");
    setLastName("");
    setRole("viewer");
    setTeam("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !firstName.trim() || !lastName.trim()) return;

    setError(null);
    startTransition(async () => {
      try {
        await inviteUser({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: role as UserRole,
          team: team && team !== NO_TEAM ? (team as Team) : undefined,
        });
        resetForm();
        setOpen(false);
      } catch {
        setError("Failed to invite user. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Add a new user to your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invite-first-name">First Name</Label>
                <Input
                  id="invite-first-name"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last-name">Last Name</Label>
                <Input
                  id="invite-last-name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={setRole} disabled={isPending}>
                <SelectTrigger id="invite-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-team">Team</Label>
              <Select value={team} onValueChange={setTeam} disabled={isPending}>
                <SelectTrigger id="invite-team">
                  <SelectValue placeholder="Select a team (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEAM}>No team</SelectItem>
                  {TEAM_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                !email.trim() ||
                !firstName.trim() ||
                !lastName.trim()
              }
            >
              {isPending ? "Inviting..." : "Invite User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState(user.role);
  const [team, setTeam] = useState(user.team ?? NO_TEAM);

  function resetForm() {
    setRole(user.role);
    setTeam(user.team ?? NO_TEAM);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError(null);
    startTransition(async () => {
      try {
        await updateUserRoleTeam({
          userId: user.id,
          role: role as UserRole,
          team: team && team !== NO_TEAM ? (team as Team) : null,
        });
        setOpen(false);
      } catch {
        setError("Failed to update user. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <HugeiconsIcon icon={PencilEdit01Icon} size={16} />
          <span className="sr-only">
            Edit {user.firstName} {user.lastName}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update role and team for {user.firstName} {user.lastName}.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={role} onValueChange={setRole} disabled={isPending}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-team">Team</Label>
              <Select value={team} onValueChange={setTeam} disabled={isPending}>
                <SelectTrigger id="edit-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEAM}>No team</SelectItem>
                  {TEAM_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
