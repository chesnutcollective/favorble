"use client";

import { useState, useTransition } from "react";
import {
  createEreCredential,
  deleteEreCredential,
  updateEreCredentialLabel,
  testEreCredential,
} from "@/app/actions/ere";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ViewIcon,
  ViewOffIcon,
  PencilEdit01Icon,
  Delete01Icon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";

type Credential = {
  id: string;
  label: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
};

export function EreCredentialsClient({
  credentials,
}: {
  credentials: Credential[];
}) {
  const activeCredentials = credentials.filter((c) => c.isActive);
  const inactiveCredentials = credentials.filter((c) => !c.isActive);

  return (
    <div className="space-y-6">
      <PageHeader
        title="ERE Credentials"
        description="Manage your SSA Login.gov credentials for Electronic Records Express."
        actions={<AddCredentialDialog />}
      />

      {/* Security notice */}
      <Card className="border-l-[3px] border-l-blue-400 bg-gradient-to-r from-blue-50/40 to-transparent dark:from-blue-950/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100/60 dark:bg-blue-900/30">
              <HugeiconsIcon
                icon={ShieldKeyIcon}
                size={22}
                className="text-blue-600 dark:text-blue-400"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Your SSA credentials are encrypted at rest with AES-256-GCM. Only
              admin users can manage credentials.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Credentials list */}
      {activeCredentials.length === 0 && inactiveCredentials.length === 0 ? (
        <EmptyState
          icon={ShieldKeyIcon}
          title="No ERE credentials configured"
          description="Add your SSA Login.gov credentials to enable automatic case monitoring."
          accent="blue"
          bordered
          action={<AddCredentialDialog />}
          secondary={
            <div className="mt-2 flex flex-col items-center gap-3">
              <p className="text-xs font-medium text-muted-foreground">
                How to get your credentials:
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  1
                </span>
                <span>Log into login.gov</span>
                <span className="text-muted-foreground/40">&rarr;</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  2
                </span>
                <span>Add authenticator app</span>
                <span className="text-muted-foreground/40">&rarr;</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  3
                </span>
                <span>Copy TOTP secret</span>
                <span className="text-muted-foreground/40">&rarr;</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  4
                </span>
                <span>Paste here</span>
              </div>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4">
          {activeCredentials.map((cred) => (
            <CredentialCard key={cred.id} credential={cred} />
          ))}
          {inactiveCredentials.map((cred) => (
            <CredentialCard key={cred.id} credential={cred} />
          ))}
        </div>
      )}
    </div>
  );
}

