"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { revokeCollaboratorShare } from "@/app/actions/collab-shares";

export type CollabShareListItem = {
  id: string;
  subject: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdByName: string | null;
  recipients: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    viewedAt: string | null;
    respondedAt: string | null;
  }>;
  viewCount: number;
  documentCount: number;
  unreadMessageCount: number;
};

export function CollabSharesList({
  shares,
}: {
  shares: CollabShareListItem[];
}) {
  if (shares.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">External collaborators</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No external collaborators invited. Use &quot;Invite external
            collaborator&quot; to grant scoped access to a physician, family
            member, or prior counsel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          External collaborators ({shares.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {shares.map((share) => (
          <CollabShareRow key={share.id} share={share} />
        ))}
      </CardContent>
    </Card>
  );
}

function CollabShareRow({ share }: { share: CollabShareListItem }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const expired = new Date(share.expiresAt).getTime() < Date.now();
  const isRevoked = Boolean(share.revokedAt);
  const isActive = !isRevoked && !expired;

  const handleRevoke = () => {
    if (!confirm("Revoke this share? The recipient will lose access immediately.")) {
      return;
    }
    startTransition(async () => {
      try {
        await revokeCollaboratorShare(share.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke");
      }
    });
  };

  return (
    <div className="rounded-md border border-[#EAEAEA] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {share.subject}
          </p>
          <p className="text-xs text-muted-foreground">
            Created{" "}
            {new Date(share.createdAt).toLocaleDateString()}{" "}
            {share.createdByName ? `by ${share.createdByName}` : ""} &middot;{" "}
            Expires {new Date(share.expiresAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <Badge variant="secondary" className="text-xs">
              Active
            </Badge>
          ) : isRevoked ? (
            <Badge variant="outline" className="text-xs">
              Revoked
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Expired
            </Badge>
          )}
          {share.unreadMessageCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {share.unreadMessageCount} unread
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{share.documentCount} docs</span>
        <span>
          {share.viewCount}/{share.recipients.length} viewed
        </span>
      </div>

      {share.recipients.length > 0 && (
        <ul className="mt-2 space-y-1">
          {share.recipients.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="font-medium text-foreground">
                {r.name || r.email}
              </span>
              <span className="text-muted-foreground">{r.email}</span>
              {r.role && (
                <Badge variant="outline" className="text-[10px]">
                  {r.role.replace(/_/g, " ")}
                </Badge>
              )}
              {r.viewedAt && (
                <span className="text-muted-foreground">
                  viewed {new Date(r.viewedAt).toLocaleDateString()}
                </span>
              )}
              {r.respondedAt && (
                <span className="text-muted-foreground">declined</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {isActive && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevoke}
            disabled={pending}
          >
            {pending ? "Revoking..." : "Revoke"}
          </Button>
        </div>
      )}
    </div>
  );
}
