"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { sendBulkPortalInvites } from "@/app/actions/contacts";
import {
  sendPortalInvite,
  resendPortalInvite,
} from "@/app/actions/portal-invites";

type PortalStatus = "never" | "invited" | "active" | "suspended";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  contactType: string;
  createdAt: string;
  caseCount: number;
  portalStatus: PortalStatus;
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  claimant: "Claimant",
  attorney: "Attorney",
  medical_provider: "Medical Provider",
  ssa_office: "SSA Office",
  expert: "Expert",
};

const PORTAL_STATUS_LABEL: Record<PortalStatus, string> = {
  never: "Not invited",
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
};

function ContactAvatar({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#EAEAEA] text-[9px] font-semibold text-[#171717]">
      {initials}
    </span>
  );
}

function PortalStatusPill({ status }: { status: PortalStatus }) {
  const cls =
    status === "active"
      ? "border-[rgba(29,114,184,0.30)] bg-[rgba(29,114,184,0.08)] text-[#185f9b]"
      : status === "invited"
        ? "border-[#EAEAEA] bg-[#FAFAFA] text-[#666]"
        : status === "suspended"
          ? "border-[rgba(238,0,0,0.30)] bg-[rgba(238,0,0,0.08)] text-[#EE0000]"
          : "border-[#EAEAEA] bg-white text-[#999]";
  return (
    <span
      className={
        "inline-block rounded-[3px] border px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.04em] " +
        cls
      }
    >
      {PORTAL_STATUS_LABEL[status]}
    </span>
  );
}

function PortalInviteButton({
  contactId,
  status,
  disabled,
}: {
  contactId: string;
  status: PortalStatus;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      const action = status === "invited" ? resendPortalInvite : sendPortalInvite;
      const result = await action(contactId);
      if (result.ok) {
        toast.success(
          status === "invited" ? "Invite resent" : "Portal invite sent",
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to send invite");
      }
    });
  }

  if (status === "active") {
    return (
      <span className="text-[12px] text-muted-foreground">—</span>
    );
  }

  const label =
    status === "invited" ? "Resend" : status === "suspended" ? "—" : "Invite";
  if (status === "suspended") {
    return <span className="text-[12px] text-muted-foreground">—</span>;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending || disabled}
      className="h-7 text-[12px]"
    >
      {pending ? "Sending…" : label}
    </Button>
  );
}

export function ContactsListClient({
  contacts,
  total,
  page,
  pageSize,
  initialSearch,
  initialType,
}: {
  contacts: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  initialSearch: string;
  initialType: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();

  // Sync when URL searchParams change (e.g., sidebar panel navigation)
  useEffect(() => {
    setTypeFilter(initialType);
  }, [initialType]);
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  // Reset selection when the visible page changes.
  useEffect(() => {
    setSelected(new Set());
  }, [page, initialSearch, initialType]);

  const totalPages = Math.ceil(total / pageSize);

  function applyFilters(overrides?: {
    search?: string;
    type?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    const s = overrides?.search ?? search;
    const t = overrides?.type ?? typeFilter;
    const p = overrides?.page ?? 1;
    if (s) params.set("search", s);
    if (t) params.set("type", t);
    if (p > 1) params.set("page", String(p));
    router.push(`/contacts?${params.toString()}`);
  }

  function clearFilters() {
    setSearch("");
    setTypeFilter("");
    router.push("/contacts");
  }

  const selectableContacts = contacts.filter(
    (c) => c.contactType === "claimant" && c.portalStatus !== "active",
  );
  const allSelectableIds = selectableContacts.map((c) => c.id);
  const allSelected =
    allSelectableIds.length > 0 &&
    allSelectableIds.every((id) => selected.has(id));

  function toggleSelectAll(value: boolean) {
    setSelected(value ? new Set(allSelectableIds) : new Set());
  }

  function toggleOne(id: string, value: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleBulkInvite() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startBulk(async () => {
      const summary = await sendBulkPortalInvites(ids);
      if (summary.sent > 0) {
        toast.success(
          `Sent ${summary.sent} invite${summary.sent === 1 ? "" : "s"}` +
            (summary.skipped > 0
              ? `, skipped ${summary.skipped}`
              : ""),
        );
      } else {
        toast.error(
          summary.errors[0]?.error
            ? `Nothing sent — ${summary.errors[0].error}`
            : "No invites sent",
        );
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-2.5 top-2.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            applyFilters({ type: v });
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claimant">Claimant</SelectItem>
            <SelectItem value="attorney">Attorney</SelectItem>
            <SelectItem value="medical_provider">Medical Provider</SelectItem>
            <SelectItem value="ssa_office">SSA Office</SelectItem>
            <SelectItem value="expert">Expert</SelectItem>
          </SelectContent>
        </Select>
        {(search || typeFilter) && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <HugeiconsIcon icon={Cancel01Icon} size={12} className="mr-1" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {/* Bulk action bar — only shows when something is selected */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-[#EAEAEA] bg-[#FAFAFA] px-3 py-2">
          <span className="text-[13px] text-[#666]">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              disabled={bulkPending}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleBulkInvite}
              disabled={bulkPending}
            >
              {bulkPending
                ? "Sending…"
                : `Send invite to ${selected.size} selected`}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleSelectAll(Boolean(v))}
                  disabled={allSelectableIds.length === 0}
                  aria-label="Select all invitable claimants"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead className="text-right">Cases</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No contacts found.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => {
                const isClaimant = c.contactType === "claimant";
                const canSelect =
                  isClaimant && c.portalStatus !== "active";
                return (
                  <TableRow
                    key={c.id}
                    className="hover:bg-[#FAFAFA] transition-colors duration-200"
                  >
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="w-[40px]"
                    >
                      {canSelect ? (
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={(v) =>
                            toggleOne(c.id, Boolean(v))
                          }
                          aria-label={`Select ${c.firstName} ${c.lastName}`}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <ContactAvatar
                          firstName={c.firstName}
                          lastName={c.lastName}
                        />
                        <p className="font-medium text-foreground">
                          {c.lastName}, {c.firstName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className="cursor-pointer"
                    >
                      <span className="inline-block px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.04em] text-[#999] bg-[#FAFAFA] border border-[#EAEAEA] rounded-[3px]">
                        {CONTACT_TYPE_LABELS[c.contactType] ?? c.contactType}
                      </span>
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className="hidden md:table-cell text-sm text-muted-foreground cursor-pointer"
                    >
                      {c.email ?? "-"}
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className="hidden md:table-cell text-sm text-muted-foreground cursor-pointer"
                    >
                      {c.phone ?? "-"}
                    </TableCell>
                    <TableCell>
                      {isClaimant ? (
                        <PortalStatusPill status={c.portalStatus} />
                      ) : (
                        <span className="text-[12px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className="text-right text-sm text-muted-foreground cursor-pointer"
                    >
                      {c.caseCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {isClaimant && c.email ? (
                        <PortalInviteButton
                          contactId={c.id}
                          status={c.portalStatus}
                        />
                      ) : (
                        <span className="text-[12px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-[#666]">
          {total} total contact{total !== 1 ? "s" : ""}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => applyFilters({ page: page - 1 })}
              className="text-[13px]"
            >
              &larr; Previous
            </Button>
            <span className="text-[13px] text-[#666]">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => applyFilters({ page: page + 1 })}
              className="text-[13px]"
            >
              Next &rarr;
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
