"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  convertLeadToCase,
  updateLeadStatus,
  updateLead,
  deleteLead,
  saveIntakeData,
  sendLeadContract,
} from "@/app/actions/leads";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Mail01Icon,
  Call02Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/shared/page-header";

type LeadDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  assignedToId: string | null;
  convertedToCaseId: string | null;
  convertedAt: string | null;
  intakeData: Record<string, unknown> | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Stage = {
  id: string;
  name: string;
  code: string;
  stageGroupId: string;
  owningTeam: string | null;
  isInitial: boolean;
  isTerminal: boolean;
};

type IntakeField = {
  id: string;
  name: string;
  slug: string;
  fieldType: string;
  isRequired: boolean;
  placeholder: string | null;
  helpText: string | null;
  options: { label: string; value: string }[] | null;
  intakeFormScript: string | null;
};

type SignatureRequest = {
  id: string;
  signerEmail: string;
  signerName: string;
  contractType: string | null;
  status: string;
  sentAt: string | null;
  signedAt: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  intake_scheduled: "Intake Scheduled",
  intake_in_progress: "Intake in Progress",
  contract_sent: "Contract Sent",
  contract_signed: "Contract Signed",
  converted: "Converted",
  declined: "Declined",
  unresponsive: "Unresponsive",
  disqualified: "Disqualified",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  new: "#3B82F6",
  contacted: "#0EA5E9",
  intake_scheduled: "#6366F1",
  intake_in_progress: "#8B5CF6",
  contract_sent: "#F59E0B",
  contract_signed: "#22C55E",
  converted: "#10B981",
  declined: "#EF4444",
  unresponsive: "#9CA3AF",
  disqualified: "#9CA3AF",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  phone: "Phone",
  walk_in: "Walk-in",
  advertisement: "Advertisement",
  social_media: "Social Media",
};

