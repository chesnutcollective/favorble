"use client";

import { Card, CardContent } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type StatsCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  /** "danger" renders subtitle in red/bold for critical alerts */
  subtitleVariant?: "default" | "danger";
  trend?: { value: number; label: string };
  icon?: IconSvgElement;
  /** Tailwind color classes for the icon circle background, e.g. "bg-blue-100" */
  iconBgClass?: string;
  /** CSS color for the icon stroke, e.g. "rgb(59 130 246)" */
  iconColor?: string;
  /** Tailwind border-left color class, e.g. "border-l-blue-500" */
  accentClass?: string;
  className?: string;
};

export function StatsCard({
  title,
  value,
  subtitle,
  subtitleVariant = "default",
  trend,
  icon,
  iconBgClass = "bg-muted",
  iconColor = "currentColor",
  accentClass,
  className,
}: StatsCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow hover:shadow-md",
        accentClass && `border-l-4 ${accentClass}`,
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-foreground">{value}</p>
              {trend && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.value >= 0 ? "text-green-600" : "text-red-600",
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
                    ? "font-semibold text-red-600"
                    : "text-muted-foreground",
                )}
              >
                {subtitleVariant === "danger" && "⚠ "}
                {subtitle}
              </p>
            )}
          </div>
          {icon && (
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                iconBgClass,
              )}
            >
              <HugeiconsIcon icon={icon} size={20} color={iconColor} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
