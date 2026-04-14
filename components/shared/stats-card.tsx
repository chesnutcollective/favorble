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
        "bg-white border border-border rounded-md p-5 hover:border-muted-foreground/40 transition-colors duration-200",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground mb-2">{title}</p>
      <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums [font-feature-settings:'tnum']">
        {value}
      </p>
      {trend && (
        <p className="mt-2 text-xs font-mono text-muted-foreground">
          <span
            className={cn(
              trend.value >= 0 ? "text-status-ok" : "text-urgent",
            )}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}
          </span>{" "}
          {trend.label}
        </p>
      )}
      {subtitle && (
        <p className="mt-2 text-xs font-mono text-muted-foreground">
          {subtitleVariant === "danger" ? (
            <>
              <span className="text-urgent">{subtitle.split(" ")[0]}</span>{" "}
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
