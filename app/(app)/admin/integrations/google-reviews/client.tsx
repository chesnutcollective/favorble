"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  disconnectGoogleReviews,
  refreshGoogleReviewsNow,
  updateAutoRequestToggle,
  updateReviewRequestTemplate,
  updateStartingReviewCount,
  type GoogleReviewsConnectionStatus,
} from "@/app/actions/google-reviews";

type Banner = { kind: "success" | "error"; message: string } | null;

export function GoogleReviewsConfigClient({
  connection,
  canAdmin,
  banner,
}: {
  connection: GoogleReviewsConnectionStatus;
  canAdmin: boolean;
  banner: Banner;
}) {
  const { isConnected, envConfigured } = connection;
  const [isRefreshing, startRefresh] = useTransition();
  const [isDisconnecting, startDisconnect] = useTransition();
  const [isSavingCount, startSaveCount] = useTransition();
  const [isSavingToggle, startSaveToggle] = useTransition();
  const [isSavingTemplate, startSaveTemplate] = useTransition();

  const [startingCount, setStartingCount] = useState<string>(
    String(connection.startingReviewCount),
  );
  const [autoRequest, setAutoRequest] = useState(connection.autoRequest);
  const [template, setTemplate] = useState(
    connection.reviewRequestTemplate ?? "",
  );

  function onRefresh() {
    startRefresh(async () => {
      const result = await refreshGoogleReviewsNow();
      if (!result.ok) {
        toast.error("Refresh failed", { description: result.error });
        return;
      }
      toast.success("Reviews synced", {
        description: `Fetched ${result.fetched} — ${result.inserted} new, ${result.updated} updated.`,
      });
    });
  }

  function onDisconnect() {
    if (!confirm("Disconnect Google Business Profile? You can reconnect later."))
      return;
    startDisconnect(async () => {
      const result = await disconnectGoogleReviews();
      if (!result.ok) {
        toast.error("Disconnect failed", { description: result.error });
        return;
      }
      toast.success("Disconnected");
    });
  }

  function onSaveStartingCount() {
    const parsed = Number(startingCount);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Starting count must be a non-negative number.");
      return;
    }
    startSaveCount(async () => {
      const result = await updateStartingReviewCount(parsed);
      if (!result.ok) {
        toast.error("Could not save", { description: result.error });
        return;
      }
      toast.success("Starting count saved");
    });
  }

  function onToggleAutoRequest(next: boolean) {
    setAutoRequest(next);
    startSaveToggle(async () => {
      const result = await updateAutoRequestToggle(next);
      if (!result.ok) {
        toast.error("Could not save toggle", { description: result.error });
        setAutoRequest(!next);
        return;
      }
      toast.success(next ? "Auto-request enabled" : "Auto-request disabled");
    });
  }

  function onSaveTemplate() {
    startSaveTemplate(async () => {
      const result = await updateReviewRequestTemplate(template);
      if (!result.ok) {
        toast.error("Could not save template", { description: result.error });
        return;
      }
      toast.success("Template saved");
    });
  }

  const connectHref = "/api/auth/google-oauth/start";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {banner ? (
          <div
            className={
              banner.kind === "success"
                ? "rounded-md border border-[#c7e0c9] bg-[#e6f4ea] p-3 text-[13px] text-[#1f5132]"
                : "rounded-md border border-[#f1b0b7] bg-[#fde7e9] p-3 text-[13px] text-[#842029]"
            }
          >
            {banner.message}
          </div>
        ) : null}

        {/* Status card */}
        <Card className="border-[#EAEAEA]">
          <CardContent className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
                    Connection status
                  </h3>
                  {isConnected ? (
                    <Badge className="bg-[#1d72b8] text-white">Connected</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-[#EAEAEA] text-[#666]"
                    >
                      Not connected
                    </Badge>
                  )}
                </div>
                {isConnected ? (
                  <p className="text-[13px] text-[#666] max-w-xl">
                    Connected
                    {connection.placeId
                      ? ` · Place ID ${connection.placeId.slice(0, 12)}…`
                      : null}
                    {connection.lastSyncAt
                      ? ` · Last synced ${formatRelative(connection.lastSyncAt)}`
                      : " · Never synced"}
                  </p>
                ) : (
                  <p className="text-[13px] text-[#666] max-w-xl">
                    Connect your Google Business Profile to pull reviews and
                    enable review-request prompts after closed-won cases.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={onRefresh}
                      disabled={!canAdmin || isRefreshing}
                    >
                      {isRefreshing ? "Refreshing…" : "Refresh now"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onDisconnect}
                      disabled={!canAdmin || isDisconnecting}
                    >
                      {isDisconnecting ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  </>
                ) : envConfigured ? (
                  <Button
                    asChild
                    disabled={!canAdmin}
                    className="bg-[#000] text-white hover:bg-[#222]"
                  >
                    <a href={canAdmin ? connectHref : undefined}>
                      Connect Google Business Profile
                    </a>
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          disabled
                          className="bg-[#000] text-white disabled:opacity-60"
                        >
                          Connect Google Business Profile
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in env
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuration card */}
        <Card className="border-[#EAEAEA]">
          <CardContent className="p-6 space-y-5">
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
                Configuration
              </h3>
              <p className="text-[13px] text-[#666]">
                These settings apply once the integration is connected.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="gr-starting-count"
                className="text-[12px] text-[#666]"
              >
                Starting review count
              </Label>
              <div className="flex items-center gap-2 max-w-md">
                <Input
                  id="gr-starting-count"
                  type="number"
                  min={0}
                  value={startingCount}
                  onChange={(e) => setStartingCount(e.target.value)}
                  disabled={!isConnected || !canAdmin}
                  className="max-w-[180px]"
                />
                <Button
                  variant="outline"
                  disabled={!isConnected || !canAdmin || isSavingCount}
                  onClick={onSaveStartingCount}
                >
                  {isSavingCount ? "Saving…" : "Save"}
                </Button>
              </div>
              <p className="text-[11px] text-[#8b8b97]">
                Baseline recorded at connect — reports show the delta since
                this number.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#EAEAEA] p-3 max-w-md">
              <div className="space-y-0.5">
                <Label
                  htmlFor="gr-auto-request"
                  className="text-[13px] font-medium text-[#1a1a1a]"
                >
                  Auto-request reviews on case close
                </Label>
                <p className="text-[11px] text-[#666]">
                  Ask automatically when a case closes won. Off by default.
                </p>
              </div>
              <Switch
                id="gr-auto-request"
                checked={autoRequest}
                onCheckedChange={onToggleAutoRequest}
                disabled={!isConnected || !canAdmin || isSavingToggle}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="gr-template"
                className="text-[12px] text-[#666]"
              >
                Review request message (optional)
              </Label>
              <Textarea
                id="gr-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Hi {claimantFirstName}, thank you for trusting us with your case {caseNumber}. If you have a minute, a Google review would mean the world: {shortUrl}"
                rows={4}
                disabled={!canAdmin}
                className="max-w-xl"
              />
              <div className="flex items-center justify-between max-w-xl">
                <p className="text-[11px] text-[#8b8b97]">
                  Supports {`{caseNumber}`}, {`{claimantFirstName}`}, and{" "}
                  {`{shortUrl}`}. Leave blank to use the default.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSaveTemplate}
                  disabled={!canAdmin || isSavingTemplate}
                >
                  {isSavingTemplate ? "Saving…" : "Save template"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help text */}
        <Card className="border-[#EAEAEA] bg-[#FAFAF8]">
          <CardContent className="p-6">
            <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-2">
              What this unlocks
            </h3>
            <ul className="text-[13px] text-[#666] space-y-1 list-disc list-inside">
              <li>
                Reviews appear on the{" "}
                <a
                  href="/reports/reviews"
                  className="text-[#263c94] hover:underline"
                >
                  Reviews report
                </a>{" "}
                with rating, comment, and response state.
              </li>
              <li>
                Review-request worklist suggests closed-won clients most
                likely to leave a 5-star rating.
              </li>
              <li>
                Optional auto-request fires the moment a case closes won.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
