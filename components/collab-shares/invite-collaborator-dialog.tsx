"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCollaboratorShare } from "@/app/actions/collab-shares";

type DocOption = {
  id: string;
  fileName: string;
  category: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  availableDocuments: DocOption[];
  onCreated?: () => void;
};

export function InviteCollaboratorDialog({
  open,
  onOpenChange,
  caseId,
  availableDocuments,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("medical_provider");
  const [subject, setSubject] = useState("Case information request");
  const [message, setMessage] = useState("");
  const [expiryDays, setExpiryDays] = useState(30);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setRole("medical_provider");
    setSubject("Case information request");
    setMessage("");
    setExpiryDays(30);
    setSelectedDocs(new Set());
    setError(null);
    setShareUrl(null);
  }

  function handleClose(next: boolean) {
    if (!next && !pending) reset();
    onOpenChange(next);
  }

  function toggleDoc(id: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError("Recipient email is required.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    const days = Math.max(1, Math.min(180, Math.floor(expiryDays || 30)));
    startTransition(async () => {
      try {
        const result = await createCollaboratorShare({
          caseId,
          subject: subject.trim(),
          message: message.trim() || undefined,
          expiryDays: days,
          recipients: [
            {
              email: email.trim(),
              name: name.trim() || undefined,
              role,
            },
          ],
          documentIds: Array.from(selectedDocs),
        });
        setShareUrl(result.url);
        onCreated?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create share",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite external collaborator</DialogTitle>
          <DialogDescription>
            Send a scoped magic link so a third party (physician, family
            member, or prior counsel) can view selected documents and message
            the firm without a full account.
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Share created. Copy this link and send it to the recipient:
            </p>
            <Input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              This link is only shown once. If you lose it, create a new share.
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={() => handleClose(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ic-name">Recipient name</Label>
                <Input
                  id="ic-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Jane Doe"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ic-email">Recipient email</Label>
                <Input
                  id="ic-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane.doe@hospital.org"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ic-role">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="ic-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medical_provider">
                      Medical provider
                    </SelectItem>
                    <SelectItem value="family">Family member</SelectItem>
                    <SelectItem value="legal_counsel">
                      Prior / co-counsel
                    </SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ic-expiry">Expires in (days)</Label>
                <Input
                  id="ic-expiry"
                  type="number"
                  min={1}
                  max={180}
                  value={expiryDays}
                  onChange={(e) =>
                    setExpiryDays(Number.parseInt(e.target.value, 10) || 30)
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ic-subject">Subject</Label>
              <Input
                id="ic-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ic-message">Personal message (optional)</Label>
              <Textarea
                id="ic-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Add context so the recipient knows why they're receiving this."
              />
            </div>

            <div className="space-y-2">
              <Label>Documents to share</Label>
              {availableDocuments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No documents on this case yet. Collaborator will still be
                  able to message the firm.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-md border border-[#EAEAEA] p-2">
                  {availableDocuments.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        checked={selectedDocs.has(d.id)}
                        onCheckedChange={() => toggleDoc(d.id)}
                      />
                      <span className="flex-1 truncate">{d.fileName}</span>
                      {d.category && (
                        <span className="text-xs text-muted-foreground">
                          {d.category}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => handleClose(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={pending}>
                {pending ? "Creating..." : "Create share"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
