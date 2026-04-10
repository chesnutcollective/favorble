"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { COLORS } from "@/lib/design-tokens";
import { recordDeposit, recordWithdrawal } from "@/app/actions/trust";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";

type TrustAccount = {
  id: string;
  name: string;
  bankName: string | null;
  balanceCents: number;
};

type CasePicker = {
  id: string;
  caseNumber: string;
  clientFirstName: string | null;
  clientLastName: string | null;
};

type RecordTransactionDialogProps = {
  accounts: TrustAccount[];
  cases: CasePicker[];
};

const NO_CASE_VALUE = "__none__";

function todayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function RecordTransactionDialog({
  accounts,
  cases,
}: RecordTransactionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [accountId, setAccountId] = useState<string>(
    accounts[0]?.id ?? "",
  );
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState<string>("");
  const [caseId, setCaseId] = useState<string>(NO_CASE_VALUE);
  const [description, setDescription] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [transactionDate, setTransactionDate] = useState<string>(todayIso());

  function resetForm() {
    setAccountId(accounts[0]?.id ?? "");
    setType("deposit");
    setAmount("");
    setCaseId(NO_CASE_VALUE);
    setDescription("");
    setReferenceNumber("");
    setTransactionDate(todayIso());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!accountId) {
      toast.error("Please select a trust account.");
      return;
    }

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Please enter a valid amount greater than zero.");
      return;
    }

    const amountCents = Math.round(parsed * 100);
    const parsedDate = transactionDate
      ? new Date(`${transactionDate}T00:00:00`)
      : undefined;

    const payload = {
      trustAccountId: accountId,
      caseId: caseId === NO_CASE_VALUE ? undefined : caseId,
      amountCents,
      description: description.trim() || undefined,
      referenceNumber: referenceNumber.trim() || undefined,
      transactionDate: parsedDate,
    };

    startTransition(async () => {
      try {
        if (type === "deposit") {
          await recordDeposit(payload);
        } else {
          await recordWithdrawal(payload);
        }
        toast.success(
          type === "deposit"
            ? "Deposit recorded."
            : "Withdrawal recorded.",
        );
        resetForm();
        setOpen(false);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to record transaction.";
        toast.error(message);
      }
    });
  }

  const disabled = isPending || accounts.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          style={{ backgroundColor: COLORS.brand }}
          disabled={accounts.length === 0}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
          Record Transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Trust Transaction</DialogTitle>
          <DialogDescription>
            Log a deposit or withdrawal against one of your trust accounts.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="trust-account">Trust Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="trust-account">
                <SelectValue placeholder="Select an account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.bankName ? ` — ${a.bankName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="trust-type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) =>
                  setType(v === "withdrawal" ? "withdrawal" : "deposit")
                }
              >
                <SelectTrigger id="trust-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trust-amount">Amount (USD)</Label>
              <Input
                id="trust-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trust-case">Case (optional)</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger id="trust-case">
                <SelectValue placeholder="No case" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CASE_VALUE}>No case</SelectItem>
                {cases.map((c) => {
                  const name = [c.clientFirstName, c.clientLastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {c.caseNumber}
                      {name ? ` · ${name}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trust-date">Transaction Date</Label>
            <Input
              id="trust-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trust-description">Description (optional)</Label>
            <Textarea
              id="trust-description"
              rows={2}
              placeholder="e.g. Retainer deposit from client"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trust-reference">Reference Number (optional)</Label>
            <Input
              id="trust-reference"
              placeholder="Check #, wire ref, etc."
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
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
              disabled={disabled}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending
                ? "Saving..."
                : type === "deposit"
                  ? "Record Deposit"
                  : "Record Withdrawal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
