"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { value: "30", label: "Last 30d" },
  { value: "90", label: "Last 90d" },
  { value: "180", label: "Last 180d" },
  { value: "365", label: "Last 365d" },
  { value: "0", label: "All time" },
];

const DIMENSION_OPTIONS = [
  { value: "rep", label: "Rep" },
  { value: "alj", label: "ALJ" },
  { value: "office", label: "Office" },
  { value: "hearing_type", label: "Hearing Type" },
];

type FilterBarProps = {
  period: string;
  dimension: string;
};

export function WinRateFilterBar({ period, dimension }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(key, value);
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [params, pathname, router],
  );

  return (
    <div
      className={cn(
        "bg-white border border-[#EAEAEA] rounded-[10px] p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        isPending && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <span className="text-[11px] uppercase tracking-[0.06em] text-[#999] font-medium">
          Time Period
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setParam("period", opt.value)}
                className={cn(
                  "text-[12px] px-3 py-1.5 rounded-md border transition-colors duration-150 tabular-nums",
                  active
                    ? "bg-[#263c94] text-white border-[#263c94]"
                    : "bg-white text-[#263c94] border-[#EAEAEA] hover:border-[#263c94]",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <span className="text-[11px] uppercase tracking-[0.06em] text-[#999] font-medium">
          Group By
        </span>
        <div className="flex flex-wrap gap-1.5">
          {DIMENSION_OPTIONS.map((opt) => {
            const active = dimension === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setParam("dimension", opt.value)}
                className={cn(
                  "text-[12px] px-3 py-1.5 rounded-md border transition-colors duration-150",
                  active
                    ? "bg-[#263c94] text-white border-[#263c94]"
                    : "bg-white text-[#263c94] border-[#EAEAEA] hover:border-[#263c94]",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
