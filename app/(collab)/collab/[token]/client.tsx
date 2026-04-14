"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  declineCollabSharePublic,
  postCollabMessagePublic,
} from "@/app/actions/collab-shares";

type ShareInfo = {
  id: string;
  subject: string;
  message: string | null;
  expiresAt: string;
  organizationId: string;
};

type CaseInfo = {
  id: string;
  caseNumber: string;
  claimantFirstName: string | null;
  claimantLastInitial: string | null;
  stageName: string | null;
  stageClientVisibleName: string | null;
  referringAttorneyName: string | null;
  referringAttorneyEmail: string | null;
  referringAttorneyPhone: string | null;
};

type DocItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  createdAt: string;
};

type MessageItem = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  body: string;
  createdAt: string;
  fromFirm: boolean;
};

type Props = {
  token: string;
  share: ShareInfo;
  caseInfo: CaseInfo;
  documents: DocItem[];
  messages: MessageItem[];
};

export function CollabShareClient({
  token,
  share,
  caseInfo,
  documents,
  messages: initialMessages,
}: Props) {
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const [pending, startTransition] = useTransition();

  const claimantDisplay = useMemo(() => {
    if (!caseInfo.claimantFirstName) return "Claimant";
    return `${caseInfo.claimantFirstName} ${
      caseInfo.claimantLastInitial ?? ""
    }.`.trim();
  }, [caseInfo.claimantFirstName, caseInfo.claimantLastInitial]);

  const handleSend = () => {
    setError(null);
    setSuccess(null);
    if (!email.trim() || !body.trim()) {
      setError("Email and message are required.");
      return;
    }
    startTransition(async () => {
      try {
        await postCollabMessagePublic({
          token,
          fromEmail: email,
          fromName: name || null,
          body,
        });
        const optimistic: MessageItem = {
          id: `tmp-${Date.now()}`,
          fromEmail: email.trim().toLowerCase(),
          fromName: name.trim() || null,
          body: body.trim(),
          createdAt: new Date().toISOString(),
          fromFirm: false,
        };
        setMessages((m) => [...m, optimistic]);
        setBody("");
        setSuccess("Message sent.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      }
    });
  };

  const handleDecline = () => {
    if (declined) return;
    if (
      !confirm(
        "Decline further contact? This will revoke your access to this case.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await declineCollabSharePublic({ token, email: email || null });
        setDeclined(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to decline");
      }
    });
  };

  if (declined) {
    return (
      <div className="space-y-3 rounded-lg border border-[#EAEAEA] bg-background p-6">
        <h1 className="text-lg font-semibold">Thanks — access revoked</h1>
        <p className="text-sm text-muted-foreground">
          You will no longer receive messages about this case through this
          link. If you need to reach the firm, please contact them directly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* About this case */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{share.subject}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Claimant
            </p>
            <p className="text-foreground">{claimantDisplay}</p>
          </div>
          {caseInfo.stageClientVisibleName || caseInfo.stageName ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Current status
              </p>
              <p className="text-foreground">
                {caseInfo.stageClientVisibleName ?? caseInfo.stageName}
              </p>
            </div>
          ) : null}
          {caseInfo.referringAttorneyName && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Firm contact
              </p>
              <p className="text-foreground">
                {caseInfo.referringAttorneyName}
              </p>
              {caseInfo.referringAttorneyEmail && (
                <a
                  href={`mailto:${caseInfo.referringAttorneyEmail}`}
                  className="text-xs text-primary hover:underline"
                >
                  {caseInfo.referringAttorneyEmail}
                </a>
              )}
            </div>
          )}
          {share.message && (
            <div className="rounded-md bg-accent p-3 text-sm text-foreground">
              {share.message}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Access expires{" "}
            {new Date(share.expiresAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            .
          </p>
        </CardContent>
      </Card>

      {/* Shared documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Shared documents ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents have been shared with you.
            </p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[#EAEAEA] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {d.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.fileType}
                      {d.fileSizeBytes
                        ? ` \u00b7 ${formatBytes(d.fileSizeBytes)}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-md border p-3 text-sm ${
                    m.fromFirm
                      ? "border-[#EAEAEA] bg-background"
                      : "border-accent bg-accent"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {m.fromName || m.fromEmail}
                      {m.fromFirm && (
                        <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Firm
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-foreground">
                    {m.body}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t border-[#EAEAEA] pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="collab-name">Your name</Label>
                <Input
                  id="collab-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Jane Doe"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="collab-email">Your email</Label>
                <Input
                  id="collab-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="collab-body">Message</Label>
              <Textarea
                id="collab-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your message to the firm..."
                rows={4}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-green-600" role="status">
                {success}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleDecline}
                disabled={pending}
              >
                Decline further contact
              </Button>
              <Button type="button" onClick={handleSend} disabled={pending}>
                {pending ? "Sending..." : "Send message"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
