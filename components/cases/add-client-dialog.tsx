"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addContactToCase, searchContactsForCase } from "@/app/actions/cases";
import { toast } from "sonner";

type ContactSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  contactType: string;
};

const RELATIONSHIPS: Array<{ value: string; label: string }> = [
  { value: "claimant", label: "Claimant" },
  { value: "spouse", label: "Spouse" },
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "rep_payee", label: "Rep Payee" },
  { value: "attorney_in_fact", label: "Attorney in Fact" },
  { value: "other", label: "Other" },
];

/**
 * "+ Add Client" dialog for the case overview Parties section.
 *
 * Lets the user pick an existing contact (search-as-you-type), set the
 * relationship, and optionally flag them as primary. The server action
 * enforces auth + the one-primary-per-case invariant.
 */
export function AddClientDialog({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [selected, setSelected] = useState<ContactSearchResult | null>(null);
  const [relationship, setRelationship] = useState<string>("claimant");
  const [isPrimary, setIsPrimary] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Debounced search. Fires on every keystroke change (including the empty
  // query) so the user sees recent contacts as soon as the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsSearching(true);
    const handle = setTimeout(async () => {
      try {
        const rows = await searchContactsForCase(query);
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open]);

  // Reset local state whenever the dialog closes so the next open is clean.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(null);
      setRelationship("claimant");
      setIsPrimary(false);
    }
  }, [open]);

  const handleSubmit = () => {
    if (!selected) {
      toast.error("Pick a contact first.");
      return;
    }
    startTransition(async () => {
      const result = await addContactToCase(
        caseId,
        selected.id,
        relationship as
          | "claimant"
          | "spouse"
          | "parent"
          | "guardian"
          | "rep_payee"
          | "attorney_in_fact"
          | "other",
        isPrimary,
      );
      if (result.ok) {
        toast.success("Client added to case.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Add Client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Client to Case</DialogTitle>
          <DialogDescription>
            Attach an existing contact as a party on this case.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact search / picker */}
          <div className="space-y-2">
            <Label htmlFor="add-client-search">Contact</Label>
            <Input
              id="add-client-search"
              placeholder="Search contacts by name or email..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              autoComplete="off"
            />
            {selected ? (
              <div className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50/50 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {selected.firstName} {selected.lastName}
                  </p>
                  {selected.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {selected.email}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {isSearching ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    Searching...
                  </p>
                ) : results.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No contacts found.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => setSelected(c)}
                        >
                          <span className="font-medium text-foreground">
                            {c.firstName} {c.lastName}
                          </span>
                          {c.email && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {c.email}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Relationship */}
          <div className="space-y-2">
            <Label htmlFor="add-client-relationship">Relationship</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger id="add-client-relationship">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Primary toggle */}
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Primary contact
              </p>
              <p className="text-xs text-muted-foreground">
                Clears the existing primary if any.
              </p>
            </div>
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !selected}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {isPending ? "Adding..." : "Add to case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
