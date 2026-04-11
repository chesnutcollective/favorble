"use client";

import { useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { COLORS } from "@/lib/design-tokens";
import { createInvoice } from "@/app/actions/billing";

type CaseOption = {
  id: string;
  caseNumber: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
};

type ClientOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type NewInvoiceDialogProps = {
  cases: CaseOption[];
  clients: ClientOption[];
};

const NO_CASE = "__none__";
const NO_CLIENT = "__none__";

export function NewInvoiceDialog({ cases, clients }: NewInvoiceDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [caseId, setCaseId] = useState<string>(NO_CASE);
  const [clientContactId, setClientContactId] = useState<string>(NO_CLIENT);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setCaseId(NO_CASE);
    setClientContactId(NO_CLIENT);
    setDueDate("");
    setNotes("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const row = await createInvoice({
          caseId: caseId === NO_CASE ? undefined : caseId,
          clientContactId:
            clientContactId === NO_CLIENT ? undefined : clientContactId,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          notes: notes.trim() || undefined,
        });
        reset();
        setOpen(false);
        if (row?.id) {
          router.push(`/billing/invoices/${row.id}`);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create invoice.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" style={{ backgroundColor: COLORS.brand }}>
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
          New Invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>
              Create a draft invoice. You can add line items next.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-case">Case</Label>
              <Select value={caseId} onValueChange={setCaseId}>
                <SelectTrigger id="invoice-case">
                  <SelectValue placeholder="Select a case (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CASE}>No case</SelectItem>
                  {cases.map((c) => {
                    const client =
                      c.clientFirstName || c.clientLastName
                        ? `${c.clientFirstName ?? ""} ${c.clientLastName ?? ""}`.trim()
                        : "No client";
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.caseNumber ?? "—"} · {client}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-client">Client</Label>
              <Select
                value={clientContactId}
                onValueChange={setClientContactId}
              >
                <SelectTrigger id="invoice-client">
                  <SelectValue placeholder="Select a client (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client contact</SelectItem>
                  {clients.map((c) => {
                    const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {name || c.email || "Unnamed"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-due">Due date</Label>
              <Input
                id="invoice-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-notes">Notes</Label>
              <Textarea
                id="invoice-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for the client"
                rows={3}
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: COLORS.bad }}>
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Creating..." : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
