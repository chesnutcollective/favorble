"use client";

import Link from "next/link";
import { COLORS } from "@/lib/design-tokens";

export type WinItem = {
  id: string;
  /** Claimant initials (privacy: never full name) */
  initials: string;
  /** Subtitle (e.g. ALJ + office) */
  subtitle?: string;
  /** Right-side amount (e.g. "$18,420") */
  amount?: string;
  /** Relative time (e.g. "2 days ago") */
  timestamp?: string;
  /** Deep link to case file */
  href?: string;
};

type Props = {
  items: WinItem[];
  /** Card title (defaults to "Wins this week") */
  title?: string;
  /** Today's count to show in the corner */
  todayCount?: number;
  /** Empty state message */
  emptyMessage?: string;
  /** Outer height for the scrollable area */
  height?: number;
  className?: string;
};

/**
 * Vertical scrolling card-list of wins. Used by reviewer (wins-this-week)
 * and adaptable for fee_collection (recent payments).
 */
export function WinsTicker({
  items,
  title = "Wins this week",
  todayCount,
  emptyMessage = "This week's wins will appear here",
  height = 280,
  className,
}: Props) {
  return (
    <div
      className={`rounded-[10px] border bg-white flex flex-col ${className ?? ""}`}
      style={{ borderColor: COLORS.borderDefault, height }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: COLORS.borderSubtle }}
      >
        <div
          className="text-[12px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: COLORS.text2 }}
        >
          {title}
        </div>
        {todayCount !== undefined && (
          <div className="text-[14px] font-semibold tabular-nums" style={{ color: COLORS.text1 }}>
            {todayCount}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div
            className="flex h-full items-center justify-center px-4 text-center text-[13px]"
            style={{ color: COLORS.text3 }}
          >
            {emptyMessage}
          </div>
        ) : (
          <ul>
            {items.map((item) => {
              const Wrapper: React.ElementType = item.href ? Link : "div";
              const wrapperProps = item.href ? { href: item.href } : {};
              return (
                <li
                  key={item.id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: COLORS.borderSubtle }}
                >
                  <Wrapper
                    {...wrapperProps}
                    className="flex items-center gap-3 p-3 hover:bg-[#FAFAFA] transition-colors"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDeep})`,
                      }}
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: COLORS.text1 }}>
                          {item.initials}
                        </span>
                        {item.amount && (
                          <span className="text-[12px] tabular-nums" style={{ color: COLORS.emeraldDeep }}>
                            {item.amount}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] truncate" style={{ color: COLORS.text3 }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {item.timestamp && (
                      <span className="text-[10px] tabular-nums" style={{ color: COLORS.text3 }}>
                        {item.timestamp}
                      </span>
                    )}
                  </Wrapper>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
