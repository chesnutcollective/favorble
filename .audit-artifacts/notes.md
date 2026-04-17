# UI Audit — Running Notes (chronological)

## Rubric (15 heuristics, 0-100 each)

1. **H1 Visibility of system status** — loading/empty/error/success feedback
2. **H2 Match with real world** — microcopy, mental models, legal domain language
3. **H3 User control & freedom** — undo, escape hatches, cancel paths
4. **H4 Consistency & standards** — component reuse, token usage, naming
5. **H5 Error prevention** — validation, confirmations for destructive ops
6. **H6 Recognition vs recall** — labels over icons, breadcrumbs, saved state
7. **H7 Flexibility & efficiency** — keyboard shortcuts, bulk actions, cmd-k
8. **H8 Aesthetic & minimalist** — visual hierarchy, whitespace, chart clarity
9. **H9 Help users recover from errors** — actionable errors, retry UX
10. **H10 Help & documentation** — tooltips, onboarding, empty-state help
11. **A11y** — contrast, focus rings, keyboard nav, ARIA, semantic HTML
12. **Responsiveness** — desktop 1440, tablet 768, mobile 375
13. **Performance** — LCP, CLS, JS weight, font loading, image opt
14. **Data density & tables** — column sizing, sort/filter, row density, pagination
15. **Forms & input UX** — labels, errors, autofill, save state, multi-step

---

## Observations per route

> **CORRECTION (mid-audit)**: The "N" circle appearing top-right on every screenshot is the **Next.js dev-tools floating button** (`NEXTJS-PORTAL`, class `fixed right-3 z-[999999] rounded-full`), NOT a production app avatar. It is not present in production builds. Earlier notes flagging this as a chrome-leak or identity bug should be **disregarded**. Real chrome-leak concerns remain valid only where staff-specific UI actually renders (e.g., real Hogan Smith logo on non-staff surfaces, if any).


