"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// B4 — mirror the URGENCY_VALUES / CATEGORY_VALUES from app/actions/messages.ts
const URGENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "question", label: "Question" },
  { value: "document_request", label: "Document request" },
  { value: "complaint", label: "Complaint" },
  { value: "status_update", label: "Status update" },
  { value: "scheduling", label: "Scheduling" },
  { value: "medical", label: "Medical" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Other" },
];

export type FilterState = {
  urgency?: string;
  category?: string;
  unread?: boolean;
};

export function MessagesFilterStrip({
  urgency,
  category,
  unread,
}: FilterState) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urgencyValue = urgency ?? "all";
  const categoryValue = category ?? "all";
  const unreadValue = unread ?? false;

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === "" || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("urgency");
    next.delete("category");
    next.delete("unread");
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }, [params, pathname, router]);

  const hasAnyFilter =
    urgencyValue !== "all" || categoryValue !== "all" || unreadValue;

  return (
    <div
      className={cn(
        "bg-white border border-[#EAEAEA] rounded-[10px] p-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4",
        isPending && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label
          htmlFor="urgency-filter"
          className="text-[11px] uppercase tracking-[0.06em] text-[#999] font-medium"
        >
          Urgency
        </label>
        <Select
          value={urgencyValue}
          onValueChange={(v) => setParam("urgency", v)}
        >
          <SelectTrigger id="urgency-filter" className="h-9 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {URGENCY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1 min-w-[180px]">
        <label
          htmlFor="category-filter"
          className="text-[11px] uppercase tracking-[0.06em] text-[#999] font-medium"
        >
          Category
        </label>
        <Select
          value={categoryValue}
          onValueChange={(v) => setParam("category", v)}
        >
          <SelectTrigger id="category-filter" className="h-9 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 pb-[6px]">
        <input
          id="unread-only"
          type="checkbox"
          className="h-4 w-4 rounded border-[#CCC] accent-[#263c94]"
          checked={unreadValue}
          onChange={(e) => setParam("unread", e.target.checked ? "1" : null)}
        />
        <label
          htmlFor="unread-only"
          className="text-[13px] text-[#52525e] cursor-pointer select-none"
        >
          Unread only
        </label>
      </div>

      <div className="flex-1" />

      {hasAnyFilter && (
        <button
          type="button"
          onClick={clearAll}
          className="self-start sm:self-end text-[12px] px-3 py-1.5 rounded-md border border-[#EAEAEA] bg-white text-[#52525e] hover:border-[#263c94] hover:text-[#263c94] transition-colors duration-150"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