function CredentialCard({ credential }: { credential: Credential }) {
  const [isPending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editLabel, setEditLabel] = useState(credential.label ?? "");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  function handleTest() {
    setTestResult(null);
    startTransition(async () => {
      try {
        const result = await testEreCredential(credential.id);
        setTestResult(result);
      } catch {
        setTestResult({
          success: false,
          message: "Failed to test connection.",
        });
      }
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      try {
        await deleteEreCredential(credential.id);
      } catch {
        // Error handled silently
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteEreCredential(credential.id);
        setDeleteConfirm(false);
      } catch {
        // Error handled silently
      }
    });
  }

  function handleEditLabel(e: React.FormEvent) {
    e.preventDefault();
    if (!editLabel.trim()) return;
    startTransition(async () => {
      try {
        await updateEreCredentialLabel({
          credentialId: credential.id,
          label: editLabel.trim(),
        });
        setEditOpen(false);
      } catch {
        // Error handled silently
      }
    });
  }

  const status = credential.lastErrorMessage
    ? "error"
    : credential.isActive
      ? "active"
      : "inactive";

  const statusBadge = {
    active: (
      <Badge variant="outline" className="border-green-300 text-green-700">
        Active
      </Badge>
    ),
    inactive: (
      <Badge variant="outline" className="border-border text-muted-foreground">
        Inactive
      </Badge>
    ),
    error: (
      <Badge variant="outline" className="border-red-300 text-red-700">
        Error
      </Badge>
    ),
  };

  return (
    <Card className={!credential.isActive ? "opacity-60" : ""}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-foreground">
              {credential.label || "Untitled Credential"}
            </h3>
            <div className="mt-1 flex items-center gap-3">
              {statusBadge[status]}
              {credential.lastUsedAt && (
                <p className="text-xs text-muted-foreground">
                  Last used:{" "}
                  {new Date(credential.lastUsedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Added {new Date(credential.createdAt).toLocaleDateString()}
          </p>
        </div>

        {credential.lastErrorMessage && (
          <p className="mt-3 text-sm text-red-600">
            {credential.lastErrorMessage}
          </p>
        )}

        {testResult && (
          <p
            className={`mt-3 text-sm ${testResult.success ? "text-green-700" : "text-red-600"}`}
          >
            {testResult.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={isPending || !credential.isActive}
          >
            <HugeiconsIcon icon={Wifi01Icon} size={14} className="mr-1" />
            {isPending ? "Testing..." : "Test Connection"}
          </Button>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  size={14}
                  className="mr-1"
                />
                Edit Label
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleEditLabel}>
                <DialogHeader>
                  <DialogTitle>Edit Label</DialogTitle>
                  <DialogDescription>
                    Update the display name for this credential.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cred-label">Label</Label>
                    <Input
                      id="edit-cred-label"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending || !editLabel.trim()}
                  >
                    {isPending ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {credential.isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeactivate}
              disabled={isPending}
            >
              Deactivate
            </Button>
          )}

          <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                disabled={isPending}
              >
                <HugeiconsIcon icon={Delete01Icon} size={14} className="mr-1" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Credential</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete &quot;
                  {credential.label || "this credential"}&quot;? This action
                  cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  {isPending ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

function AddCredentialDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showTotp, setShowTotp] = useState(false);

  function resetForm() {
    setLabel("");
    setEmail("");
    setPassword("");
    setTotpSecret("");
    setShowPassword(false);
    setShowTotp(false);
    setError(null);
  }

  function handleSubmit(verify: boolean) {
    if (!label.trim() || !email.trim() || !password.trim()) return;

    setError(null);
    startTransition(async () => {
      try {
        const credential = await createEreCredential({
          label: label.trim(),
          username: email.trim(),
          password: password.trim(),
          totpSecret: totpSecret.trim() || undefined,
        });

        if (verify) {
          try {
            await testEreCredential(credential.id);
          } catch {
            // Verification failed but credential was saved
          }
        }

        resetForm();
        setOpen(false);
      } catch {
        setError("Failed to save credentials. Please try again.");
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
          Add Credentials
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add ERE Credentials</DialogTitle>
          <DialogDescription>
            Enter your SSA Login.gov credentials. They will be encrypted before
            storage.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cred-label">Label</Label>
            <Input
              id="cred-label"
              placeholder="Main SSA Login"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cred-email">Login.gov Email</Label>
            <Input
              id="cred-email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cred-password">Login.gov Password</Label>
            <div className="relative">
              <Input
                id="cred-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
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
            <Label htmlFor="cred-totp">TOTP Secret (optional)</Label>
            <div className="relative">
              <Input
                id="cred-totp"
                type={showTotp ? "text" : "password"}
                placeholder="Enter TOTP secret key"
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
            <p className="text-xs text-muted-foreground">
              To get your TOTP secret: Log into login.gov/account &rarr;
              Authentication methods &rarr; Add authenticator app &rarr; Copy
              the text secret key
            </p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={
              isPending || !label.trim() || !email.trim() || !password.trim()
            }
          >
            {isPending ? "Saving..." : "Save Without Verifying"}
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={
              isPending || !label.trim() || !email.trim() || !password.trim()
            }
          >
            {isPending ? "Saving..." : "Save & Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
