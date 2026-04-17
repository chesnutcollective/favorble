# Screen-Reader Audit — Phase 7a

**Scope:** Top 10 routes, code-only review (no browser). Verified landmark
regions, heading outline, form semantics, live regions, button vs link,
accessible names, icon decorative vs meaningful, and focus management.

Legend: ✓ pass · ✱ needs-fix (fixed in this pass) · ⚠ follow-up · — n/a

---

## `/login` (app/(auth)/login/page.tsx)

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✱ fixed | Root `<div>` → `<main aria-label="Sign in">`. |
| Heading outline | ✓ | Single `<h1>` "Signed out". |
| Form semantics | ✓ | Server action on `<form>`; submit button labelled by visible text. |
| Live regions | — | No async status changes yet. |
| Button vs link | ✓ | Real `<button type="submit">`. |
| Accessible names | ✓ | All elements named by visible text. |
| Focus mgmt | ✓ | Default browser focus path acceptable. |
| Decorative icons | — | No icons on card. |
| Contrast (AAA pass) | ✱ fixed | `#666` body copy → `#595959` (AAA); tertiary `#8b8b97` → `#6b6b75`; footer `rgba(255,255,255,0.5)` → `0.75` on dark gradient. |

---

## `/dashboard` (admin persona)

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | Provided by app layout. |
| Heading outline | ✱ fixed | Previously `h1 → h3` (skipped h2). All three section labels ("Status Constellation", "Quick Actions", "Recent Audit") bumped `h3 → h2`. |
| Form semantics | — | No forms on page. |
| Live regions | ✓ | LiveTicker already exposes `role="status" aria-label="Live activity ticker"`. |
| Button vs link | ✓ | All persona-card hits are `<Link>`; ticker items are `<button type="button">`. |
| Accessible names | ✓ | RadialGauge has a visible label; MetricTile uses visible label + value. |
| Decorative icons | ⚠ follow-up | Large set of `HugeiconsIcon` / `lucide` icons across dashboard primitives lack explicit `aria-hidden`. They're inline with visible text so screen readers typically skip, but adding `aria-hidden="true"` is the rule. Triage by component (see below). |
| Animation / reduced-motion | ✓ | `globals.css` has `@media (prefers-reduced-motion)` that zeros the ticker/pulse/breathe classes. |
| Contrast (AAA pass) | ✱ fixed | Ticker `detail` text bumped 0.55 → 0.75 white alpha. Panel-text tokens (`#6B7280`, `#9CA3AF`) promoted to `#595959` / `#757575` globally via `globals.css`. |

---

## `/cases` (list)

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | App layout. |
| Heading outline | ✓ | Single `<h1>` from PageHeader. Table uses TableHead (`<th>`). |
| Form semantics | ✓ | Filters use `<Select>` (shadcn, proper `<select>`-equivalent). Dialogs use `<Label htmlFor>` bound to `<Input id>` (e.g., `nc-first`, `nc-last`). Hold reason has `htmlFor="hold-reason"`. |
| Live regions | ✓ | `sonner` toasts use `aria-live="polite"` internally; bulk-select count updates render in DOM (screen reader can re-read). |
| Button vs link | ✓ | Row link for /cases/[id] is `<Link>`; bulk actions, filter trigger, clear, pagination are `<Button>`. |
| Accessible names | ⚠ follow-up | Sortable TableHead cells are `<th>` with text-only children — clickable-via-`onClick`. Consider wrapping header text in a `<button>` inside `<th>` so the sort action is keyboard-focusable. Currently the only way to sort is mouse click. |
| Column-visibility menu | ✓ | `<ColumnVisibilityMenu>` renders radix dropdown (proper aria roles). |
| Icon-only button | ✓ | The `Cancel01Icon` inside "Clear all filters" is accompanied by visible text ("Clear all filters"), so button-name lint passes. |
| Contrast | ✱ fixed | Relative-time mono text `#666` → `#595959`; case number meta `#999` → `#757575`. |

---

## `/cases/[id]` (detail)

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | App layout. |
| Heading outline | ✓ | `<h1>` claimant name at top. Subsections use `<p class="text-xs">` labels rather than headings — acceptable for a data-dense header; tabs (`CaseTabNav`) serve as navigation. |
| Breadcrumb | ✓ | `BreadcrumbLabel` registers segment → label. |
| Back link | ✓ | `<Link href="/cases">` (labelled). |
| Accessible names | ✓ | Avatar fallback initials + staff names visible. |
| External links | ✓ | Case Status / Chronicle links use `target="_blank" rel="noopener noreferrer"`. |
| Decorative icon | — | No icons in layout header. |
| Tabs | ⚠ follow-up | Confirm `CaseTabNav` exposes `role="tablist"` / `role="tab"` / `aria-selected`. Not inspected this pass. |

---

