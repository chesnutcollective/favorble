"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Share2, Ban, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  shareDocumentWithClient,
  revokeDocumentShare,
  listDocumentShares,
  type DocumentShareSummary,
} from "@/app/actions/document-shares";

type Props = {
  documentId: string;
  fileName: string;
  claimantName: string;
  /** Initial count from the batch `listActiveDocumentShareCounts` load. */
  initialShareCount: number;
};

/**
 * Firm-side "Share with client" control for a single document row. Shows:
 *   - Primary CTA: Share (opens dialog)
 *   - Active-share badge: "Shared · N views"
 *   - Revoke shortcut inside the dialog
 *
 * Designed to drop into the existing case documents client without
 * refactoring the whole document list — the row-level `onShare` hook is
 * optional for that integration; for now this is a self-contained button
 * you can render anywhere we have a documentId.
 */
export function ShareWithClientButton({
  documentId,
  fileName,
  claimantName,
  initialShareCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<DocumentShareSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [isSubmitting, startSubmit] = useTransition();
  const [activeCount, setActiveCount] = useState(initialShareCount);

  const refreshShares = useCallback(async () => {
    setLoading(true);
    const result = await listDocumentShares(documentId);
    setShares(result);
    const stillActive = result.filter((s) => {
      if (s.revokedAt) return false;
      if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now())
        return false;
      return true;
    }).length;
    setActiveCount(stillActive);
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    if (open) {
      void refreshShares();
    }
  }, [open, refreshShares]);

  const handleShare = useCallback(() => {
    startSubmit(async () => {
      const result = await shareDocumentWithClient(
        documentId,
        expiresAt || null,
      );
      if ("success" in result && result.success) {
        toast.success(`Shared "${fileName}" with ${claimantName}`);
        setExpiresAt("");
        await refreshShares();
      } else {
        toast.error(
          "error" in result ? result.error : "Could not share document",
        );
      }
    });
  }, [documentId, expiresAt, fileName, claimantName, refreshShares]);

  const handleRevoke = useCallback(
    (shareId: string) => {
      startSubmit(async () => {
        const result = await revokeDocumentShare(shareId);
        if ("success" in result && result.success) {
          toast.success("Share revoked");
          await refreshShares();
        } else {
          toast.error(
            "error" in result ? result.error : "Could not revoke share",
          );
        }
      });
    },
    [refreshShares],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Share2 className="size-4" aria-hidden="true" />
        <span>Share with client</span>
        {activeCount > 0 ? (
          <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-800">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share with client</DialogTitle>
            <DialogDescription>
              Make this document visible in the client portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-border bg-[#FAFAF7] p-3 text-sm">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    File
                  </dt>
                  <dd className="mt-0.5 truncate font-medium text-foreground">
                    {fileName}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Claimant
                  </dt>
                  <dd className="mt-0.5 truncate font-medium text-foreground">
                    {claimantName}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`share-expires-${documentId}`}>
                Expiry (optional)
              </Label>
              <Input
                id={`share-expires-${documentId}`}
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
              <p className="text-[12px] text-muted-foreground">
                Leave blank for no expiry. The share can always be revoked.
              </p>
            </div>

            {shares.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Share history
                </h4>
                <ul className="space-y-1.5">
                  {shares.map((share) => {
                    const isActive =
                      !share.revokedAt &&
                      (!share.expiresAt ||
                        new Date(share.expiresAt).getTime() > Date.now());
                    return (
                      <li
                        key={share.id}
                        className="flex items-start justify-between gap-2 rounded border border-border bg-white px-3 py-2 text-[13px]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">
                            {share.sharedWithName ?? "Claimant"}
                          </p>
                          <p className="text-[12px] text-muted-foreground">
                            {isActive ? (
                              <span className="text-emerald-700">Active</span>
                            ) : share.revokedAt ? (
                              <span className="text-red-700">Revoked</span>
                            ) : (
                              <span className="text-amber-700">Expired</span>
                            )}
                            {" · "}
                            {new Date(share.createdAt).toLocaleDateString()}
                            {share.createdByName
                              ? ` · by ${share.createdByName}`
                              : null}
                          </p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Eye className="size-3" aria-hidden="true" />
                            {share.viewCount} view
                            {share.viewCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        {isActive ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(share.id)}
                            disabled={isSubmitting}
                            className="gap-1 text-red-700 hover:text-red-800"
                          >
                            <Ban className="size-3.5" aria-hidden="true" />
                            Revoke
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : loading ? (
              <p className="text-[13px] text-muted-foreground">Loading…</p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Close
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleShare}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sharing…" : "Share"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
