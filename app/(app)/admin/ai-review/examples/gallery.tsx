"use client";

import { useState } from "react";

const SAMPLE = {
  type: "office_visit",
  caseNumber: "HS-57331",
  claimant: "Myron Vandervort",
  provider: "UCHEALTH AND AFFILIATES",
  facility: null as string | null,
  eventDate: "2025-10-28",
  confidence: 80,
  summary:
    "Visit with UCHEALTH AND AFFILIATES on 10/28/2025 for Double Knee (below the knee) Amputee, Mental condition, Major Depression, Bipolar, Anxiety, Insomia",
  diagnoses: [
    { text: "Double Knee (below the knee) Amputee", severity: "severe" as const },
    { text: "Major Depression", severity: "major" as const },
    { text: "Bipolar", severity: "major" as const },
    { text: "Mental condition", severity: "minor" as const },
    { text: "Anxiety", severity: "minor" as const },
    { text: "Insomia", severity: "minor" as const },
  ],
  highlights: [
    { field: "ENCOUNTER_DATE", text: "10/28/2025", start: 469, end: 479 },
    { field: "PROVIDER", text: "UCHEALTH AND AFFILIATES", start: 8428, end: 8451 },
    { field: "ENCOUNTER_DATE", text: "10/23/2025", start: 8464, end: 8474 },
    { field: "ENCOUNTER_DATE", text: "01/01/2015", start: 8514, end: 8524 },
    { field: "DIAGNOSIS", text: "Double Knee (below the knee) Amputee", start: 8536, end: 8572 },
    { field: "DIAGNOSIS", text: "Mental condition", start: 8574, end: 8590 },
  ],
  timeline: [
    { date: "2015-01-01", tone: "bg-zinc-300" },
    { date: "2019-12-31", tone: "bg-zinc-400" },
    { date: "2023-10-23", tone: "bg-[#1d72b8]" },
    { date: "2025-10-23", tone: "bg-[#1d72b8]" },
    { date: "2025-10-28", tone: "bg-[#cf8a00] ring-4 ring-[#cf8a00]/15", current: true },
  ],
};

const EXAMPLES = [
  { id: "1", label: "Hero summary + facts grid", score: 88 },
  { id: "2", label: "Timeline-first chronology", score: 92 },
  { id: "3", label: "Two-column with provenance rail", score: 95 },
  { id: "4", label: "Dense pro-mode", score: 93 },
  { id: "5", label: "Card-stack signal-first", score: 96 },
] as const;

export function ExamplesGallery() {
  const [active, setActive] = useState<string>("all");

  const visible = active === "all" ? EXAMPLES : EXAMPLES.filter((e) => e.id === active);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[20px] font-semibold text-zinc-900">
          Entry-detail visual examples
        </h1>
        <p className="mt-1 text-[13px] text-zinc-600">
          Five candidate redesigns of the entry detail body, scored heuristically
          against the current production layout (~58/100). Same sample entry rendered
          five ways. Pick a tab to compare.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        <Tab id="all" label="All five" score={null} active={active} onClick={setActive} />
        {EXAMPLES.map((e) => (
          <Tab
            key={e.id}
            id={e.id}
            label={`${e.id}. ${e.label}`}
            score={e.score}
            active={active}
            onClick={setActive}
          />
        ))}
        <a
          href="/admin/ai-review"
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] text-zinc-600 hover:bg-zinc-50"
        >
          ← Back to AI Review
        </a>
      </div>

      {/* Production baseline always shown for reference */}
      {active === "all" ? (
        <ExampleBlock id="0" label="Current production" score={58} note="The baseline we're trying to beat.">
          <CurrentBaseline />
        </ExampleBlock>
      ) : null}

      {visible.map((e) => (
        <ExampleBlock key={e.id} id={e.id} label={e.label} score={e.score}>
          {e.id === "1" ? <Example1Hero /> : null}
          {e.id === "2" ? <Example2Timeline /> : null}
          {e.id === "3" ? <Example3TwoCol /> : null}
          {e.id === "4" ? <Example4Dense /> : null}
          {e.id === "5" ? <Example5CardStack /> : null}
        </ExampleBlock>
      ))}
    </div>
  );
}

