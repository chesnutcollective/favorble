"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BookmarkAdd01Icon,
  Delete02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { deleteSavedView, type SavedView } from "@/app/actions/cases";
import { SaveViewDialog } from "./save-view-dialog";

export type SeededView = {
  id: string;
  name: string;
  isSeeded: true;
};

export type ViewDescriptor =
  | { kind: "seeded"; id: string; name: string }
  | { kind: "saved"; view: SavedView };

export function SavedViewsMenu({
  seededViews,
  savedViews,
  activeViewId,
  currentFilters,
  currentSort,
  onSelect,
  onRefresh,
}: {
  seededViews: { id: string; name: string }[];
  savedViews: SavedView[];
  activeViewId: string | null;
  currentFilters: Record<string, unknown>;
  currentSort: { sortBy?: string; sortDir?: "asc" | "desc" };
  onSelect: (descriptor: ViewDescriptor) => void;
  onRefresh: () => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteSavedView(id);
      onRefresh();
    });
  }

  const activeLabel = (() => {
    if (!activeViewId) return "Saved views";
    const seeded = seededViews.find((s) => s.id === activeViewId);
    if (seeded) return seeded.name;
    const saved = savedViews.find((s) => s.id === activeViewId);
    if (saved) return saved.name;
    return "Saved views";
  })();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <HugeiconsIcon icon={BookmarkAdd01Icon} size={14} aria-hidden="true" />
            <span className="max-w-[160px] truncate">{activeLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          <DropdownMenuLabel>Quick views</DropdownMenuLabel>
          {seededViews.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={(e) => {
                e.preventDefault();
                onSelect({ kind: "seeded", id: v.id, name: v.name });
              }}
            >
              {v.name}
            </DropdownMenuItem>
          ))}
          {savedViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Your views</DropdownMenuLabel>
              {savedViews.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-1 pr-1 group"
                >
                  <DropdownMenuItem
                    className="flex-1"
                    onSelect={(e) => {
                      e.preventDefault();
                      onSelect({ kind: "saved", view: v });
                    }}
                  >
                    <span className="flex-1 truncate">{v.name}</span>
                    {v.isShared && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        shared
                      </span>
                    )}
                  </DropdownMenuItem>
                  {v.isOwner && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDelete(v.id);
                      }}
                      disabled={isPending}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#F0F0F0] transition-opacity"
                      aria-label={`Delete view ${v.name}`}
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        size={12}
                        className="text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSaveOpen(true);
            }}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} aria-hidden="true" />
            Save current view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        filters={currentFilters}
        sort={currentSort}
        onSaved={onRefresh}
      />
    </>
  );
}
