"use client";

/**
 * The copilot bar — Gmail-style hybrid search input.
 *
 * - Typed grammar (case:HS-05827 confidence:<60) is re-parsed on every
 *   keystroke; the chip strip beneath the bar reflects the parsed query.
 * - Chips are removable individually; removing one updates the bar.
 * - Autocomplete typeahead suggests qualifiers + values from the server
 *   (cases, providers) and from the static enum sets (status, type).
 * - Unknown qualifiers render a "did you mean?" inline error.
 *
 * Lives at the top of the AI Review page and stays mounted across mode
 * switches so the grammar input is always one keystroke away.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ENTRY_TYPES,
  KNOWN_QUALIFIERS,
  STATUS_VALUES,
  parseQuery,
  stringifyQuery,
  suggestQualifier,
  type Qualifier,
} from "@/lib/ai-review/grammar";
import type { FacetCounts, ReviewQuery } from "@/lib/ai-review/types";
import {
  listReviewableCases,
  listReviewableProviders,
} from "@/app/actions/ai-review";

type Suggestion =
  | { kind: "qualifier"; key: Qualifier; hint: string }
  | { kind: "value"; key: Qualifier; value: string; meta?: string };

export const CopilotBar = forwardRef<
  HTMLInputElement,
  {
    query: ReviewQuery;
    facets?: FacetCounts | null;
    onChange: (next: ReviewQuery) => void;
    loading?: boolean;
    onHelpClick?: () => void;
  }
>(function CopilotBar({ query, facets, onChange, loading, onHelpClick }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  const [text, setText] = useState(() => stringifyQuery(query));
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Re-sync the input when the query changes from outside (chip removal,
  // saved-view click). Skip if the text already matches to preserve the
  // caret while the user is mid-edit.
  useEffect(() => {
    const next = stringifyQuery(query);
    if (next !== text) setText(next);
  }, [query]);

  const parsed = useMemo(() => parseQuery(text), [text]);

  // Compute autocomplete suggestions for the token being typed.
  const computeSuggestions = useCallback(
    async (input: string, caret: number) => {
      const tokenStart = (() => {
        // Walk back from caret to find token start (whitespace boundary).
        let i = caret - 1;
        while (i >= 0 && !/\s/.test(input[i])) i--;
        return i + 1;
      })();
      const token = input.slice(tokenStart, caret);
      if (!token) {
        setSuggestions([]);
        return;
      }

      // qualifier:value form?
      const colon = token.indexOf(":");
      if (colon > 0) {
        const key = token.slice(0, colon).toLowerCase() as Qualifier;
        const value = token.slice(colon + 1);
        if (!(KNOWN_QUALIFIERS as readonly string[]).includes(key)) {
          setSuggestions([]);
          return;
        }
        const out: Suggestion[] = [];
        if (key === "case") {
          const cases = await listReviewableCases(value);
          for (const c of cases) {
            out.push({
              kind: "value",
              key,
              value: c.caseNumber,
              meta: `${c.pending} pending`,
            });
          }
        } else if (key === "provider") {
          const provs = await listReviewableProviders(value);
          for (const p of provs) {
            out.push({
              kind: "value",
              key,
              value: p.name,
              meta: `${p.pending} pending`,
            });
          }
        } else if (key === "status") {
          for (const s of STATUS_VALUES) {
            if (s.startsWith(value.toLowerCase())) {
              out.push({ kind: "value", key, value: s });
            }
          }
        } else if (key === "type") {
          for (const t of ENTRY_TYPES) {
            if (t.startsWith(value.toLowerCase())) {
              out.push({ kind: "value", key, value: t });
            }
          }
        } else if (key === "confidence") {
          for (const v of ["<60", "<80", ">80", ">90"]) {
            out.push({ kind: "value", key, value: v });
          }
        } else if (key === "pending") {
          for (const v of [">3d", ">7d", ">14d", ">30d"]) {
            out.push({ kind: "value", key, value: v });
          }
        }
        setSuggestions(out.slice(0, 8));
        return;
      }

      // Bare token: suggest qualifiers that start with it.
      const lower = token.toLowerCase();
      const matches = KNOWN_QUALIFIERS.filter((q) =>
        q.startsWith(lower),
      ).slice(0, 8);
      setSuggestions(
        matches.map((q) => ({
          kind: "qualifier" as const,
          key: q,
          hint: hintFor(q),
        })),
      );
    },
    [],
  );

  const onInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setText(v);
      setOpen(true);
      const caret = e.target.selectionStart ?? v.length;
      await computeSuggestions(v, caret);
    },
    [computeSuggestions],
  );

  // Apply a chip removal — strip a single field from the query.
  const removeChip = useCallback(
    (key: keyof ReviewQuery) => {
      const next = { ...query };
      delete next[key];
      onChange(next);
    },
    [query, onChange],
  );

  // Insert a suggestion at the caret.
  const applySuggestion = useCallback(
    (s: Suggestion) => {
      if (!inputRef.current) return;
      const caret = inputRef.current.selectionStart ?? text.length;
      let tokenStart = caret - 1;
      while (tokenStart >= 0 && !/\s/.test(text[tokenStart])) tokenStart--;
      tokenStart += 1;
      const before = text.slice(0, tokenStart);
      const after = text.slice(caret);
      const inserted =
        s.kind === "qualifier"
          ? `${s.key}:`
          : `${s.key}:${needsQuotes(s.value) ? `"${s.value}"` : s.value} `;
      const next = `${before}${inserted}${after}`;
      setText(next);
      setOpen(s.kind === "qualifier"); // keep open if user still needs a value
      // Commit on value pick.
      if (s.kind === "value") onChange(parseQuery(next).query);
      // Move caret to end of inserted segment.
      requestAnimationFrame(() => {
        const pos = before.length + inserted.length;
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      });
    },
    [onChange, text],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (open && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlight((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const s = suggestions[highlight];
          if (s) applySuggestion(s);
          return;
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onChange(parsed.query);
        setOpen(false);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [open, suggestions, highlight, applySuggestion, onChange, parsed.query],
  );

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-100">
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx={11} cy={11} r={7} />
          <line x1={21} y1={21} x2={16.65} y2={16.65} />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Filter by case, provider, status…"
          className="flex-1 border-none bg-transparent text-[14px] outline-none placeholder:text-zinc-400"
          aria-label="Filter the review queue"
          aria-autocomplete="list"
          aria-controls="copilot-suggestions"
          aria-expanded={open && suggestions.length > 0}
          aria-activedescendant={
            open && suggestions[highlight]
              ? `copilot-sug-${highlight}`
              : undefined
          }
          role="combobox"
        />
        {loading ? (
          <span className="text-[11px] font-mono text-zinc-400" aria-hidden>
            …
          </span>
        ) : null}
        {onHelpClick ? (
          <button
            type="button"
            onClick={onHelpClick}
            className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Show keyboard shortcuts"
            title="Help (?)"
          >
            ?
          </button>
        ) : null}
        <kbd
          className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500"
          aria-hidden
          title="Press / to focus this bar"
        >
          /
        </kbd>
      </div>

      {/* Chip strip */}
      <ChipStrip query={query} onRemove={removeChip} facets={facets} />

      {/* Unknown-qualifier did-you-mean */}
      {parsed.unknown.length > 0 ? (
        <DidYouMean
          unknown={parsed.unknown}
          onPick={(suggestion, raw) => {
            const next = text.replace(raw, suggestion);
            setText(next);
            inputRef.current?.focus();
          }}
        />
      ) : null}

      {/* Autocomplete dropdown */}
      {open && suggestions.length > 0 ? (
        <div
          id="copilot-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
        >
          {suggestions.map((s, i) => {
            const isActive = i === highlight;
            return (
              <button
                key={`${s.kind}-${s.key}-${"value" in s ? s.value : ""}`}
                id={`copilot-sug-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] focus-visible:outline-none ${
                  isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <span>
                  <span className="font-mono text-zinc-500">{s.key}:</span>
                  {s.kind === "value" ? (
                    <span className="ml-1 text-zinc-900">{s.value}</span>
                  ) : null}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {s.kind === "qualifier" ? s.hint : (s.meta ?? "")}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

// ─── Sub-components ───────────────────────────────────────────────

function ChipStrip({
  query,
  onRemove,
  facets,
}: {
  query: ReviewQuery;
  onRemove: (key: keyof ReviewQuery) => void;
  facets?: FacetCounts | null;
}) {
  const chips: Array<{ key: keyof ReviewQuery; label: string; tone?: string }> =
    [];

  const statusCount =
    facets && query.status
      ? facets.status[
          (query.status === "all" ? "pending" : query.status) as
            | "pending"
            | "approved"
            | "rejected"
        ]
      : undefined;
  if (query.status && query.status !== "pending") {
    chips.push({
      key: "status",
      label: `status: ${query.status}${statusCount != null ? ` · ${statusCount}` : ""}`,
    });
  }
  if (query.case)
    chips.push({ key: "case", label: `case: ${query.case}`, tone: "blue" });
  if (query.claimant)
    chips.push({ key: "claimant", label: `claimant: ${query.claimant}` });
  if (query.provider)
    chips.push({ key: "provider", label: `provider: ${query.provider}` });
  if (query.facility)
    chips.push({ key: "facility", label: `facility: ${query.facility}` });
  if (query.dx?.length)
    chips.push({ key: "dx", label: `dx: ${query.dx.join(", ")}` });
  if (query.med?.length)
    chips.push({ key: "med", label: `med: ${query.med.join(", ")}` });
  if (query.type?.length)
    chips.push({ key: "type", label: `type: ${query.type.join(", ")}` });
  if (query.confidence)
    chips.push({
      key: "confidence",
      label: `confidence ${query.confidence.op}${query.confidence.value}`,
      tone: "amber",
    });
  if (query.eventDateFrom || query.eventDateTo)
    chips.push({
      key: "eventDateFrom",
      label: `date: ${query.eventDateFrom ?? ""}..${query.eventDateTo ?? ""}`,
    });
  if (query.minDaysPending != null)
    chips.push({
      key: "minDaysPending",
      label: `pending >${query.minDaysPending}d`,
      tone: "red",
    });
  if (query.doc) chips.push({ key: "doc", label: `doc: ${query.doc}` });

  if (chips.length === 0) return null;

  return (
    <ul
      className="mt-2 flex flex-wrap items-center gap-1.5"
      aria-label="Active filters"
    >
      {chips.map((c) => (
        <li
          key={`${c.key}-${c.label}`}
          className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${chipToneClasses(c.tone)}`}
        >
          <span>{c.label}</span>
          <button
            type="button"
            onClick={() => onRemove(c.key)}
            aria-label={`Remove filter: ${c.label}`}
            className="rounded-full p-0.5 text-[12px] opacity-50 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function DidYouMean({
  unknown,
  onPick,
}: {
  unknown: Array<{ raw: string; key: string; value: string }>;
  onPick: (suggestion: string, originalToken: string) => void;
}) {
  const items = unknown
    .map((u) => ({
      ...u,
      suggestion: suggestQualifier(u.key),
    }))
    .filter((u): u is typeof u & { suggestion: Qualifier } => !!u.suggestion);
  if (items.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-amber-900"
    >
      <span className="text-amber-700">Unknown qualifier — did you mean</span>
      {items.map((u) => (
        <button
          key={u.raw}
          type="button"
          onClick={() => onPick(`${u.suggestion}:${u.value}`, u.raw)}
          className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-amber-900 hover:bg-amber-100"
        >
          {u.suggestion}:{u.value}
        </button>
      ))}
    </div>
  );
}

function chipToneClasses(tone: string | undefined): string {
  switch (tone) {
    case "blue":
      return "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
    case "red":
      return "border-red-200 bg-red-50 text-red-900 hover:bg-red-100";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100";
  }
}

function hintFor(q: Qualifier): string {
  switch (q) {
    case "case":
      return "HS-XXXXX";
    case "claimant":
      return "name";
    case "provider":
      return "doctor or clinic";
    case "facility":
      return "hospital";
    case "dx":
      return "ICD-10 codes";
    case "med":
      return "medication name";
    case "type":
      return "entry type";
    case "status":
      return "pending|approved|rejected";
    case "confidence":
      return "<60 / >80";
    case "date":
      return "yyyy-mm-dd..yyyy-mm-dd";
    case "pending":
      return ">7d";
    case "doc":
      return "PDF filename";
    case "assignee":
      return "me / username";
    case "reviewed-by":
      return "username";
  }
}

function needsQuotes(v: string): boolean {
  return /[\s"]/.test(v);
}
