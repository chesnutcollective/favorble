"use client";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.5px] truncate">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[13px] text-[#666]">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