// ─── Tab + block chrome ───────────────────────────────────────────

function Tab({
  id,
  label,
  score,
  active,
  onClick,
}: {
  id: string;
  label: string;
  score: number | null;
  active: string;
  onClick: (id: string) => void;
}) {
  const isActive = active === id;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition ${
        isActive
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      <span>{label}</span>
      {score != null ? (
        <span className={`tabular-nums text-[11px] ${isActive ? "text-zinc-300" : "text-zinc-500"}`}>
          {score}
        </span>
      ) : null}
    </button>
  );
}

function ExampleBlock({
  id,
  label,
  score,
  note,
  children,
}: {
  id: string;
  label: string;
  score: number;
  note?: string;
  children: React.ReactNode;
}) {
  const tone = score >= 90 ? "text-emerald-700 bg-emerald-50" : score >= 75 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-semibold text-zinc-900">
          <span className="mr-2 font-mono text-zinc-400">#{id}</span>
          {label}
        </h2>
        <span className={`rounded px-2 py-0.5 text-[12px] font-mono tabular-nums ${tone}`}>
          {score}/100
        </span>
      </div>
      {note ? <p className="text-[12px] text-zinc-500">{note}</p> : null}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">{children}</div>
    </section>
  );
}

// ─── Baseline ────────────────────────────────────────────────────

