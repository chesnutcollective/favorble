"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { usePortalImpersonation } from "@/components/portal/portal-impersonation-context";
import { submitTreatmentEntry } from "@/app/actions/client-treatment-log";

type Props = {
  caseId: string;
  isSpanish: boolean;
};

const REASON_OPTIONS_EN: Array<{ value: string; label: string }> = [
  { value: "primary_care", label: "Primary care" },
  { value: "specialist", label: "Specialist" },
  { value: "er", label: "Emergency room" },
  { value: "hospital", label: "Hospital stay" },
  { value: "therapy", label: "Therapy (physical, mental, occupational)" },
  { value: "diagnostic", label: "Diagnostic (imaging, lab)" },
  { value: "other", label: "Other" },
];

const REASON_OPTIONS_ES: Array<{ value: string; label: string }> = [
  { value: "primary_care", label: "Médico de cabecera" },
  { value: "specialist", label: "Especialista" },
  { value: "er", label: "Sala de emergencias" },
  { value: "hospital", label: "Hospitalización" },
  { value: "therapy", label: "Terapia (física, mental, ocupacional)" },
  { value: "diagnostic", label: "Diagnóstico (imagen, laboratorio)" },
  { value: "other", label: "Otro" },
];

/**
 * Claimant form for logging a single visit. Uses native inputs throughout
 * (mobile-friendly calendar + picker) and the existing portal upload path
 * for receipts.
 */
export function TreatmentLogForm({ caseId, isSpanish }: Props) {
  const router = useRouter();
  const { isImpersonating } = usePortalImpersonation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [providerName, setProviderName] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [reason, setReason] = useState<string>("primary_care");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = isSpanish ? REASON_OPTIONS_ES : REASON_OPTIONS_EN;

  const disabled = isImpersonating || isPending;

  if (isImpersonating) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-[14px] text-amber-900">
        {isSpanish
          ? "Este formulario es de solo lectura mientras se previsualiza el portal."
          : "This form is read-only while previewing the portal."}
      </div>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!providerName.trim() || !visitDate) {
      setError(
        isSpanish
          ? "Por favor complete el proveedor y la fecha."
          : "Please fill in the provider and date.",
      );
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.set("caseId", caseId);
    formData.set("providerName", providerName.trim());
    formData.set("visitDate", visitDate);
    formData.set("reason", reason);
    if (notes.trim()) formData.set("notes", notes.trim());
    if (receipt) formData.set("receiptFile", receipt);

    startTransition(async () => {
      const result = await submitTreatmentEntry(formData);
      if ("success" in result && result.success) {
        toast.success(
          isSpanish ? "Visita registrada" : "Visit logged",
        );
        router.push("/portal/treatment-log");
        router.refresh();
      } else {
        setError(
          "error" in result
            ? result.error
            : isSpanish
              ? "No pudimos guardar la visita."
              : "We couldn't save that visit.",
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field
        id="provider-name"
        label={isSpanish ? "Nombre del proveedor" : "Provider name"}
        required
      >
        <input
          id="provider-name"
          type="text"
          value={providerName}
          onChange={(e) => setProviderName(e.target.value)}
          placeholder={
            isSpanish
              ? "ej. Dr. Smith, Hospital Memorial"
              : "e.g. Dr. Smith, Memorial Hospital"
          }
          required
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-[#E8E2D8] bg-white px-3 text-[15px] focus:border-[#104e60] focus:outline-none focus:ring-2 focus:ring-[#104e60]/20"
        />
      </Field>

      <Field
        id="visit-date"
        label={isSpanish ? "Fecha de la visita" : "Visit date"}
        required
      >
        <input
          id="visit-date"
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          required
          disabled={disabled}
          max={new Date().toISOString().split("T")[0]}
          className="h-11 w-full rounded-xl border border-[#E8E2D8] bg-white px-3 text-[15px] focus:border-[#104e60] focus:outline-none focus:ring-2 focus:ring-[#104e60]/20"
        />
      </Field>

      <Field
        id="reason"
        label={isSpanish ? "Tipo de visita" : "Type of visit"}
        required
      >
        <select
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-[#E8E2D8] bg-white px-3 text-[15px] focus:border-[#104e60] focus:outline-none focus:ring-2 focus:ring-[#104e60]/20"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="notes"
        label={isSpanish ? "Notas (opcional)" : "Notes (optional)"}
      >
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={disabled}
          placeholder={
            isSpanish
              ? "¿Algo importante sobre la visita?"
              : "Anything important from the visit?"
          }
          className="w-full rounded-xl border border-[#E8E2D8] bg-white p-3 text-[15px] focus:border-[#104e60] focus:outline-none focus:ring-2 focus:ring-[#104e60]/20"
        />
      </Field>

      <Field
        id="receipt-upload"
        label={isSpanish ? "Recibo (opcional)" : "Receipt (optional)"}
      >
        <label
          htmlFor="receipt-upload"
          className="flex min-h-[80px] cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#104e60]/30 bg-[#F7FAFB] px-4 text-center text-foreground/80 hover:border-[#104e60]/60"
        >
          <Upload className="size-4" aria-hidden="true" />
          <span className="text-[14px] font-medium">
            {receipt
              ? receipt.name
              : isSpanish
                ? "Toque para agregar un archivo"
                : "Tap to choose a file"}
          </span>
          <input
            id="receipt-upload"
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept="image/*,application/pdf"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            disabled={disabled}
          />
        </label>
      </Field>

      {error ? (
        <p className="inline-flex items-center gap-1 text-[13px] text-red-700">
          <AlertCircle className="size-4" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={disabled || !providerName.trim() || !visitDate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#104e60] px-6 text-[14px] font-semibold text-white hover:bg-[#0d3f4e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? (
            isSpanish ? (
              "Guardando…"
            ) : (
              "Saving…"
            )
          ) : (
            <>
              <Check className="size-4" aria-hidden="true" />
              {isSpanish ? "Guardar visita" : "Save visit"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-[13px] font-medium text-foreground/80"
      >
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      {children}
    </div>
  );
}