const PIPELINE_STEPS = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "intake_in_progress", label: "Intake" },
  { key: "contract_sent", label: "Contract Sent" },
  { key: "contract_signed", label: "Signed" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeadDetailClient({
  lead,
  stages,
  intakeFields,
  signatureRequests: initialSignatureRequests,
}: {
  lead: LeadDetail;
  stages: Stage[];
  intakeFields: IntakeField[];
  signatureRequests: SignatureRequest[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    source: lead.source ?? "",
    notes: lead.notes ?? "",
  });

  // Convert dialog
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertStageId, setConvertStageId] = useState("");

  // Delete confirm
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Contract dialog
  const [contractOpen, setContractOpen] = useState(false);
  const [signerEmail, setSignerEmail] = useState(lead.email ?? "");
  const [signerName, setSignerName] = useState(
    `${lead.firstName} ${lead.lastName}`,
  );
  const [signatureRequests, setSignatureRequests] = useState(
    initialSignatureRequests,
  );

  // Intake form state
  const [intakeValues, setIntakeValues] = useState<Record<string, unknown>>(
    () => {
      const existing = lead.intakeData ?? {};
      const initial: Record<string, unknown> = {};
      for (const field of intakeFields) {
        initial[field.slug] = existing[field.slug] ?? "";
      }
      return initial;
    },
  );
  const [intakeSaved, setIntakeSaved] = useState(false);

  const isConverted = lead.status === "converted";
  const isClosed =
    lead.status === "declined" ||
    lead.status === "unresponsive" ||
    lead.status === "disqualified";
  const isActive = !isConverted && !isClosed;

  const initialStages = stages.filter((s) => s.isInitial);
  const initials = `${lead.firstName[0] ?? ""}${lead.lastName[0] ?? ""}`.toUpperCase();
  const fullName = `${lead.firstName} ${lead.lastName}`;

  // Pipeline step index for progress indicator
  const currentStepIdx = PIPELINE_STEPS.findIndex(
    (s) => s.key === lead.status,
  );

  function handleAdvanceStatus() {
    const idx = PIPELINE_STEPS.findIndex((s) => s.key === lead.status);
    if (idx >= 0 && idx < PIPELINE_STEPS.length - 1) {
      const nextStatus = PIPELINE_STEPS[idx + 1].key;
      startTransition(async () => {
        await updateLeadStatus(lead.id, nextStatus);
        router.refresh();
      });
    }
  }

  function handleConvert() {
    if (!convertStageId) return;
    startTransition(async () => {
      const newCase = await convertLeadToCase(lead.id, {
        initialStageId: convertStageId,
      });
      router.push(`/cases/${newCase.id}`);
    });
  }

  function handleSaveEdit() {
    startTransition(async () => {
      await updateLead(lead.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email || null,
        phone: editForm.phone || null,
        source: editForm.source || null,
        notes: editForm.notes || null,
      });
      setEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteLead(lead.id);
      router.push("/leads");
    });
  }

  function handleSaveIntake() {
    startTransition(async () => {
      await saveIntakeData(lead.id, intakeValues);
      setIntakeSaved(true);
      router.refresh();
    });
  }

  function handleSendContract() {
    if (!signerEmail || !signerName) return;
    startTransition(async () => {
      const sigReq = await sendLeadContract(lead.id, {
        signerEmail,
        signerName,
      });
      setSignatureRequests((prev) => [
        {
          id: sigReq.id,
          signerEmail: sigReq.signerEmail,
          signerName: sigReq.signerName,
          contractType: sigReq.contractType,
          status: sigReq.status,
          sentAt: sigReq.sentAt?.toISOString() ?? null,
          signedAt: sigReq.signedAt?.toISOString() ?? null,
          createdAt: sigReq.createdAt.toISOString(),
        },
        ...prev,
      ]);
      setContractOpen(false);
      router.refresh();
    });
  }

  function handleIntakeFieldChange(slug: string, value: unknown) {
    setIntakeSaved(false);
    setIntakeValues((prev) => ({ ...prev, [slug]: value }));
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-[13px] text-[#999] hover:text-[#171717] transition-colors"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        Back to Leads
      </Link>

      {/* Page header */}
      <PageHeader
        title={fullName}
        description={`Lead created ${formatDate(lead.createdAt)}`}
        actions={
          isActive ? (
            <>
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#666] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#EF4444] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FEF2F2] transition-colors"
              >
                Delete
              </button>
              {currentStepIdx >= 0 &&
                currentStepIdx < PIPELINE_STEPS.length - 1 && (
                  <button
                    onClick={handleAdvanceStatus}
                    disabled={isPending}
                    className="px-3 py-1.5 text-[12px] font-medium text-[#666] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FAFAFA] transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
                    Advance
                  </button>
                )}
              <button
                onClick={() => setConvertOpen(true)}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#171717] rounded-[6px] hover:bg-[#333] transition-colors"
              >
                Convert to Case
              </button>
            </>
          ) : undefined
        }
      />

      {/* Pipeline Progress */}
      {!isClosed && (
        <div className="rounded-[6px] border border-[#EAEAEA] bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-3">
            Pipeline Progress
          </p>
          <div className="flex items-center gap-0">
            {PIPELINE_STEPS.map((step, idx) => {
              const isCompleted =
                isConverted || (currentStepIdx >= 0 && idx <= currentStepIdx);
              const isCurrent =
                !isConverted && idx === currentStepIdx;
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className="flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold border-2 transition-colors"
                      style={{
                        backgroundColor: isCompleted ? "#171717" : "#fff",
                        borderColor: isCompleted ? "#171717" : "#EAEAEA",
                        color: isCompleted ? "#fff" : "#999",
                      }}
                    >
                      {isCompleted && !isCurrent ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2.5 6L5 8.5L9.5 3.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <p
                      className="text-[10px] mt-1.5 text-center"
                      style={{
                        color: isCurrent ? "#171717" : "#999",
                        fontWeight: isCurrent ? 600 : 400,
                      }}
                    >
                      {step.label}
                    </p>
                  </div>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <div
                      className="h-[2px] flex-1 -mt-4"
                      style={{
                        backgroundColor:
                          isConverted ||
                          (currentStepIdx >= 0 && idx < currentStepIdx)
                            ? "#171717"
                            : "#EAEAEA",
                      }}
                    />
                  )}
                </div>
              );
            })}
            {isConverted && (
              <div className="flex items-center flex-1">
                <div
                  className="h-[2px] flex-1 -mt-4"
                  style={{ backgroundColor: "#10B981" }}
                />
                <div className="flex flex-col items-center flex-1">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold bg-[#10B981] text-white">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2.5 6L5 8.5L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="text-[10px] mt-1.5 text-center font-semibold text-[#10B981]">
                    Converted
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Closed status banner */}
      {isClosed && (
        <div className="rounded-[6px] border border-[#EAEAEA] bg-[#FAFAFA] p-4 text-center">
          <span
            className="inline-flex items-center gap-2 text-[13px] font-medium"
            style={{ color: STATUS_DOT_COLORS[lead.status] }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_DOT_COLORS[lead.status] }}
            />
            {STATUS_LABELS[lead.status] ?? lead.status}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column — Lead Info Card */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-[6px] border border-[#EAEAEA] bg-white p-5">
            {/* Avatar & Name */}
            <div className="flex items-center gap-4 mb-5 pb-5 border-b border-[#EAEAEA]">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
                style={{ backgroundColor: "#1C1C1E" }}
              >
                {initials}
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-[#171717]">
                  {fullName}
                </h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="w-[6px] h-[6px] rounded-full"
                    style={{
                      backgroundColor:
                        STATUS_DOT_COLORS[lead.status] ?? "#9CA3AF",
                    }}
                  />
                  <span className="text-[12px] text-[#666]">
                    {STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-4">
              {lead.email && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                    <HugeiconsIcon
                      icon={Mail01Icon}
                      size={11}
                      className="inline mr-1 -mt-px"
                    />
                    Email
                  </p>
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-[13px] text-[#171717] hover:underline"
                  >
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.phone && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                    <HugeiconsIcon
                      icon={Call02Icon}
                      size={11}
                      className="inline mr-1 -mt-px"
                    />
                    Phone
                  </p>
                  <a
                    href={`tel:${lead.phone}`}
                    className="text-[13px] text-[#171717] hover:underline"
                  >
                    {lead.phone}
                  </a>
                </div>
              )}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                  Source
                </p>
                <p className="text-[13px] text-[#171717]">
                  {SOURCE_LABELS[lead.source ?? ""] ?? lead.source ?? "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                  Created
                </p>
                <p className="text-[12px] font-mono text-[#666]">
                  {formatDate(lead.createdAt)}
                </p>
              </div>
              {lead.lastContactedAt && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                    Last Contact
                  </p>
                  <p className="text-[12px] font-mono text-[#666]">
                    {formatDateTime(lead.lastContactedAt)}
                  </p>
                </div>
              )}
              {isConverted && lead.convertedToCaseId && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                    Converted To
                  </p>
                  <Link
                    href={`/cases/${lead.convertedToCaseId}`}
                    className="text-[13px] text-[#171717] hover:underline font-medium"
                  >
                    View Case &rsaquo;
                  </Link>
                </div>
              )}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                  Lead ID
                </p>
                <p className="text-[11px] font-mono text-[#999]">{lead.id}</p>
              </div>
            </div>
          </div>

          {/* Notes card */}
          <div className="rounded-[6px] border border-[#EAEAEA] bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-3">
              Notes
            </p>
            {lead.notes ? (
              <p className="text-[13px] text-[#171717] whitespace-pre-wrap leading-relaxed">
                {lead.notes}
              </p>
            ) : (
              <p className="text-[13px] text-[#999]">No notes recorded.</p>
            )}
          </div>
        </div>

        {/* Right Column — Contracts, Intake */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contracts */}
          <div className="rounded-[6px] border border-[#EAEAEA] bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#666]">
                Contracts ({signatureRequests.length})
              </h3>
              {isActive && (
                <button
                  onClick={() => setContractOpen(true)}
                  disabled={isPending}
                  className="px-3 py-1.5 text-[12px] font-medium text-[#666] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FAFAFA] transition-colors disabled:opacity-50"
                >
                  Send Contract
                </button>
              )}
            </div>

            {signatureRequests.length === 0 ? (
              <p className="text-[13px] text-[#999] py-8 text-center">
                No contracts sent yet.
              </p>
            ) : (
              <div className="divide-y divide-[#EAEAEA]">
                {signatureRequests.map((sr) => (
                  <div
                    key={sr.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-[#171717]">
                        {sr.signerName}
                      </p>
                      <p className="text-[12px] text-[#999]">
                        {sr.signerEmail}
                      </p>
                      {sr.contractType && (
                        <p className="text-[11px] text-[#999] capitalize mt-0.5">
                          {sr.contractType.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className="text-[10px] font-medium uppercase tracking-wider border rounded px-1.5 py-0.5"
                        style={{
                          color:
                            sr.status === "signed"
                              ? "#22C55E"
                              : sr.status === "declined"
                                ? "#EF4444"
                                : sr.status === "sent"
                                  ? "#3B82F6"
                                  : "#999",
                          borderColor:
                            sr.status === "signed"
                              ? "#BBF7D0"
                              : sr.status === "declined"
                                ? "#FECACA"
                                : "#EAEAEA",
                        }}
                      >
                        {sr.status}
                      </span>
                      {sr.sentAt && (
                        <span className="text-[11px] font-mono text-[#999]">
                          Sent {formatDate(sr.sentAt)}
                        </span>
                      )}
                      {sr.signedAt && (
                        <span className="text-[11px] font-mono text-[#22C55E]">
                          Signed {formatDate(sr.signedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Intake Form */}
          {intakeFields.length > 0 && (
            <div className="rounded-[6px] border border-[#EAEAEA] bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#666]">
                  Intake Form
                </h3>
                {isActive && (
                  <div className="flex items-center gap-2">
                    {intakeSaved && (
                      <span className="text-[11px] text-[#22C55E]">Saved</span>
                    )}
                    <button
                      onClick={handleSaveIntake}
                      disabled={isPending}
                      className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#171717] rounded-[6px] hover:bg-[#333] transition-colors disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Save Intake"}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {intakeFields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    {field.fieldType !== "boolean" && (
                      <label className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
                        {field.name}
                        {field.isRequired && (
                          <span className="text-[#EF4444] ml-0.5">*</span>
                        )}
                      </label>
                    )}
                    {field.intakeFormScript && (
                      <p className="text-[11px] text-[#3B82F6] italic mb-1">
                        Script: &quot;{field.intakeFormScript}&quot;
                      </p>
                    )}
                    {renderIntakeField(
                      field,
                      intakeValues[field.slug],
                      handleIntakeFieldChange,
                    )}
                    {field.helpText && (
                      <p className="text-[11px] text-[#999]">
                        {field.helpText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Read-only intake data (when no field definitions available) */}
          {lead.intakeData &&
            Object.keys(lead.intakeData).length > 0 &&
            intakeFields.length === 0 && (
              <div className="rounded-[6px] border border-[#EAEAEA] bg-white p-5">
                <h3 className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#666] mb-4">
                  Intake Data
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(lead.intakeData).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="text-[13px] text-[#171717]">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>

      {/* ─── Dialogs ─── */}

      {/* Edit Dialog */}
      {editing && (
        <DialogOverlay onClose={() => setEditing(false)}>
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#171717]">
              Edit Lead
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                  First Name
                </label>
                <input
                  type="text"
                  value={editForm.firstName}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, firstName: e.target.value }))
                  }
                  className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                  Last Name
                </label>
                <input
                  type="text"
                  value={editForm.lastName}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, lastName: e.target.value }))
                  }
                  className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                Email
              </label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, email: e.target.value }))
                }
                className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                Phone
              </label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, phone: e.target.value }))
                }
                className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                Source
              </label>
              <select
                value={editForm.source}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, source: e.target.value }))
                }
                className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors bg-white"
              >
                <option value="">Unknown</option>
                {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                Notes
              </label>
              <textarea
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, notes: e.target.value }))
                }
                rows={4}
                className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#666] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isPending || !editForm.firstName || !editForm.lastName}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#171717] rounded-[6px] hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}

      {/* Delete Confirm Dialog */}
      {deleteOpen && (
        <DialogOverlay onClose={() => setDeleteOpen(false)}>
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#171717]">
              Delete Lead
            </h3>
            <p className="text-[13px] text-[#666]">
              Are you sure you want to delete the lead for{" "}
              <span className="font-medium text-[#171717]">{fullName}</span>?
              This action can be undone by an administrator.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteOpen(false)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#666] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#EF4444] rounded-[6px] hover:bg-[#DC2626] transition-colors disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete Lead"}
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}

      {/* Convert to Case Dialog */}
      {convertOpen && (
        <DialogOverlay onClose={() => setConvertOpen(false)}>
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#171717]">
              Convert Lead to Case
            </h3>
            <p className="text-[13px] text-[#666]">
              This will create a new case for{" "}
              <span className="font-medium text-[#171717]">{fullName}</span> and
              mark this lead as converted. A contact record will be created
              automatically.
            </p>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                Initial Stage
              </label>
              <select
                value={convertStageId}
                onChange={(e) => setConvertStageId(e.target.value)}
                className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors bg-white"
              >
                <option value="">Select initial stage...</option>
                {(initialStages.length > 0 ? initialStages : stages).map(
                  (s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="rounded-[6px] bg-[#FAFAFA] border border-[#EAEAEA] p-3 text-[12px] text-[#666]">
              <p className="font-medium text-[#171717] mb-1.5">
                What will happen:
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  A new contact record for {fullName}
                </li>
                <li>A new case linked to this lead</li>
                <li>Lead status updated to &quot;Converted&quot;</li>
                {lead.intakeData &&
                  Object.keys(lead.intakeData).length > 0 && (
                    <li>Intake data auto-populated as custom field values</li>
                  )}
                <li>Any workflows for the initial stage will run</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConvertOpen(false)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#666] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConvert}
                disabled={!convertStageId || isPending}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#171717] rounded-[6px] hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {isPending ? "Converting..." : "Convert to Case"}
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}

      {/* Send Contract Dialog */}
      {contractOpen && (
        <DialogOverlay onClose={() => setContractOpen(false)}>
          <div className="space-y-4">
            <h3 className="text-[15px] font-semibold text-[#171717]">
              Send Contract
            </h3>
            <p className="text-[13px] text-[#666]">
              Send a retainer agreement to{" "}
              <span className="font-medium text-[#171717]">{fullName}</span> for
              electronic signature.
            </p>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                Signer Name
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#999] mb-1 block">
                Signer Email
              </label>
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors"
              />
            </div>
            <div className="rounded-[6px] bg-[#FAFAFA] border border-[#EAEAEA] p-3 text-[12px] text-[#999]">
              The contract will be tracked here. Actual signing happens through
              your external eSignature provider.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setContractOpen(false)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#666] border border-[#EAEAEA] rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendContract}
                disabled={!signerEmail || !signerName || isPending}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#171717] rounded-[6px] hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {isPending ? "Sending..." : "Send Contract"}
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}
    </div>
  );
}

/* ─── Lightweight Dialog Overlay ─── */
function DialogOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-[6px] border border-[#EAEAEA] p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

/* ─── Intake Field Renderer ─── */
function renderIntakeField(
  field: IntakeField,
  value: unknown,
  onChange: (slug: string, value: unknown) => void,
) {
  const inputClasses =
    "w-full rounded-[6px] border border-[#EAEAEA] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#999] transition-colors";

  switch (field.fieldType) {
    case "textarea":
      return (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(field.slug, e.target.value)}
          placeholder={field.placeholder ?? ""}
          rows={3}
          className={`${inputClasses} resize-none`}
        />
      );
    case "number":
    case "currency":
      return (
        <input
          type="number"
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              field.slug,
              e.target.value ? Number(e.target.value) : "",
            )
          }
          placeholder={field.placeholder ?? ""}
          className={inputClasses}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={String(value ?? "")}
          onChange={(e) => onChange(field.slug, e.target.value)}
          className={inputClasses}
        />
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.slug, e.target.checked)}
            className="rounded border-[#EAEAEA] text-[#171717] focus:ring-0"
          />
          <span className="text-[13px] text-[#171717]">{field.name}</span>
        </label>
      );
    case "select":
      return (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(field.slug, e.target.value)}
          className={`${inputClasses} bg-white`}
        >
          <option value="">{field.placeholder ?? "Select..."}</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          type={
            field.fieldType === "email"
              ? "email"
              : field.fieldType === "phone"
                ? "tel"
                : "text"
          }
          value={String(value ?? "")}
          onChange={(e) => onChange(field.slug, e.target.value)}
          placeholder={field.placeholder ?? ""}
          className={inputClasses}
        />
      );
  }
}