### /dashboard (admin persona) — desktop 1440
- Nav rail (dark #1C1C1E) with 12 persona items, panel with "Admin Console" header, quick actions, system stats, cron schedule, recent activity.
- Main: "Firm Pulse 100" gauge, event ticker (scrolling `ere-orchestrator config_changed`), Status Constellation grid of integration cards.
- **Good**: Clear hierarchy, strong gauge anchor, uppercase section labels, kbd hint (⌘K) in search.
- **Issues**:
  - Avatar "N" top-right doesn't match "Jake" (initials should be "JA") — identity bug.
  - Event ticker is tiny mono/technical — raw logs leaked to UI, poor microcopy (H2).
  - Status Constellation cards have inconsistent heights.
  - Feedback widget bubble competes with primary CTA.
  - Rail scroll fades imply overflow but no visible cut-off on first view.
- Console: zero errors/warns.

### /login — desktop 1440
- Dark teal gradient background, centered white card, "Signed out" + "Sign in as demo admin" button.
- **Issues**:
  - Avatar "N" still rendering on signed-out page — chrome leaking (shell layout not scoped correctly).
  - Dark gradient clashes with pale neutral app aesthetic — jarring on successful login.
  - No brand logo on card — only text "Favorble — Powered by Hogan Smith" in footer.
  - "demo admin" microcopy uses raw env-var string `ENABLE_CLERK_AUTH=true` — dev-facing.

### /intake/hogan-smith — desktop 1440
- Blue brand (#263c94), light gray bg, 5-step progress, Personal Information form.
- **Good**: Clear step count, "Estimated time: 10-15 min", confidentiality footer, EN/ES toggle, inline help text.
- **Issues**:
  - Avatar "N" on PUBLIC intake page — critical bug, reveals staff chrome to claimants.
  - "MM/DD/YYYY" label + placeholder + help text — triplicated.
  - "Preferred contact method" pills lack obvious selected/active state.
  - "Back" button shown on step 1 — should be disabled or hidden.
  - Third visual system (blue on gray) — drift from admin/portal.

### /intake 404 (bad slug)
- Large centered "Favorble" mark, "404" + "Page not found" + "Back to dashboard".
- **Issues**:
  - Button goes to /dashboard — but a public visitor landing on a bad intake slug won't have auth; leads to login.
  - Avatar "N" shown on 404 → chrome leaking again.
  - Button is black pill, but dashboard CTA uses dark blue, login uses dark navy — 3 different primary button treatments.

### /portal/welcome (client portal) — desktop 1440
- Warm cream bg (#f5f1ea-ish), teal primary (#004b55-ish), own nav (Home/Messages/Appointments/Documents/Treatment log/Profile).
- 4-step onboarding wizard, "Hello Robert" greeting, English/Español toggle.
- **Good**: Warm, approachable tone, localized, simple nav, step progress.
- **Issues**:
  - Staff avatar "N" rendering on client portal — serious chrome leak.
  - Portal design system is a completely different palette + components from admin/intake — fragmented brand.
  - Nav has no active indicator — unclear where user is.
  - "Logout" button uses pill-outline style that mirrors primary — affordance collision.
  - `HS-2026-1001` case ID in header but not linked.

### /admin/integrations — desktop 1440
- Grid of service cards (Google/Microsoft/Box/SSA.gov/Zoom/etc.) with status, "Connect"/"Configure" buttons, counts at top.
- **Good**: Clear card grid, brand marks readable, single primary CTA per card.
- **Issues**:
  - Top-level counts "connected vs configured" ambiguous — unclear which means "ready to use".
  - Status badge colors (green/yellow/gray) inconsistent with other admin status pills (which are black/outline).
  - Persistent "N" avatar bug in header.

### /admin/users — desktop 1440
- Table with Avatar/Name/Role/Status/Last active/Actions.
- **Issues**:
  - Role pill: "Admin" is filled black, other roles are outline — implies hierarchy that isn't actually meaningful.
  - No sort indicators on column headers.
  - No search/filter controls (table may exceed 20+ users at scale).
  - No bulk select → bulk deactivate/invite is a missing flow.

### /admin/styleguide — desktop 1440
- Color swatches, type scale, button variants, shadow/radius tokens, form samples.
- **Good**: Exists at all — rare for CRMs. Shows token system.
- **Issues**:
  - Only documents default skin, not the Apple skin (`[data-skin="apple"]`) the CSS supports.
  - No component state matrix (default/hover/active/disabled/focus/loading).
  - No dark-mode coverage despite system-level dark-mode handling hinted at in globals.css.

### /admin/audit-logs — desktop 1440
- KPI tiles (266 / 1 / Jake Admin / case), rich filter row (user/entity/action/date/severity), paginated table.
- **Good**: Excellent filter affordances, "191 matching entries" live count, Reset Filters button.
- **Issues**:
  - Peak hour "00:00" is a null-ish stat masquerading as a real value — should render `—` when unknown.
  - `phi_access` shown as raw snake_case action pill — needs human label ("PHI access").
  - Entity cell shows raw UUID — should be a linked case number (`HS-####`) with UUID in a tooltip.
  - IP column all `--` → dead data column. Drop it or populate.
  - Timestamp is relative only ("35m ago / 2d ago") — need absolute on hover for forensic review.

### /admin/fields — desktop 1440
- Tabs (Global/Intake/Filing/Medical Records/Case Management/Hearings) with counts, grouped card rows, Edit CTA per row.
- **Good**: Grouping by domain, type pills (Long Text / Yes/No / Date / Currency / Dropdown), clear "New Field" CTA.
- **Issues**:
  - No reorder handles despite it being a field admin screen.
  - "Edit" is the only affordance — no delete, clone, archive, or "preview in form".
  - Field key (snake_case) sits in a pill next to display label — visual equal weight; should be de-emphasized.

### /admin/stages — desktop 1440
- "Case Stages" with group→stages hierarchy, drag handles, colored dots per group, "Client sees" paraphrase.
- **Good**: Surfaces client-facing labels explicitly ("Client sees: 'Getting Started'"), drag handles visible, stage codes (1A/2B).
- **Issues**:
  - "Delete" action is destructive red text with no confirmation affordance in-row — risky with one accidental click.
  - Color dot for "Intake" group is gray; Application is green; Reconsideration is yellow — no legend explains scheme.
  - "Initial" tag on 1A is unlabeled — is it "first stage in flow" or "initial-status" concept?

### /admin/templates — desktop 1440
- 3-column card grid, Category pill + merge-field count + Signature Required flag, Edit/Delete row.
- **Good**: Scannable, meta pills useful.
- **Issues**:
  - "Signature Required" uses yellow pill; other pills are gray — color encodes warning/attention but on a steady-state attribute.
  - No search — 20+ templates will be painful.
  - No preview; Edit jumps straight to editor.
  - Edit and Delete side-by-side with identical visual weight; Delete should require confirmation.

### /admin/workflows — desktop 1440
- Workflow cards with trigger/tasks table, Active/Edit/Delete row, per-task Assign To/Due/Priority.
- **Good**: Workflow card + task table is excellent info density.
- **Issues**:
  - Trigger reads "Stage → Unknown ()" — broken label; stage id not resolving to human name (bug).
  - "Active" button looks like a toggle but is clickable — is it a status badge or a toggle? ambiguous.
  - Priority pills (urgent red, high red) use same color for two levels — no distinction.
  - Due values `+1 cal days` — human-unfriendly microcopy.

### /admin/qa — desktop 1440
- **CRITICAL**: Route returns Favorble 404 page ("Page not found"). Expected QA admin surface missing.
- Breaks the Settings subnav which links to it implicitly; broken link is a high-severity bug.

### /admin/compliance — desktop 1440
- 3 KPI tiles (Open / Critical / High), tabs (Open findings / Rules / All findings), empty-state "No open findings. Nicely done."
- **Good**: Friendly empty state, tab structure, KPI tiles.
- **Issues**:
  - KPI tiles sized equally regardless of value (0/0/0) — they feel template-y rather than informative.
  - "Critical 0" is red; "High 0" is orange even with zero findings — color should gate on actual severity, not scale.
  - No "Run checks now" or last-scan timestamp — makes the page feel passive.

### /admin/ai-review — desktop 1440
- Rich reviewer UI: chip filters (Triage/Low confidence/Stale/My queue/All pending/Recently approved/Recently rejected), keyboard hints (R/E/A on buttons), facts card, source highlights with char ranges, source PDF pane (unavailable state).
- **Good**: Keyboard-first design with visible hotkey hints, locked session indicator, Prev/Next/Skip, 80% confidence chip, source highlights linked to char offsets.
- **Issues**:
  - "Source PDF unavailable" state offers Retry but no alternative (e.g. "download original", "view raw text").
  - "Locked: HS-62740" is orange but not obviously a warning — should explain why the record is locked and by whom.
  - "0 reviewed this session" stat is passive; should celebrate streak / show goal.

### /admin/feedback — desktop 1440
- Feedback triage inbox (bugs, feature requests, UX issues).
- **Observations**: Layout follows admin pattern; will note issues after reading screenshot in next pass.

### /admin/general — desktop 1440
- Organization & account settings.

### /portal/profile — desktop 1440
- Warm cream bg, portal nav (Home/Messages/Appointments/Documents/Treatment log/Profile), "Your profile" card with name/email/phone/status, Language toggle, Session/Log out.
- **Good**: Plain-language tone ("This is the information we have on file"), language persistence copy, clear session card.
- **Issues**:
  - Persistent staff "N" avatar in header — same chrome-leak bug.
  - Status value shown as raw `invited` (lowercase, ambiguous) — should be title case with definition ("Invited — account not yet activated").
  - No edit/request-change affordance ("Contact your attorney" is only instruction — could at least open Messages thread prefilled).
  - Language toggle shows "English/Español" but header still says `EN` — two truths for language.
  - Log out duplicates the header Logout button.

### /portal/appointments — desktop 1440
- Empty state "No appointments yet" with explanation copy.
- **Good**: Friendly, explanatory empty state with aligned icon.
- **Issues**:
  - No "Request a call" or "Contact your team" CTA — empty state is terminal.
  - Header icon is a circular tile, empty-state icon is a larger tile, both teal — visual stutter.

### /portal/messages — desktop 1440
- Single thread "Hogan & Smith Law", "Start the conversation" empty state, compose box with ⌘+Enter hint.
- **Good**: "Usually replies within 1 business day" expectation-setting, keyboard hint, clean compose.
- **Issues**:
  - **Typo/spacing**: "Send Hogan & Smith Lawa message below." — missing space between "Law" and "a" (concat bug).
  - No attachment button in compose.
  - No read/delivery receipts visible in empty state — copy says "you'll see every update from your team right here" but no mechanism is shown.

### /portal/documents — desktop 1440
- Upload dropzone ("Tap to choose a file") with Send button, "Shared with you" section with empty state.
- **Good**: Explicit "UPLOADS FROM YOU" vs "SHARED WITH YOU" split, accepted file types microcopy, expectation copy.
- **Issues**:
  - Send button is disabled-looking (low-contrast teal on teal) even before selecting a file → can't tell if it's active or not.
  - "Tap" copy is mobile-first — on desktop this should read "Click or drag a file" since drag-drop presumably works.
  - No upload queue / progress indicators shown.
  - No category tagging ("Medical", "ID", "Other") — attorney then has to triage every upload.

### /portal/treatment-log — desktop 1440
- "Log a visit" CTA + empty state "No visits logged yet."
- **Good**: Active CTA upfront, clear copy, teal+primary fidelity with rest of portal.
- **Issues**:
  - No past-entries view scaffolded — empty state only. Would benefit from a small example card.
  - "Log a visit" button goes to a form but we don't see reminders/nudges — high-signal activity that could use a weekly reminder.

### /portal/nps — desktop 1440
- **CRITICAL**: Returns app-default 404 (admin's "Favorble" page-not-found). Portal NPS surface doesn't exist at this path. Either:
  - Route simply doesn't exist — remove from audit scope or doc, OR
  - Expected to be a client-facing NPS survey that is missing — build gap.

### App shell — nav, header, subnav, command palette, view-as
- Two-tier nav confirmed working: rail (72px) + contextual panel (184px) with cookie-persisted collapse state. Rail has 12+ persona items, "Hide" toggle, JA user button w/ ARIA label "Jake Admin — profile and view-as menu", What's New w/ 9+ badge, Favorble Pro pill.
- Header contains search trigger (⌘K) and breadcrumb-free context. No avatar component in header on staff routes — confirmed after correcting "N" misidentification.
- **Command palette (⌘K)**:
  - **Good**: opens instantly, modal with placeholder ("Search cases, contacts, documents, emails..."), helpful microcopy with example query syntax (`case:HS-12345`, `@name`, `stage:4D`, `this week`), footer hotkey legend (↑↓ navigate · ↵ open · ⌘↵ new tab · esc close). Excellent.
  - **Issues**: "0 results" appears before any query is typed (should say "Start searching" or hide); no recent searches / pinned queries; mobile (<768) presumably has no ⌘K equivalent (verify in mobile pass).
- **View-as menu**: JS click on the user button did not visibly open the menu in screenshot — needs pointer event. Will revisit in Lighthouse/manual pass if time.
- **Status ticker**: horizontally scrolling event strip with raw service names (`ere-orchestrator · config_changed`). A11y concern — animated ticker may violate `prefers-reduced-motion` (globals.css does have reduced-motion handling; verify ticker honors it).
- **Header breadcrumbs**: None. Deep routes (e.g. /cases/[id]/documents) would benefit from a breadcrumb trail. Panel subnav partially compensates.

### Lighthouse (desktop navigation mode, 5 routes)
| Route | A11y | Best Practices | SEO | A11y failures |
|---|---|---|---|---|
| /login | 98 | 100 | 60 | landmark-one-main, is-crawlable |
| /dashboard | 95 | 100 | 63 | color-contrast, heading-order, label-content-name-mismatch, is-crawlable |
| /cases | 91 | 100 | 63 | button-name, color-contrast, label-content-name-mismatch, is-crawlable |
| /portal/welcome | 92 | 100 | 60 | aria-progressbar-name, color-contrast, label-content-name-mismatch, is-crawlable |
| /admin/integrations | 96 | 100 | 63 | color-contrast, label-content-name-mismatch, is-crawlable |

**Systemic a11y issues** (appear on most/all routes):
1. **color-contrast** (4/5 routes) — failing color-contrast pairs need fixing (likely muted gray text, outline pill borders, badge colors).
2. **label-content-name-mismatch** (4/5 routes) — button/link visible text differs from accessible name (aria-label). Screen readers say something different than what sighted users see.
3. **is-crawlable** (5/5) — page blocks crawlers (expected on auth-required pages / dev). Not real SEO gap; ignore for staff app, fix for marketing pages.
4. **button-name** (cases) — button exists with no accessible name. Likely an icon-only action button.
5. **heading-order** (dashboard) — heading levels skipped.
6. **aria-progressbar-name** (portal/welcome) — step progress bar has no ARIA name. Easy fix: add `aria-label="Onboarding progress"`.
7. **landmark-one-main** (login) — missing `<main>` landmark. Add `<main>` wrapper to login page.
8. **Best Practices: 100 everywhere** — no console errors, no deprecated APIs, HTTPS passes (dev), no mixed content. Strong baseline.

### Mobile responsive pass (375×667 + 768×1024)
- **Staff dashboard @ 375**: Layout does NOT respond. Rail (72px) + panel (184px) + main all present, full 1440-ish layout → horizontal scroll required on mobile. globals.css has a 1023px breakpoint but the tested surfaces (dashboard, cases, admin) clearly don't honor it. Breakpoint may only hide rail, not collapse main content.
- **Cases table @ 375**: Table renders at full desktop width; columns don't stack or collapse. Pipeline filter column is present, adding to horizontal bloat.
- **Portal @ 375**: Portal nav is a vertical list rendered side-by-side with content card at desktop proportions; not a mobile-native layout. Onboarding step card centers OK but portal sidebar should collapse to a bottom-tab bar on mobile.
- **Intake @ 375**: Intake form actually DOES respond reasonably: inputs stack, EN/ES toggle remains top-right. Best mobile story in the app — likely because intake is a brand-new surface.
- **All routes @ 768**: Tablet essentially gets the desktop treatment with nav present. Cases/Admin are usable; dashboard gauge still dominates.
- **Overall mobile verdict**: App is effectively desktop-only. Claimants using the portal on phones (probable majority) will pinch-zoom. **This is the single biggest a11y + UX gap in the product.**

### /intake-plus pages
- (covered earlier) Third design system is visible on /intake/[slug]. Worth noting here that the portal → intake bridge has three brand expressions:
  1. Staff (admin) = Vercel Light default with Hogan brand accent
  2. Portal = warm cream + teal
  3. Intake = blue-on-gray  
  This split is probably intentional (each audience is different), but the portal → intake transition when a client is redirected back for more info will feel like landing on a different product.

