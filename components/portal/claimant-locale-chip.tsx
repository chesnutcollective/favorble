"use client";

import { Globe } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Small inline chip rendered next to a claimant's name in the case header
 * when their preferred locale is Spanish. Signals to staff that outgoing
 * drafts should be translated before sending.
 */
export function ClaimantLocaleChip({ locale }: { locale: string }) {
  const normalized = locale.toLowerCase().startsWith("es") ? "ES" : locale.toUpperCase();
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="note"
            aria-label={`Client reads ${normalized}`}
            className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#E8E2D8] bg-[#F7F5F2] px-2 py-0.5 align-middle text-[11px] font-medium text-[#104e60]"
          >
            <Globe className="size-3" aria-hidden="true" />
            {normalized}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          This client reads Spanish — drafts can be translated before sending.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