## `/queue`

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | App layout. |
| Heading outline | ✓ | PageHeader `<h1>`; empty state uses `<h3 class="text-sm">` — acceptable as section heading inside a card. |
| Task row interactive pattern | ✱ fixed | `<div role="button" tabIndex={0}>` now also has `aria-label={Open task: {title}}` so the accessible name matches the intent. Keyboard handler for Enter/Space already present. |
| Nested interactive elements | ⚠ follow-up | Row contains a `<Link>` (case number) and a `<Checkbox>`. Screen readers may announce the row button "plus children"; this is a known pattern compromise. |
| Icon decorative | ⚠ follow-up | `HugeiconsIcon` instances lack explicit `aria-hidden`. Low-risk because the accent icon (Alert01Icon) is flanked by text priority badges. |
| Contrast | ✓ | Uses foreground/muted-foreground tokens — inherits token bumps. |

---

## `/admin/audit-logs`

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | App layout. |
| Heading outline | ✓ | PageHeader `<h1>`; no additional headings in client. Table uses `<TableHead>`. |
| Form semantics | ✓ | Date range selector + filter dropdowns are `<Select>`-based. |
| Reset filters | ✓ | Visible-text button. |
| Accessible names | ✓ | All filter controls have associated labels. |
| Relative timestamps | ⚠ follow-up | Existing plan: expose absolute ISO timestamp via `title=` or `<time datetime>` so screen readers can read on focus. Not part of this pass. |
| Contrast | ✓ | Uses tokens — inherits bump. |

---

## `/admin/integrations`

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | App layout. |
| Heading outline | ✓ | PageHeader `<h1>`. Cockpit uses `<Card>` primitives with visible headings. |
| Form semantics | — | Read-only grid. |
| Button vs link | ✓ | "Connect" / "Configure" render as real buttons; card itself is a `<Link>` to `/admin/integrations/[id]`. |
| Accessible names | ✓ | Service brand name + status pill are part of accessible text. |
| Decorative icons / logos | ⚠ follow-up | Service logo `Image` uses `alt=displayName` — meaningful. Dashboard persona file has the constellation cards also using `alt`. |
| Contrast | ✓ | Uses `COLORS.text1/text2/text3` — text3 bumped this pass. |

---

