"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateLeadStatus, createLead } from "@/app/actions/leads";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Mail01Icon,
  Call02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  createdAt: string;
  notes: string | null;
};

type Column = {
  status: string;
  label: string;
  count: number;
  leads: Lead[];
};

const LEAD_SOURCES = [
  "website",
  "referral",
  "phone",
  "walk_in",
  "social_media",
  "other",
];

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

export function LeadsPipelineClient({
  columns: initialColumns,
}: {
  columns: Column[];
}) {
  const [columns, setColumns] = useState(initialColumns);
  const [isPending, startTransition] = useTransition();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  // New lead form state
  const [nlFirstName, setNlFirstName] = useState("");
  const [nlLastName, setNlLastName] = useState("");
  const [nlEmail, setNlEmail] = useState("");
  const [nlPhone, setNlPhone] = useState("");
  const [nlSource, setNlSource] = useState("website");

  function handleMoveRight(leadId: string, currentStatus: string) {
    const currentIndex = columns.findIndex((c) => c.status === currentStatus);
    if (currentIndex < columns.length - 1) {
      const nextStatus = columns[currentIndex + 1].status;
      moveLeadToColumn(leadId, currentStatus, nextStatus);
    }
  }

  function moveLeadToColumn(
    leadId: string,
    fromStatus: string,
    toStatus: string,
  ) {
    if (fromStatus === toStatus) return;

    // Optimistic update
    setColumns((prev) => {
      const next = prev.map((col) => ({ ...col, leads: [...col.leads] }));
      const fromCol = next.find((c) => c.status === fromStatus);
      const toCol = next.find((c) => c.status === toStatus);
      if (!fromCol || !toCol) return prev;

      const leadIndex = fromCol.leads.findIndex((l) => l.id === leadId);
      if (leadIndex === -1) return prev;

      const [lead] = fromCol.leads.splice(leadIndex, 1);
      toCol.leads.push(lead);
      fromCol.count = fromCol.leads.length;
      toCol.count = toCol.leads.length;
      return next;
    });

    startTransition(async () => {
      await updateLeadStatus(leadId, toStatus);
    });
  }

  // Drag and drop handlers
  function handleDragStart(e: React.DragEvent, leadId: string) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", leadId);
    setDraggedLeadId(leadId);
  }

  function handleDragEnd() {
    setDraggedLeadId(null);
    setDragOverColumn(null);
  }

  function handleDragOver(e: React.DragEvent, columnStatus: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnStatus);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the column entirely
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setDragOverColumn(null);
    }
  }

  function handleDrop(e: React.DragEvent, targetStatus: string) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain");
    setDraggedLeadId(null);
    setDragOverColumn(null);

    if (!leadId) return;

    // Find which column the lead is currently in
    const sourceCol = columns.find((c) => c.leads.some((l) => l.id === leadId));
    if (!sourceCol) return;

    moveLeadToColumn(leadId, sourceCol.status, targetStatus);
  }

  async function handleCreateLead() {
    if (!nlFirstName || !nlLastName) return;
    startTransition(async () => {
      const newLead = await createLead({
        firstName: nlFirstName,
        lastName: nlLastName,
        email: nlEmail || undefined,
        phone: nlPhone || undefined,
        source: nlSource,
      });
      // Add to the "new" column optimistically
      setColumns((prev) =>
        prev.map((col) =>
          col.status === "new"
            ? {
                ...col,
                count: col.count + 1,
                leads: [
                  {
                    id: newLead.id,
                    firstName: newLead.firstName,
                    lastName: newLead.lastName,
                    email: newLead.email,
                    phone: newLead.phone,
                    source: newLead.source,
                    createdAt: new Date().toISOString(),
                    notes: newLead.notes,
                  },
                  ...col.leads,
                ],
              }
            : col,
        ),
      );
      setNewLeadOpen(false);
      setNlFirstName("");
      setNlLastName("");
      setNlEmail("");
      setNlPhone("");
      setNlSource("website");
    });
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description="Lead pipeline and intake management."
        actions={
          <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
                New Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Lead</DialogTitle>
                <DialogDescription>
                  Enter the lead contact information.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nl-first">First Name</Label>
                    <Input
                      id="nl-first"
                      value={nlFirstName}
                      onChange={(e) => setNlFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nl-last">Last Name</Label>
                    <Input
                      id="nl-last"
                      value={nlLastName}
                      onChange={(e) => setNlLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nl-email">Email</Label>
                  <Input
                    id="nl-email"
                    type="email"
                    value={nlEmail}
                    onChange={(e) => setNlEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nl-phone">Phone</Label>
                  <Input
                    id="nl-phone"
                    type="tel"
                    value={nlPhone}
                    onChange={(e) => setNlPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Source</Label>
                  <Select value={nlSource} onValueChange={setNlSource}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewLeadOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateLead}
                  disabled={!nlFirstName || !nlLastName || isPending}
                >
                  {isPending ? "Creating..." : "Create Lead"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col.status}
            className={`min-w-[280px] max-w-[320px] flex-1 rounded-[6px] border border-[#eaeaea] bg-[#fafafa] p-3 transition-colors duration-200 ${
              dragOverColumn === col.status
                ? "border-[#999]"
                : ""
            }`}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#171717]">
                {col.label}
              </h3>
              <span className="text-xs text-[#666]">
                {col.leads.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-2">
              {col.leads.map((lead) => (
                <Card
                  key={lead.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                  onDragEnd={handleDragEnd}
                  className={`border-[#eaeaea] bg-white transition-colors duration-200 hover:border-[#999] cursor-grab active:cursor-grabbing ${
                    draggedLeadId === lead.id ? "opacity-50" : ""
                  }`}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="text-sm font-medium text-[#171717] hover:underline"
                      >
                        {lead.firstName} {lead.lastName}
                      </Link>
                      <span className="text-xs text-[#666]">
                        {formatRelative(lead.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[#666]">
                      {lead.email && (
                        <span className="flex items-center gap-1">
                          <HugeiconsIcon icon={Mail01Icon} size={12} />
                          {lead.email}
                        </span>
                      )}
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <HugeiconsIcon icon={Call02Icon} size={12} />
                          {lead.phone}
                        </span>
                      )}
                    </div>
                    {lead.source && (
                      <Badge variant="outline" className="text-xs border-[#eaeaea] text-[#666]">
                        {lead.source}
                      </Badge>
                    )}
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => handleMoveRight(lead.id, col.status)}
                      >
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          size={12}
                          className="mr-1"
                        />
                        Advance
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {col.leads.length === 0 && (
                <div className="rounded-[6px] border border-dashed border-[#eaeaea] p-6 text-center">
                  <p className="text-xs text-[#666]">
                    {dragOverColumn === col.status ? "Drop here" : "No leads"}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
