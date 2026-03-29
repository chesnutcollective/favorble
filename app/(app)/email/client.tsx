"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  associateEmailWithCase,
  fetchAndMatchEmails,
} from "@/app/actions/emails";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Email = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  createdAt: string;
  caseId: string | null;
  caseNumber: string | null;
};

type CaseOption = {
  id: string;
  caseNumber: string;
};

type EmailQueueClientProps = {
  emails: Email[];
  cases: CaseOption[];
};

export function EmailQueueClient({ emails, cases }: EmailQueueClientProps) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [caseSearch, setCaseSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSyncing, startSyncTransition] = useTransition();

  const filteredCases = cases.filter((c) =>
    c.caseNumber.toLowerCase().includes(caseSearch.toLowerCase()),
  );

  function handleAssociateClick(emailId: string) {
    setSelectedEmailId(emailId);
    setCaseSearch("");
    setPickerOpen(true);
  }

  function handlePickCase(caseId: string) {
    if (!selectedEmailId) return;

    startTransition(async () => {
      try {
        await associateEmailWithCase(selectedEmailId, caseId);
        setPickerOpen(false);
        setSelectedEmailId(null);
        router.refresh();
      } catch {
        // Error handled server-side
      }
    });
  }

  function handleSyncEmails() {
    startSyncTransition(async () => {
      try {
        await fetchAndMatchEmails();
        router.refresh();
      } catch {
        // Error handled server-side
      }
    });
  }

  const unmatchedEmails = emails.filter((e) => !e.caseId);
  const matchedEmails = emails.filter((e) => e.caseId);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {unmatchedEmails.length} unmatched, {matchedEmails.length} matched
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncEmails}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing..." : "Sync Emails"}
        </Button>
      </div>

      {unmatchedEmails.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">
            Unmatched Emails
          </h2>
          {unmatchedEmails.map((email) => (
            <EmailRow
              key={email.id}
              email={email}
              onAssociate={() => handleAssociateClick(email.id)}
            />
          ))}
        </div>
      )}

      {matchedEmails.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">
            Matched Emails
          </h2>
          {matchedEmails.map((email) => (
            <EmailRow key={email.id} email={email} />
          ))}
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Associate with Case</DialogTitle>
            <DialogDescription>
              Choose a case to associate this email with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search cases..."
              value={caseSearch}
              onChange={(e) => setCaseSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredCases.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No cases found
                </p>
              ) : (
                filteredCases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                    onClick={() => handlePickCase(c.id)}
                    disabled={isPending}
                  >
                    <span className="font-medium">Case #{c.caseNumber}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmailRow({
  email,
  onAssociate,
}: {
  email: Email;
  onAssociate?: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  email.type === "email_inbound"
                    ? "border-green-300 text-green-700"
                    : "border-blue-300 text-blue-700"
                }
              >
                {email.type === "email_inbound" ? "Inbound" : "Outbound"}
              </Badge>
              {email.caseId && email.caseNumber && (
                <Link
                  href={`/cases/${email.caseId}/activity`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Case #{email.caseNumber}
                </Link>
              )}
              {!email.caseId && onAssociate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAssociate}
                  className="text-xs"
                >
                  Associate
                </Button>
              )}
            </div>
            {email.subject && (
              <p className="mt-1 text-sm font-medium text-foreground">
                {email.subject}
              </p>
            )}
            {email.body && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                {email.body}
              </p>
            )}
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              {email.fromAddress && <span>From: {email.fromAddress}</span>}
              {email.toAddress && <span>To: {email.toAddress}</span>}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(email.createdAt).toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
