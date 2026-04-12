"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Mail01Icon,
  MailSend02Icon,
  InboxIcon,
  ScanIcon,
  ClipboardIcon,
  DeliveryTruck01Icon,
  InboxCheckIcon,
} from "@hugeicons/core-free-icons";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

import {
  addOutboundMail,
  markOutboundDelivered,
  processInboundMail,
  searchCasesForMail,
  type InboundMailItem,
  type MailCategory,
  type MailSearchResult,
  type OutboundMailItem,
  type OutboundMailType,
} from "@/app/actions/mail";
import { COLORS } from "@/lib/design-tokens";

// Design tokens --------------------------------------------------------------
const BRAND = COLORS.brand;
const STATUS_OK = COLORS.ok;
const STATUS_WARN = COLORS.warn;
const STATUS_URGENT = COLORS.bad;
const BRAND_SOFT = COLORS.brandSubtle;

const CATEGORY_LABELS: Record<MailCategory, string> = {
  medical_record: "Medical Record",
  ssa_correspondence: "SSA Correspondence",
  hearing_notice: "Hearing Notice",
  decision: "Decision",
  other: "Other",
};

const MAIL_TYPE_LABELS: Record<OutboundMailType, string> = {
  certified: "Certified",
  regular: "Regular",
  fedex: "FedEx",
  ups: "UPS",
};