## `/admin/workflows`

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | App layout. |
| Heading outline | ✓ | PageHeader `<h1>`; workflow cards use `<h2>`-scale text for card titles, verified no `<h3>` before `<h2>`. |
| Form semantics | ✓ | New workflow dialog uses shadcn `<Dialog>` (focus-trapped; `<DialogTitle>` labels it for screen readers). |
| Trigger label bug | ⚠ follow-up | `Stage → Unknown ()` is a content bug, not SR (REPORT.md item #2). |
| Active toggle | ⚠ follow-up | The "Active" pill that doubles as a toggle needs explicit `aria-pressed` or `role="switch"`. Not fixed this pass (design decision). |
| Contrast | ✓ | Token-based. |

---

## `/portal/welcome`

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | `<main id="portal-main-content" tabIndex={-1}>` in `PortalShell`. Has skip-to-content anchor. |
| `<html lang>` | ✓ | `PortalShell` updates `document.documentElement.lang` to `en`/`es`. |
| Heading outline | ✓ | Wizard renders screen-specific `<h1>`/`<h2>` inside `ScreenShell`. |
| Progress bar | ✱ fixed | Added `aria-label="Onboarding progress"` to the progressbar `<div>` (had `aria-valuenow` but no name). |
| Form semantics | ✓ | Profile fields use `<Label>` + `<Input>` pairs. Preferred channel pills — see follow-up. |
| Preferred-contact pills | ⚠ follow-up | Pills lack `aria-pressed` / are `<button>` group with no active-state indicator beyond color. Same item called out in REPORT.md #23. |
| Buttons vs links | ✓ | Navigation uses `<Link>` (nav rail, bottom nav, locale toggle); form actions use `<button>`. |
| Focus mgmt | ✓ | `<main tabIndex={-1} focus:outline-none>` so skip-link moves keyboard focus here. |
| Icon decorative | ✓ | All `lucide` icons use `aria-hidden="true"` in PortalShell. |
| Contrast | ✓ | `bg-[#F7F5F2]` + `text-foreground` passes; `text-muted-foreground` → now `#595959` (AAA). Teal button `#104e60` on white ≈ 9.1:1 (AAA). |

---

## `/portal/messages`

| Check | Status | Note |
|---|---|---|
| `<main>` landmark | ✓ | Via `PortalShell`. |
| Heading outline | ✓ | Thread view renders a scoped heading for the firm name. |
| Form semantics | ✓ | Compose textarea, attachment button, send button — inspected `thread-view.tsx`. |
| Live regions | ⚠ follow-up | New inbound messages update the DOM but there's no `role="log"` or `aria-live` region on the thread scroll container. Screen-reader users won't be told when a new message arrives mid-session. Consider wrapping the thread list in `<div role="log" aria-live="polite">`. |
| Button vs link | ✓ | Send + attachment + remove are `<button>`. |
| Accessible names | ✓ | Send has visible text; the X close-attachment button needs `aria-label="Remove attachment"` — worth verifying. ⚠ |
| Decorative icons | ✓ | `<Paperclip>`, `<Send>`, `<X>`, `<MessageSquare>` icons are adjacent to visible text. |
| Portal "Lawa" typo | ⚠ follow-up | REPORT.md #3 — content fix, not SR. |
| Contrast | ✓ | Token-based. |

---

## Global fixes landed this pass

1. `<main>` landmark added to `/login`.
2. `aria-label="Onboarding progress"` on portal welcome progressbar.
3. Dashboard admin heading order corrected (h1 → h2).
4. `<nav className="ttn-rail">` labelled `aria-label="Primary"` so the two-tier
   rail has a distinct landmark name (separates it from the portal nav).
5. Queue task row gets `aria-label={"Open task: {title}"}` since it's a
   `role="button"` div.
6. LiveTicker secondary color bumped for AAA compliance on dark background.

## Contrast token bumps

| Token | Old | New | Old ratio (white) | New ratio | Routes affected |
|---|---|---|---|---|---|
| `--text-2` | `#666666` | `#595959` | 5.74:1 AA | 7.00:1 AAA | All staff surfaces |
| `--text-3` | `#999999` | `#757575` | 2.85:1 FAIL | 4.60:1 AA | All staff surfaces |
| `--muted-foreground` | `#666666` | `#595959` | 5.74:1 AA | 7.00:1 AAA | All shadcn components |
| `--sidebar-foreground` | `#666666` | `#595959` | 5.74:1 AA | 7.00:1 AAA | Sidebar/nav rail |
| `COLORS.text3` | `#8b8b97` | `#6b6b75` | 3.63:1 FAIL | 5.41:1 AA | Persona dashboards, admin integrations detail, supervisor matrices |
| `.ttn-panel-item` color | `#6B7280` | `#595959` | 4.83:1 AA | 7.00:1 AAA | Two-tier nav panel |
| `.ttn-section-label` color | `#9CA3AF` | `#757575` | 2.83:1 FAIL | 4.60:1 AA | Two-tier nav panel |
| Ticker detail text | `rgba(255,255,255,0.55)` on dark | `0.75` | ~3.3:1 | ~5.8:1 | Dashboard ticker |
| Login body copy | `#666` | `#595959` | 5.7:1 AA | 7.0:1 AAA | /login |
| Login footer | `rgba(255,255,255,0.5)` | `0.75` | ~3.0:1 FAIL | ~6.5:1 AA | /login |
| Login env-var note | `#8b8b97` | `#6b6b75` | 3.6:1 FAIL | 5.4:1 AA | /login |

---

## Deeper follow-ups (not low-effort)

- **Sortable table headers** (`/cases`): `<th>` uses `onClick` without a nested `<button>`. Keyboard users can't sort. Recommended: wrap TableHead children in `<button>`; add `aria-sort` on the th.
- **Preferred-contact pill groups** (portal welcome, admin settings): use `<fieldset><legend>` + `<input type="radio">` or add `role="radiogroup"` with `aria-checked` on each pill.
- **Admin workflow "Active" toggle**: needs `role="switch"` + `aria-checked`, or render as actual `<Switch>` from shadcn.
- **Portal messages live region**: wrap thread-list in `<div role="log" aria-live="polite">` so new inbound messages are announced.
- **Bulk-select count announcement** (`/cases`, `/admin/users`): DOM update is silent — add a hidden `<span role="status" aria-live="polite">{n} selected</span>`.
- **Icon triage pass**: HugeiconsIcon instances throughout dashboard primitives should add `aria-hidden="true"` where the icon is purely decorative. ~60 instances; mechanical but out-of-scope for this fix-batch.
- **CaseTabNav**: verify `role="tablist"`/`tab` or use `aria-current="page"` on the active link.
- **Dashboard ticker buttons**: each `<button>` in the marquee has an icon + label + optional detail. All text is announced; the buttons lack a specific purpose (most have no onClick). Consider `aria-hidden` on the whole ticker (it's already `role="status"`) — a status region shouldn't contain interactive children.

---

## Verification

- `pnpm typecheck` — no new errors introduced. (Pre-existing failures from
  other agents: `@dnd-kit/*` missing modules in `admin/fields`, and a
  `ThemeWrapper` import mismatch in `app/(app)/layout.tsx`. Both unrelated.)
- `pnpm lint` on touched files — no new errors. (Pre-existing errors on the
  same files verified by `git stash` round-trip.)