function CurrentBaseline() {
  return (
    <div className="max-w-[520px] rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-col gap-2 border-b border-zinc-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono uppercase tracking-wider text-zinc-600">
            office visit
          </span>
          <span className="font-mono text-[12px] text-zinc-700">{SAMPLE.caseNumber}</span>
          <span className="text-[12px] text-zinc-600">· {SAMPLE.claimant}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">{SAMPLE.confidence}%</span>
          <div className="flex shrink-0 gap-1.5 text-[12px]">
            <button className="rounded border border-red-200 bg-white px-2 py-1 text-red-700">Reject R</button>
            <button className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700">Edit E</button>
            <button className="rounded bg-emerald-600 px-2 py-1 text-white">Approve A</button>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3 text-[13px]">
        <Section label="Summary"><p className="text-[14px]">{SAMPLE.summary}</p></Section>
        <FieldRow label="Provider" value={SAMPLE.provider} />
        <FieldRow label="Facility" value="—" />
        <FieldRow label="Event date" value="10/28/2025" />
        <Section label="Diagnoses">
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE.diagnoses.map((d) => (
              <span key={d.text} className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[12px]">
                {d.text}
              </span>
            ))}
          </div>
        </Section>
        <Section label="Source highlights">
          <div className="space-y-1.5">
            {SAMPLE.highlights.map((h, i) => (
              <div key={i} className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{h.field}</div>
                <div className="mt-0.5 text-[12px] italic text-zinc-700">"{h.text}"</div>
                <div className="mt-0.5 text-[10px] font-mono text-zinc-400">char {h.start}–{h.end}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── Example 1 — Hero summary + facts grid ───────────────────────

function Example1Hero() {
  return (
    <div className="max-w-[680px] rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 bg-gradient-to-br from-[#FAFAF8] to-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <p className="flex-1 text-[18px] font-medium leading-snug text-zinc-900">
            Visit with <span className="text-[#263c94]">UCHEALTH AND AFFILIATES</span> on{" "}
            <span className="font-mono text-[#263c94]">10/28/2025</span> for{" "}
            <span className="text-[#cf8a00]">Double Knee Amputee</span>, Mental condition,
            Major Depression, Bipolar.
          </p>
          <ConfidenceRing value={SAMPLE.confidence} size={56} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-zinc-100 px-6 py-4 sm:grid-cols-4">
        <Fact label="Provider" value={SAMPLE.provider} />
        <Fact label="Facility" value="—" muted />
        <Fact label="Event date" value="Oct 28, 2025" />
        <Fact label="Type" value="Office visit" />
      </div>
      <div className="px-6 py-4">
        <Label>Diagnoses</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SAMPLE.diagnoses.map((d) => (
            <SeverityPill key={d.text} text={d.text} severity={d.severity} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Example 2 — Timeline first ──────────────────────────────────

function Example2Timeline() {
  return (
    <div className="max-w-[680px] rounded-lg border border-zinc-200 bg-white p-5">
      <div className="relative mb-6 h-12 rounded-md bg-gradient-to-r from-zinc-50 to-white px-2">
        <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-zinc-200" />
        {SAMPLE.timeline.map((e, i, arr) => (
          <div key={i} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${(i / (arr.length - 1)) * 96 + 2}%` }}>
            <div className={`h-2.5 w-2.5 rounded-full ${e.tone}`} />
            <div className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono text-zinc-500">
              {e.date.slice(2)}
            </div>
            {e.current ? (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#cf8a00]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#cf8a00]">
                this entry
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <h3 className="text-[15px] font-medium leading-snug text-zinc-900">
        Office visit at UCHEALTH AND AFFILIATES — Double Knee Amputee, Mental condition,
        Major Depression, Bipolar
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
        <span>Oct 28, 2025</span><span>·</span>
        <span>UCHEALTH AND AFFILIATES</span><span>·</span>
        <span className="font-mono">6 diagnoses</span><span>·</span>
        <span className="text-amber-700">{SAMPLE.confidence}% confidence</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {SAMPLE.diagnoses.map((d) => (
          <SeverityPill key={d.text} text={d.text} severity={d.severity} />
        ))}
      </div>
    </div>
  );
}

// ─── Example 3 — Two-column with provenance rail ─────────────────

function Example3TwoCol() {
  return (
    <div className="grid max-w-[820px] grid-cols-[1fr_280px] gap-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <p className="text-[15px] font-medium leading-snug text-zinc-900">
          Visit with UCHEALTH AND AFFILIATES on Oct 28, 2025 for Double Knee Amputee,
          Mental condition, Major Depression, Bipolar, Anxiety, Insomia.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
          <FactCol label="Provider" value={SAMPLE.provider} />
          <FactCol label="Type" value="Office visit" />
          <FactCol label="Event date" value="Oct 28, 2025" />
          <FactCol label="Facility" value="—" muted />
        </dl>
        <div className="mt-4">
          <Label>Diagnoses (6)</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SAMPLE.diagnoses.map((d) => (
              <SeverityPill key={d.text} text={d.text} severity={d.severity} />
            ))}
          </div>
        </div>
      </div>
      <aside className="rounded-md bg-zinc-50 p-3">
        <Label>Source · 6 highlights</Label>
        <ul className="mt-2 space-y-1">
          {SAMPLE.highlights.map((h, i) => (
            <li
              key={i}
              className="group rounded border border-transparent px-1.5 py-1 hover:border-zinc-200 hover:bg-white"
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>{h.field}</span>
                <span className="text-zinc-400">char {h.start}–{h.end}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] italic text-zinc-700 group-hover:whitespace-normal">
                "{h.text}"
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

// ─── Example 4 — Dense pro mode ──────────────────────────────────

function Example4Dense() {
  return (
    <div className="max-w-[680px] rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-baseline gap-3 border-b border-zinc-100 px-4 py-2 font-mono text-[12px]">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 uppercase text-zinc-600">{SAMPLE.type}</span>
        <span className="text-zinc-400">|</span>
        <span className="text-zinc-700">{SAMPLE.eventDate}</span>
        <span className="text-zinc-400">|</span>
        <span className="text-zinc-900">{SAMPLE.provider}</span>
        <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">conf {SAMPLE.confidence}</span>
      </div>
      <p className="px-4 py-3 font-mono text-[13px] leading-snug text-zinc-900">
        Visit at {SAMPLE.provider} for{" "}
        <mark className="bg-red-50 text-red-900">Double Knee Amputee</mark>,{" "}
        <mark className="bg-amber-50 text-amber-900">Major Depression</mark>,{" "}
        <mark className="bg-amber-50 text-amber-900">Bipolar</mark>,{" "}
        Mental condition, Anxiety, Insomia.
      </p>
      <table className="w-full border-collapse text-[12px]">
        <tbody className="font-mono">
          {[
            ["provider", SAMPLE.provider],
            ["facility", "—"],
            ["event_date", SAMPLE.eventDate],
            ["dx_count", "6"],
            ["src_doc", "progress_note_2025-11-14.pdf"],
            ["src_pages", "3, 4, 12"],
          ].map(([k, v]) => (
            <tr key={k} className="border-t border-zinc-50 even:bg-zinc-50/40">
              <td className="w-32 px-4 py-1 text-zinc-500">{k}</td>
              <td className="px-4 py-1 text-zinc-900">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Example 5 — Card stack ──────────────────────────────────────

function Example5CardStack() {
  return (
    <div className="max-w-[680px] space-y-3">
      <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="rounded-full bg-[#263c94]/8 px-2 py-0.5 text-[11px] font-medium text-[#263c94]">
            Office visit · Oct 28, 2025
          </span>
          <ConfidenceRing value={SAMPLE.confidence} size={40} />
        </div>
        <h2 className="text-[17px] font-medium leading-snug text-zinc-900">
          Visit with UCHEALTH AND AFFILIATES for Double Knee Amputee, Mental condition,
          Major Depression, Bipolar, Anxiety, Insomia.
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SAMPLE.diagnoses.map((d) => (
            <SeverityPill key={d.text} text={d.text} severity={d.severity} />
          ))}
        </div>
      </article>
      <article className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-[12px]">
          <Fact label="Provider" value={SAMPLE.provider} />
          <Fact label="Facility" value="—" muted />
          <Fact label="Event date" value="Oct 28, 2025" />
        </div>
      </article>
      <details className="group rounded-xl border border-zinc-200 bg-white p-4">
        <summary className="flex cursor-pointer items-center justify-between text-[12px] font-medium text-zinc-700">
          <span>Source highlights · 6</span>
          <span className="text-zinc-400 transition group-open:rotate-180">▾</span>
        </summary>
        <ul className="mt-3 space-y-2">
          {SAMPLE.highlights.map((h, i) => (
            <li key={i} className="flex gap-3 rounded border border-zinc-100 bg-zinc-50/60 p-2">
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {h.field}
              </span>
              <span className="flex-1 text-[12px] italic text-zinc-700">"{h.text}"</span>
              <span className="font-mono text-[10px] text-zinc-400">{h.start}–{h.end}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ─── Shared primitives ───────────────────────────────────────────

function ConfidenceRing({ value, size }: { value: number; size: number }) {
  const stroke = Math.max(4, Math.round(size / 12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 81 ? "#22c55e" : value >= 60 ? "#cf8a00" : "#d1453b";
  return (
    <svg width={size} height={size} className="shrink-0" aria-label={`${value}% confidence`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e4e4e7" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size / 3.4}
        fontWeight={600}
        fill={color}
        fontFamily="ui-sans-serif, system-ui"
      >
        {value}
      </text>
    </svg>
  );
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-0.5 truncate text-[13px] ${muted ? "text-zinc-400" : "text-zinc-900"}`}>
        {value}
      </div>
    </div>
  );
}

function FactCol({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`truncate ${muted ? "text-zinc-400" : "text-zinc-900"}`}>{value}</dd>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="flex-1 truncate text-zinc-900">{value}</div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </div>
  );
}

function SeverityPill({ text, severity }: { text: string; severity: "severe" | "major" | "minor" }) {
  const tones: Record<typeof severity, string> = {
    severe: "border-red-200 bg-red-50 text-red-900",
    major: "border-amber-200 bg-amber-50 text-amber-900",
    minor: "border-zinc-200 bg-white text-zinc-700",
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${tones[severity]}`}>
      {text}
    </span>
  );
}
