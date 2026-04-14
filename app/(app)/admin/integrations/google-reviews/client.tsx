"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Status = "not_connected" | "connected" | "error";

export function GoogleReviewsConfigClient({ status }: { status: Status }) {
  const isConnected = status === "connected";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
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
                <p className="text-[13px] text-[#666] max-w-xl">
                  This integration will pull recent Google reviews and surface
                  request opportunities. Connect your Google Business Profile
                  to enable.
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button
                      disabled
                      className="bg-[#000] text-white hover:bg-[#222] disabled:opacity-60"
                    >
                      Connect Google Business Profile
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Coming soon</TooltipContent>
              </Tooltip>
            </div>
          </CardContent>
        </Card>

        {/* Configuration stubs */}
        <Card className="border-[#EAEAEA]">
          <CardContent className="p-6 space-y-5">
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold text-[#1a1a1a]">
                Configuration
              </h3>
              <p className="text-[13px] text-[#666]">
                These fields will activate once the integration is connected.
              </p>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="gr-place-id"
                    className="text-[12px] text-[#666]"
                  >
                    Google Place ID
                  </Label>
                  <Input
                    id="gr-place-id"
                    placeholder="ChIJ..."
                    disabled
                    className="max-w-md"
                  />
                  <p className="text-[11px] text-[#8b8b97]">
                    The unique identifier for your Google Business Profile
                    location.
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="gr-api-key"
                    className="text-[12px] text-[#666]"
                  >
                    API key
                  </Label>
                  <Input
                    id="gr-api-key"
                    type="password"
                    placeholder="••••••••••••••••"
                    disabled
                    autoComplete="off"
                    className="max-w-md"
                  />
                  <p className="text-[11px] text-[#8b8b97]">
                    Stored encrypted at rest; never shown after save.
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between rounded-md border border-[#EAEAEA] p-3 max-w-md">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="gr-auto-request"
                      className="text-[13px] font-medium text-[#1a1a1a]"
                    >
                      Auto-request reviews
                    </Label>
                    <p className="text-[11px] text-[#666]">
                      Ask for a review automatically when a case closes won.
                    </p>
                  </div>
                  <Switch id="gr-auto-request" disabled />
                </div>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>
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
                Star-count trend and average-rating tiles track reputation
                over time.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
