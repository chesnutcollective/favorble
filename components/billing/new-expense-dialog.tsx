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
import { Checkbox } from "@/components/ui/checkbox";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { COLORS } from "@/lib/design-tokens";
import { createExpense } from "@/app/actions/billing";

type CaseOption = {
  id: string;
  caseNumber: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
};

type NewExpenseDialogProps = {
  cases: CaseOption[];
};

const NO_CASE = "__none__";

const EXPENSE_TYPES = [
  { value: "filing_fee", label: "Filing Fee" },
  { value: "medical_record_fee", label: "Medical Record Fee" },
  { value: "copy", label: "Copy" },
  { value: "mileage", label: "Mileage" },
  { value: "other", label: "Other" },
] as const;

export function NewExpenseDialog({ cases }: NewExpenseDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [caseId, setCaseId] = useState<string>(NO_CASE);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseType, setExpenseType] = useState<string>("other");
  const [reimbursable, setReimbursable] = useState(true);
  const [incurredDate, setIncurredDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );

  function reset() {
    setCaseId(NO_CASE);
    setDescription("");
    setAmount("");
    setExpenseType("other");
    setReimbursable(true);
    setIncurredDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid amount greater than $0.");
      return;
    }
    const amountCents = Math.round(parsed * 100);

    startTransition(async () => {
      try {
        await createExpense({
          caseId: caseId === NO_CASE ? undefined : caseId,
          description: description.trim(),
          amountCents,
          expenseType: expenseType as
            | "filing_fee"
            | "medical_record_fee"
            | "copy"
            | "mileage"
            | "other",
          reimbursable,
          incurredDate: incurredDate ? new Date(incurredDate) : undefined,
        });
        reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create expense.",
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
          <HugeiconsIcon icon={PlusSignIcon} size={14} aria-hidden="true" />
          New Expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New Expense</DialogTitle>
            <DialogDescription>
              Record a case-related expense for billing or reimbursement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="expense-description">Description</Label>
              <Input
                id="expense-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Court filing fee"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expense-amount">Amount ($)</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-type">Type</Label>
                <Select value={expenseType} onValueChange={setExpenseType}>
                  <SelectTrigger id="expense-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-case">Case</Label>
              <Select value={caseId} onValueChange={setCaseId}>
                <SelectTrigger id="expense-case">
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
                        {c.caseNumber ?? "\u2014"} \u00b7 {client}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="expense-date">Date incurred</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={incurredDate}
                  onChange={(e) => setIncurredDate(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Checkbox
                  checked={reimbursable}
                  onCheckedChange={(v) => setReimbursable(v === true)}
                />
                <span>Reimbursable</span>
              </label>
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
              {isPending ? "Saving..." : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
