"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatsCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  className?: string;
};

export function StatsCard({
  title,
  value,
  subtitle,
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
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
          <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
