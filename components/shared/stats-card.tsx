"use client";

import { cn } from "@/lib/utils";

type StatsCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  /** "danger" renders subtitle in red/bold for critical alerts */
  subtitleVariant?: "default" | "danger";
  trend?: { value: number; label: string };
  className?: string;
};

export function StatsCard({
  title,
  value,
  subtitle,
  subtitleVariant = "default",
  trend,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200",
        className,
      )}
    >
      <p className="text-xs text-[#666] mb-2">{title}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-[28px] font-bold tracking-[-1px] tabular-nums">
          {value}
        </p>
        {trend && (
          <span
            className={cn(
              "text-xs font-mono",
              trend.value >= 0 ? "text-[#00C853]" : "text-[#EE0000]",
            )}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value} {trend.label}
          </span>
        )}
      </div>
      {subtitle && (
        <p
          className={cn(
            "mt-1 text-xs",
            subtitleVariant === "danger"
              ? "font-semibold text-[#EE0000]"
              : "text-[#666]",
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
