"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  editAiDraft,
  approveDraftAndSend,
  rejectAiDraft,
} from "@/app/actions/ai";

type Props = {
  draftId: string;
  initialBody: string;
  canSend: boolean;
  caseId?: string;
};

export function DraftReviewerClient({
  draftId,
  initialBody,
  canSend,
  caseId,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const charsChanged = Math.abs(body.length - initialBody.length);

  function handleSaveEdit() {
    setError(null);
    startTransition(async () => {
      const res = await editAiDraft(draftId, body);
      if (!res.success) {
        setError(res.error ?? "Save failed");
      }
      router.refresh();
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveDraftAndSend(draftId, body);
      if (!res.success) {
        setError(res.error ?? "Send failed");
        return;
      }
      if (caseId) {
        router.push(`/cases/${caseId}/messages`);
      } else {
        router.push("/drafts");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      await rejectAiDraft(draftId);
      router.push("/drafts");
    });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Draft</p>
          <p className="text-[11px] text-muted-foreground">
            {charsChanged} chars changed from AI output
          </p>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="text-sm font-mono"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Button variant="ghost" onClick={handleReject} disabled={busy}>
            Reject
          </Button>
          <Button variant="outline" onClick={handleSaveEdit} disabled={busy}>
            Save edit
          </Button>
          {canSend && (
            <Button onClick={handleApprove} disabled={busy || !body.trim()}>
              {busy ? "Sending..." : "Approve & send"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
