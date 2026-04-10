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
      <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums [font-feature-settings:'tnum']">
        {value}
      </p>
      {trend && (
        <p className="mt-2 text-xs font-mono text-[#666]">
          <span
            className={cn(
              trend.value >= 0 ? "text-[#1d72b8]" : "text-[#EE0000]",
            )}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}
          </span>{" "}
          {trend.label}
        </p>
      )}
      {subtitle && (
        <p className="mt-2 text-xs font-mono text-[#666]">
          {subtitleVariant === "danger" ? (
            <>
              <span className="text-[#EE0000]">{subtitle.split(" ")[0]}</span>{" "}
              {subtitle.split(" ").slice(1).join(" ")}
            </>
          ) : (
            subtitle
          )}
        </p>
      )}
    </div>
  );
}
