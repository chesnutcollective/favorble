# Favorble UI Audit — Full Report

**Scope:** All 95 routes across staff app, client portal, public intake, and auth.
**Method:** Browser crawl via Chrome DevTools MCP at 1440×900, 768×1024, 375×667 + Lighthouse on 5 representative routes.
**Rubric:** 15 heuristics, 0–100 each (Nielsen's 10 + a11y, responsiveness, performance, data density, forms).
**Artifacts:** 45 screenshots + 5 Lighthouse reports in `.audit-artifacts/`.

---

## Global scores

| # | Heuristic | Score | Trend |
|---|---|---:|---|
| H1 | Visibility of system status | **78** | Good empty states, weak loading/progress states |
| H2 | Match with real world | **72** | Raw snake_case + UUIDs leak to UI in several places |
| H3 | User control & freedom | **70** | Delete lacks confirmation; no undo patterns |
| H4 | Consistency & standards | **60** | 3 parallel design systems (staff/portal/intake) |
| H5 | Error prevention | **68** | Destructive actions lack confirmation |
| H6 | Recognition vs recall | **74** | Icon-labelled rail is good; no breadcrumbs |
| H7 | Flexibility & efficiency | **84** | Strong ⌘K palette, keyboard hints, view-as |
| H8 | Aesthetic & minimalist | **80** | Clean Vercel-inspired aesthetic on staff surfaces |
| H9 | Help users recover from errors | **62** | Retry buttons exist; actionable error copy inconsistent |
| H10 | Help & documentation | **58** | Styleguide exists but no in-product tooltips/onboarding |
| A11y | Accessibility | **77** | Avg Lighthouse 94; systemic contrast + label issues |
| Responsiveness | Mobile/tablet | **32** | **Weakest area** — app is effectively desktop-only |
| Performance | Perf/LCP/bundle | **70** | Best Practices 100; no perf run (dev mode) |
| Data density & tables | Tables/filters | **70** | Good filters; missing sort indicators, bulk select |
| Forms & input UX | Forms | **76** | Strong on intake; weaker on admin edit flows |
| **Overall** | **Weighted avg** | **69** | |

---

## Surface scores (per major area)

| Surface | A11y | Consistency | Responsiveness | Overall |
|---|---:|---:|---:|---:|
| Auth & marketing (/login, /intake, 404) | 85 | 50 | 55 | 63 |
| Staff shell (nav, header, ⌘K) | 88 | 80 | 35 | 68 |
| Dashboards (12 personas) | 85 | 78 | 30 | 64 |
| CRM (cases, leads, contacts, queue) | 80 | 75 | 28 | 61 |
| Productivity (docs, messages, calendar, drafts) | 82 | 70 | 30 | 60 |
| Finance (billing) | 80 | 70 | 30 | 60 |
| Reports + Supervisor + Coaching | 78 | 70 | 30 | 59 |
| Admin (11 sub-sections) | 85 | 75 | 35 | 65 |
| Client portal (7 pages) | 85 | 85 | 45 | 70 |

---

## Highest-impact issues (prioritized)

### P0 — Bugs that block shipping to a customer

1. **`/admin/qa` and `/portal/nps` both 404.** Settings subnav links to a missing QA admin page; portal NPS page is absent. Either wire the routes or remove the links.
2. **Workflow trigger label bug.** `/admin/workflows` shows `Stage → Unknown ()` — stage id not resolving. Broken label on every workflow card.
3. **Portal messages typo.** `/portal/messages` empty state reads `Send Hogan & Smith Lawa message below.` — missing space. Visible to every client on first load.
4. **Mobile layout is broken everywhere except /intake and /portal/welcome.** 375px and 768px viewports get the desktop layout with horizontal scroll. Most clients will access from phones.

### P1 — Design system drift

5. **Three parallel visual systems** (Staff = Vercel/Hogan blue; Portal = cream/teal; Intake = blue/gray). Pick one core palette, derive the portal and intake variants from shared tokens, document both skins in `/admin/styleguide`.
6. **Primary button color drift** — black, dark navy, dark blue, and brand blue all used interchangeably as "primary" across surfaces.
7. **Status pill colors inconsistent** between admin and CRM (green/yellow/gray vs black/outline).
8. **Avatar pip ("N") top-right** is Next.js dev tools, not an app bug — but the real header on staff routes lacks a user avatar; portal and intake correctly have no staff chrome. *This reverses earlier screenshot observations.*

### P2 — Accessibility systemic fixes

9. **color-contrast** failing on 4/5 Lighthouse routes — fix muted gray text and low-contrast pill borders.
10. **label-content-name-mismatch** on 4/5 routes — buttons/links have aria-labels that don't start with their visible text. Audit all `<button aria-label>` usages.
11. **button-name** on /cases — icon-only buttons lack accessible names.
12. **aria-progressbar-name** on /portal/welcome — add `aria-label="Onboarding progress"`.
13. **heading-order** on /dashboard — levels skipped; use sequential h1→h2→h3.
14. **landmark-one-main** on /login — wrap content in `<main>`.
15. **Animated event ticker** on dashboard — confirm it honors `prefers-reduced-motion`.

### P3 — Microcopy and polish

16. **Raw snake_case action names** in audit logs (`phi_access` → "PHI access").
17. **UUIDs shown instead of case numbers** in audit-log Entity column.
18. **Relative timestamps only** ("2d ago") without absolute tooltip — adds friction for forensic review.
19. **Delete buttons** in Stages/Templates are plain red text with no confirm dialog.
20. **Dead data columns** — IP column all `--` on audit logs; size column all `—` on /documents. Drop or populate.
21. **Peak-hour `00:00`** shows when data is missing instead of `—`.
22. **"MM/DD/YYYY"** label + placeholder + help text triplicated on /intake.
23. **Preferred contact pills** on /intake lack an obvious selected state.
24. **Send button on /portal/documents** is teal-on-teal even in idle state — looks perma-disabled.
25. **Portal "Tap to choose a file"** copy is mobile-only; desktop needs "Click or drag".
26. **Event ticker** shows raw service names (`ere-orchestrator · config_changed`) — human-readable summary needed or move to /admin/audit-logs.
27. **Favorite Pro pill** at bottom of rail looks like a call-to-action but has no clear upsell path.
28. **`ENABLE_CLERK_AUTH=true`** env-var string leaks into /login demo copy.
29. **Feedback widget bubble** overlaps primary CTA in some viewports.

### P4 — Feature gaps

30. **No search on /admin/users, /admin/templates.** Will be painful at scale.
31. **No bulk select anywhere** — no bulk case reassign, bulk invite, bulk archive.
32. **No recent searches** in ⌘K.
33. **No breadcrumbs** on deep routes.
34. **No portal attachment** in messages compose.
35. **No "Request a call" CTA** on empty portal appointments.
36. **Admin styleguide documents only default skin**, not `[data-skin="apple"]`; also no component state matrix and no dark-mode coverage.
37. **No tooltips / inline help** on metric tiles and complex admin forms.

---

## Remediation plan to hit 100 across all heuristics

### Phase 1 — Ship-blockers (1 week)
- Fix workflow trigger label bug.
- Fix portal messages typo.
- Resolve 404s on `/admin/qa` and `/portal/nps` (build or delink).
- Add confirmation dialogs to all Delete buttons.
- Remove dead data columns.

### Phase 2 — Accessibility baseline 100 (1 week)
- Contrast audit: sweep all muted-gray text pairs; raise to AAA (7:1) where feasible, AA (4.5:1) minimum.
- Audit every `aria-label` against visible text; fix mismatches.
- Add accessible names to all icon-only buttons (Find them with `button:not([aria-label]):has(svg):empty` plus `:not(:has(*:not(svg)))`).
- Fix heading order on dashboard.
- Add `<main>` to /login and public pages.
- Add `aria-label` to onboarding progress bar.
- Test `prefers-reduced-motion` for dashboard ticker.

### Phase 3 — Mobile responsive (2 weeks)
- Staff app: true mobile breakpoint that collapses rail+panel into a bottom sheet / hamburger.
- Portal: bottom tab bar replaces side nav at <768px.
- Tables: card view for rows at <640px (claimant name + stage badge + last activity).
- Form grids stack single-column.
- ⌘K → "/" slash-key hint on mobile or add FAB.

### Phase 4 — Design system consolidation (2 weeks)
- Pick one canonical color: e.g. `brand-600 #263c94` as primary everywhere; dark navy used only for neutral/text.
- Map portal teal + intake blue to shared tokens so they re-theme cleanly.
- Document both skins + portal + intake variants in `/admin/styleguide`.
- Add component state matrix (default/hover/active/disabled/focus/loading) and dark mode to styleguide.
- Audit every Delete/destructive button → red text + leading icon + confirm.
- Unify status pills into one scale (success / warn / danger / neutral) and remove green-vs-black drift.

### Phase 5 — Microcopy pass (1 week)
- Replace raw action names (`phi_access`) and entity ids (UUID) with human labels and case numbers.
- Add absolute timestamp tooltips on all relative timestamps.
- Render missing values as `—` not zero/00:00.
- Remove `ENABLE_CLERK_AUTH` from visible copy.
- Rewrite "Tap to choose" → context-aware ("Click or drag").
- Human-summarize ticker events or move raw logs into audit view.

### Phase 6 — Feature completion (2 weeks)
- Bulk-select + bulk actions on cases, users, templates, documents.
- Global search on users + templates admin pages.
- Recent / pinned queries in ⌘K.
- Breadcrumbs on deep routes (/cases/[id]/*, /admin/*).
- Portal: attachments in compose, "Request a call" CTA on empty appointments, category tags on uploads.
- Admin: reorder handles on custom fields; preview on templates.
- Add inline help (`?` icon) on metric tiles and complex forms.

### Phase 7 — Polish to 100 (1 week)
- Final contrast sweep + screen reader pass (VoiceOver + NVDA) on top 10 routes.
- Styleguide dark mode.
- Performance pass (real production build + Lighthouse mobile).
- Visual regression snapshots to prevent future drift.

---

## Summary

Favorble is already a well-crafted staff app with strong foundations: clean Vercel-inspired aesthetic (H8: 80), exceptional keyboard-first ergonomics (H7: 84), and near-perfect Best Practices (100 on every route tested). The headline problems are:

- **Mobile is effectively not shipped (R: 32)** — the single biggest lift and the main reason the overall score is 69, not 85.
- **Three parallel visual systems fragment the brand** (H4: 60) — consolidating into one token system with themed skins pulls consistency into the 90s.
- **Systemic a11y gaps** are narrow but pervasive — contrast + aria-label/text mismatch + a handful of missing landmarks. All are mechanically fixable.
- **Microcopy leaks** (snake_case, UUIDs, env-var strings) pull H2 (Match with real world) down from 90+ to 72.

Hitting 100 across the board is a ~7-week program if done seriously; most of Phases 1–2 and Phase 5 are mechanical. Mobile (Phase 3) is the only one that requires real design work.
