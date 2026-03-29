"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  contactType: string;
  createdAt: string;
  caseCount: number;
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  claimant: "Claimant",
  attorney: "Attorney",
  medical_provider: "Medical Provider",
  ssa_office: "SSA Office",
  expert: "Expert",
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

  // Sync when URL searchParams change (e.g., sidebar panel navigation)
  useEffect(() => {
    setTypeFilter(initialType);
  }, [initialType]);
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-2.5 top-2.5 text-muted-foreground"
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
          <SelectTrigger className="w-[200px]">
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
            <HugeiconsIcon icon={Cancel01Icon} size={12} className="mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Cases</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No contacts found.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow
                  key={c.id}
                  className="hover:bg-[#FAFAFA] transition-colors duration-200 cursor-pointer"
                  onClick={() => router.push(`/contacts/${c.id}`)}
                >
                  <TableCell>
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
                  <TableCell>
                    <span className="inline-block px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.04em] text-[#999] bg-[#FAFAFA] border border-[#EAEAEA] rounded-[3px]">
                      {CONTACT_TYPE_LABELS[c.contactType] ?? c.contactType}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.email ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.phone ?? "-"}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {c.caseCount}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#666]">
          {total} total contact{total !== 1 ? "s" : ""}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
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