function ageColor(days: number): string {
  if (days >= 7) return STATUS_URGENT;
  if (days >= 3) return STATUS_WARN;
  return STATUS_OK;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatClaimant(first: string | null, last: string | null): string {
  if (!first && !last) return "Unassigned";
  return `${last ?? ""}${last && first ? ", " : ""}${first ?? ""}`.trim();
}

// ----------------------------------------------------------------------------

export function MailWorkspaceClient({
  initialInbound,
  initialOutbound,
}: {
  initialInbound: InboundMailItem[];
  initialOutbound: OutboundMailItem[];
}) {
  const [inbound, setInbound] = useState(initialInbound);
  const [outbound, setOutbound] = useState(initialOutbound);

  useEffect(() => setInbound(initialInbound), [initialInbound]);
  useEffect(() => setOutbound(initialOutbound), [initialOutbound]);

  // Processing dialog state
  const [processingItem, setProcessingItem] = useState<InboundMailItem | null>(
    null,
  );

  // Outbound create dialog
  const [addingOutbound, setAddingOutbound] = useState(false);

  return (
    <div className="space-y-6">
      {/* Top: Quick search */}
      <CaseSearchSection onOpenProcessing={(item) => setProcessingItem(item)} />

      {/* Middle: Inbound queue */}
      <InboundQueueSection
        items={inbound}
        onProcess={(item) => setProcessingItem(item)}
      />

      {/* Bottom: Outbound tracking */}
      <OutboundQueueSection
        items={outbound}
        onAddClick={() => setAddingOutbound(true)}
        onMarkDelivered={async (id) => {
          await markOutboundDelivered(id, new Date());
          setOutbound((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    deliveredAt: new Date().toISOString(),
                    deliveryStatus: "delivered" as const,
                  }
                : m,
            ),
          );
        }}
      />

      {/* Dialogs */}
      <ProcessMailDialog
        item={processingItem}
        onClose={() => setProcessingItem(null)}
        onProcessed={(id) => {
          setInbound((prev) => prev.filter((i) => i.id !== id));
          setProcessingItem(null);
        }}
      />
      <AddOutboundDialog
        open={addingOutbound}
        onClose={() => setAddingOutbound(false)}
        onAdded={(item) => {
          setOutbound((prev) => [item, ...prev]);
          setAddingOutbound(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search section
// ---------------------------------------------------------------------------

function CaseSearchSection({
  onOpenProcessing: _onOpenProcessing,
}: {
  onOpenProcessing: (item: InboundMailItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MailSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selected, setSelected] = useState<MailSearchResult | null>(null);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const rows = await searchCasesForMail(trimmed);
        setResults(rows);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[activeIdx];
      if (pick) setSelected(pick);
    }
  };

  return (
    <Card
      className="p-4 sm:p-5"
      style={{ borderRadius: 10, borderColor: "#E5E7EB" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded"
          style={{ backgroundColor: BRAND_SOFT, color: BRAND }}
        >
          <HugeiconsIcon icon={ScanIcon} size={16} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.2px]">
            Scan &amp; Match
          </h2>
          <p className="text-[12px] text-[#666]">
            Search by name, case number, SSN last 4, or date of birth.
          </p>
        </div>
      </div>

      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]"
        />
        <Input
          placeholder="Start typing a claimant name or case number..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-10 h-11 text-[14px]"
          style={{ borderRadius: 10 }}
          autoComplete="off"
        />
      </div>

      {/* Results */}
      <div className="mt-3">
        {query.trim().length < 2 ? (
          <p className="text-[12px] text-[#888] px-1">
            Type at least 2 characters to search.
          </p>
        ) : loading ? (
          <p className="text-[12px] text-[#888] px-1">Searching…</p>
        ) : results.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#E5E7EB] py-6">
            <EmptyState
              icon={Search01Icon}
              title="No matches"
              description="No cases matched your search. Try a different spelling or a case number."
            />
          </div>
        ) : (
          <ul
            className="divide-y divide-[#F1F1F4] rounded-md border border-[#E9EAF0] bg-white overflow-hidden"
            role="listbox"
          >
            {results.map((r, idx) => {
              const active = idx === activeIdx;
              return (
                <li
                  key={r.caseId}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => setSelected(r)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                    active ? "" : "hover:bg-[#FAFAFC]",
                  )}
                  style={active ? { backgroundColor: BRAND_SOFT } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[14px] font-semibold text-[#111]">
                        {formatClaimant(
                          r.claimantFirstName,
                          r.claimantLastName,
                        )}
                      </p>
                      <code
                        className="text-[12px] text-[#555]"
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {r.caseNumber}
                      </code>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#666]">
                      {r.ssnLast4 && <span>SSN ●●●-●●-{r.ssnLast4}</span>}
                      {r.dateOfBirth && (
                        <span>DOB {formatDate(r.dateOfBirth)}</span>
                      )}
                      {r.stageName && (
                        <span
                          className="inline-flex items-center gap-1.5"
                          style={{ color: r.stageColor ?? STATUS_OK }}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor: r.stageColor ?? STATUS_OK,
                            }}
                          />
                          {r.stageName}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-[12px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(r);
                    }}
                  >
                    Attach mail
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SelectedCasePanel result={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

function SelectedCasePanel({
  result,
  onClose,
}: {
  result: MailSearchResult | null;
  onClose: () => void;
}) {
  if (!result) return null;
  return (
    <div
      className="mt-4 rounded-md border p-3"
      style={{ borderColor: BRAND, backgroundColor: BRAND_SOFT }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#555]">
            Selected case
          </p>
          <p className="text-[15px] font-semibold text-[#111]">
            {formatClaimant(result.claimantFirstName, result.claimantLastName)}
          </p>
          <code
            className="text-[12px] text-[#333]"
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {result.caseNumber}
          </code>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Clear
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-[#555]">
        Next step: scan the physical mail into the inbound queue, then attach it
        to this case from the queue below.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbound queue
// ---------------------------------------------------------------------------

function InboundQueueSection({
  items,
  onProcess,
}: {
  items: InboundMailItem[];
  onProcess: (item: InboundMailItem) => void;
}) {
  const urgentCount = useMemo(
    () => items.filter((i) => i.ageInDays >= 7).length,
    [items],
  );

  return (
    <Card
      className="p-4 sm:p-5"
      style={{ borderRadius: 10, borderColor: "#E5E7EB" }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded"
            style={{ backgroundColor: BRAND_SOFT, color: BRAND }}
          >
            <HugeiconsIcon icon={InboxIcon} size={16} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.2px]">
              Inbound Queue
            </h2>
            <p className="text-[12px] text-[#666]">
              {items.length} item{items.length === 1 ? "" : "s"} awaiting
              processing
              {urgentCount > 0 && (
                <span style={{ color: STATUS_URGENT }}>
                  {" "}
                  · {urgentCount} urgent
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#E5E7EB] py-6">
          <EmptyState
            icon={InboxCheckIcon}
            title="Queue is clear"
            description="No inbound mail is waiting. New scans will appear here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-[#F1F1F4] rounded-md border border-[#E9EAF0] overflow-hidden">
          {items.map((item) => {
            const color = ageColor(item.ageInDays);
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-[#FAFAFC]"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                  style={{ backgroundColor: BRAND_SOFT, color: BRAND }}
                >
                  <HugeiconsIcon icon={Mail01Icon} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-[14px] font-semibold text-[#111]">
                      {item.fileName}
                    </p>
                    {item.caseNumber && (
                      <code
                        className="text-[12px] text-[#555]"
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {item.caseNumber}
                      </code>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#666]">
                    <span>
                      {formatClaimant(
                        item.claimantFirstName,
                        item.claimantLastName,
                      )}
                    </span>
                    <span>Received {formatDate(item.receivedAt)}</span>
                    <span style={{ color }}>
                      {item.ageInDays === 0
                        ? "today"
                        : `${item.ageInDays}d old`}
                    </span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0"
                  style={{
                    color,
                    borderColor: color,
                    backgroundColor: "white",
                  }}
                >
                  {item.ageInDays >= 7
                    ? "Urgent"
                    : item.ageInDays >= 3
                      ? "Aging"
                      : "New"}
                </Badge>
                <Button
                  size="sm"
                  className="shrink-0 text-white"
                  style={{ backgroundColor: BRAND }}
                  onClick={() => onProcess(item)}
                >
                  Process
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Outbound queue
// ---------------------------------------------------------------------------

function OutboundQueueSection({
  items,
  onAddClick,
  onMarkDelivered,
}: {
  items: OutboundMailItem[];
  onAddClick: () => void;
  onMarkDelivered: (id: string) => Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  return (
    <Card
      className="p-4 sm:p-5"
      style={{ borderRadius: 10, borderColor: "#E5E7EB" }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded"
            style={{ backgroundColor: BRAND_SOFT, color: BRAND }}
          >
            <HugeiconsIcon icon={MailSend02Icon} size={16} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.2px]">
              Outbound Mail
            </h2>
            <p className="text-[12px] text-[#666]">
              Certified and standard mail sent from the firm
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="text-white"
          style={{ backgroundColor: BRAND }}
          onClick={onAddClick}
        >
          <HugeiconsIcon icon={MailSend02Icon} size={14} className="mr-1.5" />
          Log outbound
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#E5E7EB] py-6">
          <EmptyState
            icon={DeliveryTruck01Icon}
            title="Nothing sent yet"
            description="Log outbound mail to track certified numbers and delivery status."
          />
        </div>
      ) : (
        <ul className="divide-y divide-[#F1F1F4] rounded-md border border-[#E9EAF0] overflow-hidden">
          {items.map((m) => {
            const delivered = m.deliveryStatus === "delivered";
            const color = delivered ? STATUS_OK : STATUS_WARN;
            return (
              <li
                key={m.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-[#FAFAFC]"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                  style={{ backgroundColor: BRAND_SOFT, color: BRAND }}
                >
                  <HugeiconsIcon
                    icon={delivered ? InboxCheckIcon : DeliveryTruck01Icon}
                    size={16}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-[14px] font-semibold text-[#111]">
                      {m.recipientName}
                    </p>
                    {m.caseNumber && (
                      <code
                        className="text-[12px] text-[#555]"
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {m.caseNumber}
                      </code>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#666]">
                    <span>{MAIL_TYPE_LABELS[m.mailType]}</span>
                    {m.trackingNumber && (
                      <code
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {m.trackingNumber}
                      </code>
                    )}
                    <span>Sent {formatDate(m.sentAt)}</span>
                    {delivered && (
                      <span style={{ color: STATUS_OK }}>
                        Delivered {formatDate(m.deliveredAt)}
                      </span>
                    )}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0"
                  style={{
                    color,
                    borderColor: color,
                    backgroundColor: "white",
                  }}
                >
                  {delivered ? "Delivered" : "In transit"}
                </Badge>
                {!delivered && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingId === m.id}
                    onClick={async () => {
                      setPendingId(m.id);
                      try {
                        await onMarkDelivered(m.id);
                      } finally {
                        setPendingId(null);
                      }
                    }}
                  >
                    Mark delivered
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Process Mail Dialog
// ---------------------------------------------------------------------------

function ProcessMailDialog({
  item,
  onClose,
  onProcessed,
}: {
  item: InboundMailItem | null;
  onClose: () => void;
  onProcessed: (id: string) => void;
}) {
  const [category, setCategory] = useState<MailCategory>("medical_record");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setCategory((item.category as MailCategory | null) ?? "medical_record");
      setNotes(item.notes ?? "");
      setError(null);
    }
  }, [item]);

  const handleSave = () => {
    if (!item) return;
    setError(null);
    startTransition(async () => {
      try {
        await processInboundMail(item.id, category, notes);
        onProcessed(item.id);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to process this mail.",
        );
      }
    });
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={ClipboardIcon} size={18} color={BRAND} />
            Process inbound mail
          </DialogTitle>
          <DialogDescription>
            Categorize, add notes, and mark this document as processed.
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            <div
              className="rounded-md border p-3"
              style={{ borderColor: "#E5E7EB", backgroundColor: "#F8F9FC" }}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#666]">
                Scanned document
              </p>
              <p className="text-[14px] font-semibold text-[#111]">
                {item.fileName}
              </p>
              <p className="text-[12px] text-[#666]">
                {item.caseNumber ? `${item.caseNumber} · ` : "Unassigned · "}
                {formatClaimant(item.claimantFirstName, item.claimantLastName)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#444]">
                Category
              </label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as MailCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as MailCategory[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CATEGORY_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#444]">
                Notes
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional: describe what's in the envelope..."
                rows={3}
              />
            </div>

            {error && (
              <p className="text-[12px]" style={{ color: STATUS_URGENT }}>
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: BRAND }}
            onClick={handleSave}
            disabled={isPending || !item}
          >
            {isPending ? "Processing…" : "Mark processed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add Outbound Dialog
// ---------------------------------------------------------------------------

function AddOutboundDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (item: OutboundMailItem) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [address, setAddress] = useState("");
  const [mailType, setMailType] = useState<OutboundMailType>("certified");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const [caseResults, setCaseResults] = useState<MailSearchResult[]>([]);
  const [selectedCase, setSelectedCase] = useState<MailSearchResult | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setRecipient("");
    setAddress("");
    setMailType("certified");
    setTrackingNumber("");
    setNotes("");
    setCaseSearch("");
    setCaseResults([]);
    setSelectedCase(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const trimmed = caseSearch.trim();
    if (trimmed.length < 2) {
      setCaseResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const rows = await searchCasesForMail(trimmed);
        setCaseResults(rows);
      } catch {
        setCaseResults([]);
      }
    }, 250);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [caseSearch]);

  const handleSave = () => {
    if (!recipient.trim()) {
      setError("Recipient is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const row = await addOutboundMail(
          selectedCase?.caseId ?? null,
          recipient.trim(),
          trackingNumber.trim() || null,
          mailType,
          notes.trim() || null,
          address.trim() || undefined,
        );
        onAdded({
          id: row.id,
          caseId: row.caseId ?? null,
          caseNumber: selectedCase?.caseNumber ?? null,
          recipientName: row.recipientName,
          recipientAddress: row.recipientAddress ?? null,
          mailType: row.mailType,
          trackingNumber: row.trackingNumber ?? null,
          sentAt: row.sentAt.toISOString(),
          deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
          notes: row.notes ?? null,
          deliveryStatus: "in_transit",
        });
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to log outbound mail.",
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={MailSend02Icon} size={18} color={BRAND} />
            Log outbound mail
          </DialogTitle>
          <DialogDescription>
            Track certified tracking numbers and recipients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Case search */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#444]">
              Link to case (optional)
            </label>
            {selectedCase ? (
              <div
                className="flex items-center justify-between gap-2 rounded-md border p-2"
                style={{ borderColor: BRAND, backgroundColor: BRAND_SOFT }}
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[#111]">
                    {formatClaimant(
                      selectedCase.claimantFirstName,
                      selectedCase.claimantLastName,
                    )}
                  </p>
                  <code
                    className="text-[11px] text-[#555]"
                    style={{
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {selectedCase.caseNumber}
                  </code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCase(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#888]"
                  />
                  <Input
                    placeholder="Search cases..."
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {caseResults.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-md border border-[#E9EAF0]">
                    {caseResults.map((r) => (
                      <li
                        key={r.caseId}
                        className="cursor-pointer px-2.5 py-1.5 text-[13px] hover:bg-[#FAFAFC]"
                        onClick={() => {
                          setSelectedCase(r);
                          setRecipient(
                            formatClaimant(
                              r.claimantFirstName,
                              r.claimantLastName,
                            ),
                          );
                          setCaseResults([]);
                          setCaseSearch("");
                        }}
                      >
                        <span className="font-semibold">
                          {formatClaimant(
                            r.claimantFirstName,
                            r.claimantLastName,
                          )}
                        </span>{" "}
                        <code
                          className="text-[11px] text-[#666]"
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {r.caseNumber}
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#444]">
                Recipient
              </label>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Recipient name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#444]">
                Type
              </label>
              <Select
                value={mailType}
                onValueChange={(v) => setMailType(v as OutboundMailType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MAIL_TYPE_LABELS) as OutboundMailType[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {MAIL_TYPE_LABELS[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#444]">
              Address (optional)
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, City, State ZIP"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#444]">
              Tracking number
            </label>
            <Input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="9400 1000 0000 0000 0000 00"
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#444]">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-[12px]" style={{ color: STATUS_URGENT }}>
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: BRAND }}
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Log mail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
