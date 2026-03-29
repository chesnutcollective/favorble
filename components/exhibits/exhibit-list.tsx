"use client";

import { useTransition, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, File01Icon } from "@hugeicons/core-free-icons";
import {
  buildExhibitPacket,
  deleteExhibitPacket,
} from "@/app/actions/exhibit-packets";
import type { ExhibitPacketItem } from "@/app/(app)/cases/[id]/chronology/client";

const PACKET_STATUS_STYLES: Record<string, string> = {
  draft: "border border-[#eaeaea] bg-white text-[#666]",
  building: "border border-[#eaeaea] bg-white text-[#171717]",
  ready: "border border-[#eaeaea] bg-white text-[#171717]",
  submitted: "border border-[#eaeaea] bg-white text-[#171717]",
  failed: "border border-[#eaeaea] bg-white text-[#666]",
};

const PACKET_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  building: "Building",
  ready: "Ready",
  submitted: "Submitted",
  failed: "Failed",
};

type ExhibitListProps = {
  caseId: string;
  packets: ExhibitPacketItem[];
};

export function ExhibitList({ caseId, packets }: ExhibitListProps) {
  const [isPending, startTransition] = useTransition();

  const handleRebuild = useCallback((packetId: string) => {
    startTransition(async () => {
      try {
        await buildExhibitPacket(packetId);
      } catch {
        // Build service may not be available
      }
    });
  }, []);

  const handleDelete = useCallback((packetId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this exhibit packet?",
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        await deleteExhibitPacket(packetId);
      } catch {
        // Failed
      }
    });
  }, []);

  if (packets.length === 0) {
    return (
      <EmptyState
        icon={File01Icon}
        title="No exhibit packets yet"
        description="Build an exhibit packet from your case documents."
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Built</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {packets.map((packet) => (
            <TableRow key={packet.id}>
              <TableCell>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {packet.title}
                  </p>
                  {packet.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {packet.description}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  className={
                    PACKET_STATUS_STYLES[packet.status] ??
                    "border border-[#eaeaea] bg-white text-[#666]"
                  }
                >
                  {PACKET_STATUS_LABELS[packet.status] ?? packet.status}
                </Badge>
                {packet.errorMessage && (
                  <p className="mt-1 text-xs text-destructive">
                    {packet.errorMessage}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {packet.builtAt
                  ? new Date(packet.builtAt).toLocaleDateString()
                  : "--"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(packet.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {packet.packetStoragePath && (
                      <DropdownMenuItem>Download</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleRebuild(packet.id)}>
                      Rebuild
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(packet.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
