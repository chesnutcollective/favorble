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
import {
  CheckmarkCircle01Icon,
  Download01Icon,
  FileDownloadIcon,
  Mail01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { COLORS } from "@/lib/design-tokens";
import {
  addInvoiceLineItem,
  addUnbilledTimeToInvoice,
  markInvoicePaid,
  sendInvoice,
} from "@/app/actions/billing";

type InvoiceDetailActionsProps = {
  invoiceId: string;
  caseId: string | null;
  status: string;
  outstandingCents: number;
  defaultSendEmail?: string | null;
};

type LineItemType = "time" | "expense" | "fee" | "other";
type PaymentMethod =
  | "check"
  | "ach"
  | "credit_card"
  | "trust_transfer"
  | "other";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// -------------- Header actions (Send / Mark Paid / Download PDF) --------------

export function InvoiceHeaderActions({
  invoiceId,
  status,
  outstandingCents,
  defaultSendEmail,
}: Omit<InvoiceDetailActionsProps, "caseId">) {
  const isTerminal = status === "paid" || status === "void";

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a
          href={`/api/billing/invoices/${invoiceId}/pdf`}
          download
          rel="noopener"
        >
          <HugeiconsIcon icon={FileDownloadIcon} size={14} />
          Download PDF
        </a>
      </Button>

      <SendInvoiceDialog
        invoiceId={invoiceId}
        defaultEmail={defaultSendEmail ?? ""}
        disabled={isTerminal}
      />

      <MarkPaidDialog
        invoiceId={invoiceId}
        outstandingCents={outstandingCents}
        disabled={isTerminal}
      />
    </div>
  );
}

// -------------- Send Invoice Dialog --------------

function SendInvoiceDialog({
  invoiceId,
  defaultEmail,
  disabled,
}: {
  invoiceId: string;
  defaultEmail: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    startTransition(async () => {
      try {
        await sendInvoice({ id: invoiceId, email: email.trim() });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send invoice.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setEmail(defaultEmail);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <HugeiconsIcon icon={Mail01Icon} size={14} />
          Send
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Send invoice</DialogTitle>
            <DialogDescription>
              Mark this invoice as sent and record the recipient email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="send-email">Recipient email</Label>
            <Input
              id="send-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              required
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: COLORS.bad }}>
              {error}
            </p>
          )}

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
              {isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -------------- Mark Paid Dialog --------------

function MarkPaidDialog({
  invoiceId,
  outstandingCents,
  disabled,
}: {
  invoiceId: string;
  outstandingCents: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultAmount = (Math.max(outstandingCents, 0) / 100).toFixed(2);
  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<PaymentMethod>("check");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setAmount(defaultAmount);
    setMethod("check");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setNotes("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const dollars = Number.parseFloat(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    const cents = Math.round(dollars * 100);

    startTransition(async () => {
      try {
        await markInvoicePaid(invoiceId, {
          amountCents: cents,
          paymentMethod: method,
          paymentDate: paymentDate ? new Date(paymentDate) : undefined,
          referenceNumber: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to record payment.",
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
        <Button
          size="sm"
          style={{ backgroundColor: COLORS.brand }}
          disabled={disabled}
        >
          <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
          Mark Paid
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Outstanding balance: {formatCurrency(outstandingCents)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paid-amount">Amount (USD)</Label>
                <Input
                  id="paid-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid-method">Method</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as PaymentMethod)}
                >
                  <SelectTrigger id="paid-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="ach">ACH</SelectItem>
                    <SelectItem value="credit_card">Credit card</SelectItem>
                    <SelectItem value="trust_transfer">
                      Trust transfer
                    </SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paid-date">Payment date</Label>
                <Input
                  id="paid-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid-ref">Reference #</Label>
                <Input
                  id="paid-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paid-notes">Notes</Label>
              <Textarea
                id="paid-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional"
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
              {isPending ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -------------- Add Line Item Dialog --------------

export function AddLineItemDialog({
  invoiceId,
  disabled,
}: {
  invoiceId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<LineItemType>("other");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  function reset() {
    setType("other");
    setDescription("");
    setQuantity("1");
    setUnitPrice("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    const qty = Number.parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    const price = Number.parseFloat(unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid unit price.");
      return;
    }
    const unitPriceCents = Math.round(price * 100);

    startTransition(async () => {
      try {
        await addInvoiceLineItem({
          invoiceId,
          type,
          description: description.trim(),
          quantity: qty,
          unitPriceCents,
        });
        reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to add line item.",
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
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 text-xs"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} />
          Add Line Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add line item</DialogTitle>
            <DialogDescription>
              Add a time, expense, fee, or custom line to this invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="li-type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as LineItemType)}
              >
                <SelectTrigger id="li-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time">Time</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="fee">Fee</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="li-description">Description</Label>
              <Textarea
                id="li-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="li-qty">Quantity</Label>
                <Input
                  id="li-qty"
                  type="number"
                  step="0.001"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="li-price">Unit price (USD)</Label>
                <Input
                  id="li-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  required
                />
              </div>
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
              {isPending ? "Adding..." : "Add line item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -------------- Import Unbilled Time Button --------------

export function ImportUnbilledTimeButton({
  invoiceId,
  disabled,
}: {
  invoiceId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        "Import all unbilled billable time from this case as line items?",
      )
    ) {
      return;
    }
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await addUnbilledTimeToInvoice({ invoiceId });
        if (result.imported === 0) {
          setMessage({
            kind: "ok",
            text: "No unbilled time entries found for this case.",
          });
        } else {
          setMessage({
            kind: "ok",
            text: `Imported ${result.imported} entr${result.imported === 1 ? "y" : "ies"} (${formatCurrency(result.totalCents)}).`,
          });
        }
        router.refresh();
      } catch (err) {
        setMessage({
          kind: "err",
          text: err instanceof Error ? err.message : "Failed to import time.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={disabled || isPending}
        className="h-8 text-xs"
      >
        <HugeiconsIcon icon={Download01Icon} size={12} />
        {isPending ? "Importing..." : "Import Unbilled Time"}
      </Button>
      {message && (
        <p
          className="text-[11px]"
          style={{
            color: message.kind === "ok" ? COLORS.ok : COLORS.bad,
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
