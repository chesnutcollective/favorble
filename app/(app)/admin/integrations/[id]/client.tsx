"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/design-tokens";
import { Sparkline } from "@/components/charts/sparkline";
import {
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  uploadIntegrationLogo,
  fetchFaviconAsLogo,
  listUploadedLogos,
  applyExistingLogo,
  type IntegrationDetail,
  type IntegrationEventRow,
  type AlertRuleRow,
  type UploadedLogo,
} from "@/app/actions/integration-management";

// ── Helpers ──

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === "ok";
  const isWarn = status === "warn";
  const bg = isOk ? COLORS.okSubtle : isWarn ? COLORS.warnSubtle : COLORS.badSubtle;
  const fg = isOk ? COLORS.ok : isWarn ? COLORS.warn : COLORS.bad;
  const label = isOk ? "OK" : isWarn ? "WARN" : status.toUpperCase();

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function HttpStatusBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-xs" style={{ color: COLORS.text3 }}>--</span>;
  const isOk = code >= 200 && code < 300;
  const bg = isOk ? COLORS.okSubtle : COLORS.badSubtle;
  const fg = isOk ? COLORS.ok : COLORS.bad;
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-mono font-medium"
      style={{ background: bg, color: fg }}
    >
      {code}
    </span>
  );
}

function CategoryBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide"
      style={{ background: COLORS.brandSubtle, color: COLORS.brand }}
    >
      {label}
    </span>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[10px] border p-6"
      style={{
        background: COLORS.surface,
        borderColor: COLORS.borderDefault,
      }}
    >
      <h3
        className="mb-4 text-sm font-semibold uppercase tracking-wider"
        style={{ color: COLORS.text2 }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Sub-sections ──

function AboutSection({ detail }: { detail: IntegrationDetail }) {
  const { config } = detail;
  return (
    <SectionCard title="About">
      <p className="mb-4 text-sm leading-relaxed" style={{ color: COLORS.text1 }}>
        {config.description}
      </p>

      {config.poweredFeatures.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.text3 }}>
            Powered Features
          </h4>
          <ul className="space-y-1">
            {config.poweredFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm" style={{ color: COLORS.text2 }}>
                <span style={{ color: COLORS.ok }}>&#x2022;</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {config.dependencies.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.text3 }}>
            Dependencies
          </h4>
          <div className="space-y-2">
            {config.dependencies.map((dep) => (
              <div key={dep.integrationId} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/admin/integrations/${dep.integrationId}`}
                  className="rounded px-2 py-0.5 font-medium hover:underline"
                  style={{ background: COLORS.brandSubtle, color: COLORS.brand }}
                >
                  {dep.integrationId}
                </Link>
                <span style={{ color: COLORS.text3 }}>&rarr;</span>
                <span style={{ color: COLORS.text2 }}>&ldquo;{dep.purpose}&rdquo;</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ConfigurationSection({ detail }: { detail: IntegrationDetail }) {
  const { envVarStatuses, allRequiredConfigured } = detail;

  if (envVarStatuses.length === 0) {
    return (
      <SectionCard title="Configuration">
        <p className="text-sm" style={{ color: COLORS.text3 }}>
          No environment variables required.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Configuration">
      <div className="space-y-3">
        {envVarStatuses.map((v) => (
          <div
            key={v.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2"
            style={{ background: v.configured ? "transparent" : COLORS.warnSubtle }}
          >
            <code
              className="text-xs font-semibold"
              style={{ color: COLORS.text1, fontFamily: "'DM Mono', monospace" }}
            >
              {v.key}
            </code>

            {v.configured ? (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: COLORS.ok }}
              >
                &#x2713; Configured
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: COLORS.warn }}
              >
                &#x2717; Missing
              </span>
            )}

            {v.configured && v.displayValue && (
              <span
                className="ml-auto text-xs font-mono truncate max-w-[200px]"
                style={{ color: COLORS.text3 }}
              >
                {v.displayValue}
              </span>
            )}

            {!v.configured && (
              <span
                className="ml-auto text-[11px]"
                style={{ color: COLORS.text3 }}
              >
                Set in Vercel &rarr; Environment Variables
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm font-medium">
        <span>All required variables:</span>
        {allRequiredConfigured ? (
          <span style={{ color: COLORS.ok }}>&#x2713; Complete</span>
        ) : (
          <span style={{ color: COLORS.bad }}>&#x2717; Incomplete</span>
        )}
      </div>
    </SectionCard>
  );
}

function HealthHistorySection({
  detail,
  onVerify,
  verifying,
}: {
  detail: IntegrationDetail;
  onVerify: () => void;
  verifying: boolean;
}) {
  const { healthStats, recentHealthChecks, latencyTimeline } = detail;

  return (
    <SectionCard title="Health History (last 24h)">
      {/* Sparkline */}
      <div className="mb-4">
        <Sparkline
          data={latencyTimeline}
          width={320}
          height={40}
          stroke={COLORS.ok}
        />
      </div>

      {/* Summary stats */}
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span style={{ color: COLORS.text3 }}>Avg latency: </span>
          <span className="font-semibold" style={{ color: COLORS.text1 }}>
            {healthStats.avgLatencyMs !== null ? `${healthStats.avgLatencyMs}ms` : "--"}
          </span>
        </div>
        <div>
          <span style={{ color: COLORS.text3 }}>Uptime: </span>
          <span className="font-semibold" style={{ color: COLORS.text1 }}>
            {healthStats.uptimePercent !== null ? `${healthStats.uptimePercent}%` : "--"}
          </span>
        </div>
        <div>
          <span style={{ color: COLORS.text3 }}>Checks: </span>
          <span className="font-semibold" style={{ color: COLORS.text1 }}>
            {healthStats.totalChecks}
          </span>
        </div>
      </div>

      {/* Recent checks table */}
      {recentHealthChecks.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: COLORS.text3 }}>
                <th className="pb-2 text-left text-xs font-medium uppercase">Time</th>
                <th className="pb-2 text-left text-xs font-medium uppercase">Status</th>
                <th className="pb-2 text-right text-xs font-medium uppercase">Latency</th>
                <th className="pb-2 text-left text-xs font-medium uppercase">Notes</th>
              </tr>
            </thead>
            <tbody>
              {recentHealthChecks.map((check) => (
                <tr
                  key={check.id}
                  className="border-t"
                  style={{ borderColor: COLORS.borderSubtle }}
                >
                  <td className="py-1.5 pr-4 font-mono text-xs" style={{ color: COLORS.text2 }}>
                    {formatTime(check.createdAt)}
                  </td>
                  <td className="py-1.5 pr-4">
                    <StatusBadge status={check.status} />
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono text-xs" style={{ color: COLORS.text2 }}>
                    {check.latencyMs !== null ? `${check.latencyMs}ms` : "--"}
                  </td>
                  <td className="py-1.5 text-xs truncate max-w-[200px]" style={{ color: COLORS.text3 }}>
                    {check.summary ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm" style={{ color: COLORS.text3 }}>
          No health checks recorded yet.
          {detail.healthCheckUrl && " Use the Verify Now button to run one."}
        </p>
      )}

      {detail.healthCheckUrl && (
        <button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          className="mt-4 inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          style={{
            background: COLORS.brand,
            color: "#fff",
          }}
        >
          {verifying ? "Verifying..." : "Run Health Check"}
        </button>
      )}
    </SectionCard>
  );
}

function WebhookDeliveriesSection({
  deliveries,
}: {
  deliveries: IntegrationEventRow[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <SectionCard title={`Webhook Deliveries (${deliveries.length})`}>
      {deliveries.length > 0 ? (
        <div className="space-y-0">
          {deliveries.map((d) => {
            const isError =
              d.status === "error" || d.status === "timeout" || (d.httpStatus !== null && d.httpStatus >= 400);
            const isExpanded = expandedId === d.id;

            return (
              <div key={d.id}>
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 py-2 pl-3 pr-1"
                  style={{
                    borderLeftColor: isError ? COLORS.bad : "transparent",
                    background: isError ? COLORS.badSubtle : "transparent",
                  }}
                >
                  <span className="font-mono text-xs" style={{ color: COLORS.text2 }}>
                    {formatTime(d.createdAt)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: COLORS.text1 }}>
                    {d.webhookEventType ?? d.summary ?? "--"}
                  </span>
                  <HttpStatusBadge code={d.httpStatus} />
                  <span className="font-mono text-xs" style={{ color: COLORS.text3 }}>
                    {d.latencyMs !== null ? `${d.latencyMs}ms` : ""}
                  </span>
                  {d.payload != null ? (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : d.id)}
                      className="ml-auto text-[11px] font-medium hover:underline"
                      style={{ color: COLORS.brand }}
                    >
                      {isExpanded ? "hide" : "payload"}
                    </button>
                  ) : null}
                </div>
                {isExpanded && d.payload != null ? (
                  <pre
                    className="mb-2 ml-3 overflow-x-auto rounded-md p-3 text-[11px] leading-relaxed"
                    style={{
                      background: COLORS.bg,
                      color: COLORS.text2,
                      border: `1px solid ${COLORS.borderSubtle}`,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {JSON.stringify(d.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm" style={{ color: COLORS.text3 }}>
          No webhook deliveries recorded yet.
        </p>
      )}
    </SectionCard>
  );
}

function AlertRulesSection({
  integrationId,
  rules: initialRules,
}: {
  integrationId: string;
  rules: AlertRuleRow[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editThreshold, setEditThreshold] = useState(3);
  const [editWindow, setEditWindow] = useState(60);

  const handleCreate = () => {
    startTransition(async () => {
      const rule = await createAlertRule(integrationId);
      setRules((prev) => [rule, ...prev]);
    });
  };

  const handleToggle = (rule: AlertRuleRow) => {
    const newEnabled = rule.enabled === "true" ? "false" : "true";
    startTransition(async () => {
      const updated = await updateAlertRule(rule.id, { enabled: newEnabled });
      if (updated) {
        setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    });
  };

  const handleSaveEdit = (ruleId: string) => {
    startTransition(async () => {
      const updated = await updateAlertRule(ruleId, {
        failureThreshold: editThreshold,
        windowMinutes: editWindow,
      });
      if (updated) {
        setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
      setEditingId(null);
    });
  };

  const handleDelete = (ruleId: string) => {
    startTransition(async () => {
      const success = await deleteAlertRule(ruleId);
      if (success) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      }
    });
  };

  return (
    <SectionCard title="Alert Rules">
      {rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map((rule) => {
            const isEditing = editingId === rule.id;
            const isEnabled = rule.enabled === "true";

            return (
              <div
                key={rule.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor: COLORS.borderSubtle,
                  opacity: isEnabled ? 1 : 0.6,
                }}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs" style={{ color: COLORS.text2 }}>
                        Failures:
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={editThreshold}
                          onChange={(e) => setEditThreshold(Number(e.target.value))}
                          className="ml-1 w-16 rounded border px-2 py-1 text-xs"
                          style={{ borderColor: COLORS.borderDefault }}
                        />
                      </label>
                      <label className="text-xs" style={{ color: COLORS.text2 }}>
                        Window (min):
                        <input
                          type="number"
                          min={5}
                          max={1440}
                          value={editWindow}
                          onChange={(e) => setEditWindow(Number(e.target.value))}
                          className="ml-1 w-20 rounded border px-2 py-1 text-xs"
                          style={{ borderColor: COLORS.borderDefault }}
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(rule.id)}
                        disabled={isPending}
                        className="rounded-[7px] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: COLORS.brand }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-[7px] px-3 py-1 text-xs font-medium"
                        style={{ color: COLORS.text2 }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-sm" style={{ color: COLORS.text1 }}>
                      Alert when:{" "}
                      <strong>
                        {rule.failureThreshold}+ failures
                      </strong>{" "}
                      in{" "}
                      <strong>{rule.windowMinutes} minutes</strong>
                    </span>

                    <span className="text-xs" style={{ color: COLORS.text3 }}>
                      Last fired: {rule.lastFiredAt ? formatDateTime(rule.lastFiredAt) : "never"}
                    </span>

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditThreshold(rule.failureThreshold);
                          setEditWindow(rule.windowMinutes);
                          setEditingId(rule.id);
                        }}
                        className="rounded-[7px] px-2.5 py-1 text-xs font-medium"
                        style={{ color: COLORS.brand, background: COLORS.brandSubtle }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggle(rule)}
                        disabled={isPending}
                        className="rounded-[7px] px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                        style={{
                          color: isEnabled ? COLORS.warn : COLORS.ok,
                          background: isEnabled ? COLORS.warnSubtle : COLORS.okSubtle,
                        }}
                      >
                        {isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        disabled={isPending}
                        className="rounded-[7px] px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                        style={{ color: COLORS.bad, background: COLORS.badSubtle }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mb-3 text-sm" style={{ color: COLORS.text3 }}>
          No alert rules configured for this integration.
        </p>
      )}

      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ background: COLORS.brandSubtle, color: COLORS.brand }}
      >
        + Create Alert Rule
      </button>
    </SectionCard>
  );
}

// ── Upload dropzone (click / drop / paste) ──

function UploadDropZone({
  onClick,
  onFile,
  busy,
  uploadingThisSlot,
}: {
  onClick: () => void;
  onFile: (file: File) => void;
  busy: boolean;
  uploadingThisSlot: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          onFile(file);
          return;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const active = dragOver || focused;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Click, drop, or paste image"
      onClick={onClick}
      onKeyDown={handleKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPaste={handlePaste}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="mb-1 flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed px-3 py-2.5 text-center outline-none transition-colors disabled:cursor-wait"
      style={{
        borderColor: active ? COLORS.brand : COLORS.borderDefault,
        background: active ? COLORS.brandSubtle : "transparent",
        opacity: busy && !uploadingThisSlot ? 0.5 : 1,
      }}
    >
      {uploadingThisSlot ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: COLORS.brand, borderTopColor: "transparent" }} />
      ) : (
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: focused ? COLORS.brand : COLORS.text1 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5z" clipRule="evenodd" />
          </svg>
          Click, drop, or paste image
        </div>
      )}
      <p className="text-[10px]" style={{ color: COLORS.text3 }}>
        {focused ? "⌘V to paste" : "PNG · SVG · JPEG, up to 500 KB"}
      </p>
    </div>
  );
}

// ── Logo library strip ──

function LogoLibraryStrip({
  logos,
  currentStoragePath,
  currentDisplaySrc,
  defaultLabel,
  applyingPath,
  busy,
  onPick,
}: {
  logos: UploadedLogo[] | null;
  currentStoragePath: string | null;
  currentDisplaySrc: string;
  defaultLabel: string;
  applyingPath: string | null;
  busy: boolean;
  onPick: (storagePath: string) => void;
}) {
  if (logos === null) {
    return (
      <div
        className="mb-2 flex h-10 items-center justify-center rounded-md border border-dashed text-[10px]"
        style={{ borderColor: COLORS.borderSubtle, color: COLORS.text3 }}
      >
        Loading library…
      </div>
    );
  }

  const currentEntry = currentStoragePath
    ? logos.find((l) => l.storagePath === currentStoragePath) ?? null
    : null;
  const currentMeta = currentEntry
    ? currentEntry.sourceDomain ?? `Last used by ${currentEntry.lastUsedFor}`
    : defaultLabel;

  return (
    <div className="mb-3">
      {/* Sticky "Current" row */}
      <div
        className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5"
        style={{ borderColor: COLORS.borderSubtle, background: COLORS.bg }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border bg-white"
          style={{ borderColor: COLORS.borderDefault }}
        >
          <Image
            src={currentDisplaySrc}
            alt="Currently active"
            width={28}
            height={28}
            className="h-full w-full object-contain p-0.5"
            unoptimized={
              currentDisplaySrc.startsWith("data:") ||
              currentDisplaySrc.startsWith("http")
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: COLORS.text3 }}
          >
            Current
          </p>
          <p
            className="truncate text-[11px]"
            style={{ color: COLORS.text1 }}
          >
            {currentMeta}
          </p>
        </div>
      </div>

      {logos.length > 0 && (
        <>
          <p
            className="mb-1 text-[10px] font-medium"
            style={{ color: COLORS.text3 }}
          >
            Pick from library
          </p>
          <div
            className="flex gap-1.5 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {logos.map((logo) => {
              const isApplying = applyingPath === logo.storagePath;
              const isCurrent = logo.storagePath === currentStoragePath;
              const title = logo.sourceDomain
                ? `From ${logo.sourceDomain} (last used by ${logo.lastUsedFor})`
                : `Last used by ${logo.lastUsedFor}`;
              return (
                <button
                  key={logo.storagePath}
                  type="button"
                  onClick={() => onPick(logo.storagePath)}
                  disabled={busy || isCurrent}
                  title={isCurrent ? `Currently active — ${title}` : title}
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white transition-all hover:ring-2 disabled:cursor-default"
                  style={{
                    borderColor: isCurrent ? COLORS.brand : COLORS.borderDefault,
                    boxShadow: isCurrent ? `0 0 0 2px ${COLORS.brand}` : undefined,
                    opacity: !isCurrent && busy ? 0.5 : 1,
                  }}
                >
                  <Image
                    src={logo.signedUrl}
                    alt={logo.sourceDomain ?? logo.lastUsedFor}
                    width={32}
                    height={32}
                    className="h-full w-full object-contain p-0.5"
                    unoptimized
                  />
                  {isCurrent && (
                    <span
                      className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white"
                      style={{ background: COLORS.brand }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-2.5 w-2.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 111.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                  {isApplying && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component ──

export function IntegrationDetailClient({
  detail,
  customLogoUrls,
}: {
  detail: IntegrationDetail;
  customLogoUrls: {
    tech: { url: string; storagePath: string } | null;
    host: { url: string; storagePath: string } | null;
  };
}) {
  const router = useRouter();
  const { config, categoryLabel } = detail;
  const hasHost = Boolean(config.hostLogoPath);
  const [verifying, setVerifying] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string>(
    customLogoUrls.tech?.url ?? `/${config.logoPath}`,
  );
  const [techCurrentPath, setTechCurrentPath] = useState<string | null>(
    customLogoUrls.tech?.storagePath ?? null,
  );
  const [hostLogoError, setHostLogoError] = useState(false);
  const [hostLogoSrc, setHostLogoSrc] = useState<string>(
    customLogoUrls.host?.url ?? (config.hostLogoPath ? `/${config.hostLogoPath}` : ""),
  );
  const [hostCurrentPath, setHostCurrentPath] = useState<string | null>(
    customLogoUrls.host?.storagePath ?? null,
  );
  const [uploading, setUploading] = useState<null | "tech" | "host">(null);
  const [fetchingFavicon, setFetchingFavicon] = useState<null | "tech" | "host">(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showLogoMenu, setShowLogoMenu] = useState(false);
  const [faviconUrl, setFaviconUrl] = useState("");
  const [hostFaviconUrl, setHostFaviconUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hostFileInputRef = useRef<HTMLInputElement>(null);
  const [logoLibrary, setLogoLibrary] = useState<UploadedLogo[] | null>(null);
  const [applyingPath, setApplyingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!showLogoMenu || logoLibrary !== null) return;
    let cancelled = false;
    listUploadedLogos()
      .then((logos) => {
        if (!cancelled) setLogoLibrary(logos);
      })
      .catch(() => {
        if (!cancelled) setLogoLibrary([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showLogoMenu, logoLibrary]);

  const overallStatus = detail.allRequiredConfigured ? "active" : "pending";

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await fetch("/api/admin/integrations/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: config.id }),
      });
      // Refresh server data
      router.refresh();
    } catch {
      // Refresh anyway to show what happened
      router.refresh();
    } finally {
      setVerifying(false);
    }
  };

  const processFile = async (slot: "tech" | "host", file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("Not an image file");
      return;
    }

    setUploadError(null);
    setUploading(slot);

    try {
      const formData = new FormData();
      formData.set("integrationId", config.id);
      formData.set("file", file);
      formData.set("slot", slot);

      const result = await uploadIntegrationLogo(formData);
      if (result.success && result.signedUrl && result.storagePath) {
        if (slot === "tech") {
          setLogoSrc(result.signedUrl);
          setTechCurrentPath(result.storagePath);
          setLogoError(false);
        } else {
          setHostLogoSrc(result.signedUrl);
          setHostCurrentPath(result.storagePath);
          setHostLogoError(false);
        }
        setLogoLibrary(null); // force library re-fetch so new upload appears
      } else {
        setUploadError(result.error ?? "Upload failed");
      }
    } catch {
      setUploadError("Upload failed unexpectedly");
    } finally {
      setUploading(null);
    }
  };

  const handleFileUpload = async (
    slot: "tech" | "host",
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(slot, file);
    const ref = slot === "tech" ? fileInputRef : hostFileInputRef;
    if (ref.current) ref.current.value = "";
  };

  const handleFetchFavicon = async (slot: "tech" | "host") => {
    const url = slot === "tech" ? faviconUrl : hostFaviconUrl;
    if (!url.trim()) return;
    setUploadError(null);
    setFetchingFavicon(slot);
    try {
      const result = await fetchFaviconAsLogo({
        integrationId: config.id,
        url: url.trim(),
        slot,
      });
      if (result.success && result.signedUrl && result.storagePath) {
        if (slot === "tech") {
          setLogoSrc(result.signedUrl);
          setTechCurrentPath(result.storagePath);
          setLogoError(false);
          setFaviconUrl("");
        } else {
          setHostLogoSrc(result.signedUrl);
          setHostCurrentPath(result.storagePath);
          setHostLogoError(false);
          setHostFaviconUrl("");
        }
        setLogoLibrary(null); // force library re-fetch
        setShowLogoMenu(false);
      } else {
        setUploadError(result.error ?? "Fetch failed");
      }
    } catch {
      setUploadError("Fetch failed unexpectedly");
    } finally {
      setFetchingFavicon(null);
    }
  };

  const handleApplyExisting = async (
    slot: "tech" | "host",
    storagePath: string,
  ) => {
    setUploadError(null);
    setApplyingPath(storagePath);
    try {
      const result = await applyExistingLogo({
        integrationId: config.id,
        slot,
        storagePath,
      });
      if (result.success && result.signedUrl && result.storagePath) {
        if (slot === "tech") {
          setLogoSrc(result.signedUrl);
          setTechCurrentPath(result.storagePath);
          setLogoError(false);
        } else {
          setHostLogoSrc(result.signedUrl);
          setHostCurrentPath(result.storagePath);
          setHostLogoError(false);
        }
        setShowLogoMenu(false);
      } else {
        setUploadError(result.error ?? "Could not apply logo");
      }
    } catch {
      setUploadError("Could not apply logo");
    } finally {
      setApplyingPath(null);
    }
  };

  const busy = uploading !== null || fetchingFavicon !== null || applyingPath !== null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Back link */}
      <Link
        href="/admin/integrations"
        className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        style={{ color: COLORS.brand }}
      >
        &larr; Back to Integrations
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="group relative">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border" style={{ borderColor: COLORS.borderDefault, background: COLORS.surface }}>
            {logoError ? (
              <span className="text-2xl">{config.fallbackIcon}</span>
            ) : (
              <Image
                src={logoSrc}
                alt={config.name}
                width={48}
                height={48}
                className="h-8 w-8 object-contain"
                unoptimized={logoSrc.startsWith("data:") || logoSrc.startsWith("http")}
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          {hasHost && hostLogoSrc && !hostLogoError && (
            <div
              className="pointer-events-none absolute -bottom-1 -right-1 flex h-[20px] w-[20px] items-center justify-center overflow-hidden rounded-md bg-white shadow-sm"
              style={{ boxShadow: `0 0 0 2px ${COLORS.surface}` }}
              title={config.hostName ? `Hosted on ${config.hostName}` : undefined}
            >
              <Image
                src={hostLogoSrc}
                alt={config.hostName ?? "Host platform"}
                width={20}
                height={20}
                className="object-contain"
                unoptimized={hostLogoSrc.startsWith("data:") || hostLogoSrc.startsWith("http")}
                onError={() => setHostLogoError(true)}
              />
            </div>
          )}
          {/* Edit logo overlay */}
          <button
            type="button"
            onClick={() => setShowLogoMenu(!showLogoMenu)}
            disabled={busy}
            className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 disabled:cursor-wait"
            aria-label="Change logo"
          >
            {busy ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="white"
                className="h-4 w-4"
              >
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => handleFileUpload("tech", e)}
          />
          <input
            ref={hostFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => handleFileUpload("host", e)}
          />
          {/* Logo edit menu */}
          {showLogoMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowLogoMenu(false)}
              />
              <div
                className="absolute left-0 top-full z-50 mt-2 w-72 rounded-[10px] border bg-white p-3 shadow-lg"
                style={{ borderColor: COLORS.borderDefault }}
              >
                {/* Tech logo section */}
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: COLORS.text3 }}
                  >
                    Logo
                  </p>
                  <p className="mb-2 text-[10px]" style={{ color: COLORS.text3 }}>
                    The main service mark shown on the integration card.
                  </p>
                </div>
                <LogoLibraryStrip
                  logos={logoLibrary}
                  currentStoragePath={techCurrentPath}
                  currentDisplaySrc={logoSrc}
                  defaultLabel={`Default — ${config.logoPath.split("/").pop() ?? "logo"}`}
                  applyingPath={applyingPath}
                  busy={busy}
                  onPick={(path) => handleApplyExisting("tech", path)}
                />
                <UploadDropZone
                  onClick={() => fileInputRef.current?.click()}
                  onFile={(file) => processFile("tech", file)}
                  busy={busy}
                  uploadingThisSlot={uploading === "tech"}
                />
                <div className="mt-2 border-t pt-2" style={{ borderColor: COLORS.borderSubtle }}>
                  <p className="mb-1.5 text-[11px] font-medium" style={{ color: COLORS.text3 }}>
                    Or fetch favicon from URL
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={faviconUrl}
                      onChange={(e) => setFaviconUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFetchFavicon("tech");
                      }}
                      placeholder={`e.g. ${config.shortName.toLowerCase()}.com`}
                      className="flex-1 rounded-md border px-2 py-1 text-xs outline-none focus:ring-1"
                      style={{ borderColor: COLORS.borderDefault, color: COLORS.text1 }}
                    />
                    <button
                      type="button"
                      onClick={() => handleFetchFavicon("tech")}
                      disabled={fetchingFavicon !== null || !faviconUrl.trim()}
                      className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                      style={{ backgroundColor: COLORS.brand }}
                    >
                      {fetchingFavicon === "tech" ? "..." : "Fetch"}
                    </button>
                  </div>
                </div>

                {/* Hosting badge section */}
                {hasHost && (
                  <div
                    className="mt-3 border-t pt-3"
                    style={{ borderColor: COLORS.borderDefault }}
                  >
                    <div>
                      <p
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: COLORS.text3 }}
                      >
                        Hosting badge
                      </p>
                      <p className="mb-2 text-[10px]" style={{ color: COLORS.text3 }}>
                        Small corner overlay — the platform this runs on
                        {config.hostName ? ` (${config.hostName})` : ""}.
                      </p>
                    </div>
                    <LogoLibraryStrip
                      logos={logoLibrary}
                      currentStoragePath={hostCurrentPath}
                      currentDisplaySrc={hostLogoSrc || `/${config.hostLogoPath ?? ""}`}
                      defaultLabel={`Default — ${(config.hostLogoPath ?? "").split("/").pop() ?? "badge"}`}
                      applyingPath={applyingPath}
                      busy={busy}
                      onPick={(path) => handleApplyExisting("host", path)}
                    />
                    <UploadDropZone
                      onClick={() => hostFileInputRef.current?.click()}
                      onFile={(file) => processFile("host", file)}
                      busy={busy}
                      uploadingThisSlot={uploading === "host"}
                    />
                    <div className="mt-2 border-t pt-2" style={{ borderColor: COLORS.borderSubtle }}>
                      <p className="mb-1.5 text-[11px] font-medium" style={{ color: COLORS.text3 }}>
                        Or fetch favicon from URL
                      </p>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={hostFaviconUrl}
                          onChange={(e) => setHostFaviconUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleFetchFavicon("host");
                          }}
                          placeholder={`e.g. ${(config.hostName ?? "host").toLowerCase()}.com`}
                          className="flex-1 rounded-md border px-2 py-1 text-xs outline-none focus:ring-1"
                          style={{ borderColor: COLORS.borderDefault, color: COLORS.text1 }}
                        />
                        <button
                          type="button"
                          onClick={() => handleFetchFavicon("host")}
                          disabled={fetchingFavicon !== null || !hostFaviconUrl.trim()}
                          className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                          style={{ backgroundColor: COLORS.brand }}
                        >
                          {fetchingFavicon === "host" ? "..." : "Fetch"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {uploadError && (
            <div
              className="absolute left-0 top-full mt-1 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium"
              style={{ background: COLORS.badSubtle, color: COLORS.bad }}
            >
              {uploadError}
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: COLORS.text1 }}>
            {config.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span style={{ color: COLORS.text2 }}>{config.tagline}</span>
            <span style={{ color: COLORS.text4 }}>&middot;</span>
            <CategoryBadge label={categoryLabel} />
            <span style={{ color: COLORS.text4 }}>&middot;</span>
            <StatusBadge status={overallStatus === "active" ? "ok" : "warn"} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.healthCheckUrl && (
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying}
                className="inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: COLORS.brand }}
              >
                {verifying ? "Verifying..." : "Verify Now"}
              </button>
            )}
            {config.docsUrl && (
              <a
                href={config.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[7px] border px-3.5 py-1.5 text-xs font-semibold transition-colors hover:opacity-80"
                style={{ borderColor: COLORS.borderDefault, color: COLORS.brand }}
              >
                Open Docs &#x2197;
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Two-column grid on desktop */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <AboutSection detail={detail} />
          <ConfigurationSection detail={detail} />
          <AlertRulesSection
            integrationId={config.id}
            rules={detail.alertRules}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <HealthHistorySection
            detail={detail}
            onVerify={handleVerify}
            verifying={verifying}
          />
          {config.webhookPath && (
            <WebhookDeliveriesSection deliveries={detail.webhookDeliveries} />
          )}
        </div>
      </div>
    </div>
  );
}
