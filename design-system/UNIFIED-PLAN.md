# Unified Implementation Plan for concept-9-refined.html

> Synthesized from 13 individual improvement plans: Data Table, Color Identity, Buttons, Typography, Sidebar Nav, Motion, Layout, Cards & Stats, Calendar, Login, Messages, Settings, and Empty States.

---

## Table of Contents

1. [Conflict Resolution](#conflict-resolution)
2. [Unified :root CSS Variables](#unified-root-css-variables)
3. [Google Fonts Link Tag](#google-fonts-link-tag)
4. [Phase A: Foundation](#phase-a-foundation)
5. [Phase B: Core Components](#phase-b-core-components)
6. [Phase C: Layout Structure](#phase-c-layout-structure)
7. [Phase D: Page Redesigns](#phase-d-page-redesigns)
8. [Phase E: Polish](#phase-e-polish)
9. [Scope Estimates](#scope-estimates)

---

## Conflict Resolution

### 1. Surface-0 Color: `#FFFFFF` vs `#F8F9FC`

- **Color plan** says `--surface-0: #F8F9FC` (navy-tinted off-white)
- **Cards plan**, **Calendar plan**, **Login plan** all reference `var(--surface-0)` without specifying a value
- **Table plan** references `var(--surface-0)` for chip backgrounds

**Decision: Use `#F8F9FC`.** The Color plan's rationale is strongest -- the delta from `--bg: #FAFAF8` becomes chromatic (warm vs cool-neutral) rather than just luminance, which the eye reads as intentional. All downstream references will inherit this change automatically.

### 2. Font: Inter vs DM Sans

- **Typography plan** recommends DM Sans + DM Mono (optical size axis, humanist skeleton, not associated with any component library)
- **All other plans** reference `font-family: inherit` or don't specify fonts
- **Layout plan** still references `'Inter'` in body rule but this is clearly the baseline being replaced

**Decision: Use DM Sans + DM Mono.** The Typography plan makes the strongest case: Inter is the #1 shadcn tell. DM Sans has an `opsz` axis that Inter lacks, enabling `font-optical-sizing: auto` as a verifiably custom detail. DM Mono for case numbers/IDs creates a data-vs-prose register separation.

### 3. Text Color Naming: Numbered (`--text-1/2/3/4`) vs Semantic (`--text-primary/secondary/tertiary/ghost/label`)

- **Typography plan** renames to 5 semantic names with violet undertones
- **Color plan** keeps `--text-1/2/3/4` naming, values unchanged
- **Every other plan** uses the numbered convention

**Decision: Keep the numbered naming (`--text-1` through `--text-4`) but adopt the Typography plan's violet-tinted values, and add `--text-label` as a new 5th variable.** Rationale: renaming all 4 variables across 13 plans creates massive churn for marginal benefit. The violet-tinted values deliver the same anti-shadcn effect. The semantic name `--text-label` is additive and used only for uppercase section headers/column labels.

Final values:
```
--text-1: #18181a    (was #1a1a1a -- warmer off-black, slight violet)
--text-2: #52525e    (was #6b6b6b -- closer to primary, violet-gray)
--text-3: #8b8b97    (was #999999 -- violet-gray, distinct from neutral)
--text-4: #c4c4ce    (was #bbbbbb -- violet-tinted ghost)
--text-label: #6e6e80 (NEW -- for uppercase headers, cal-dow, th, nav-label)
```

### 4. Table Structure: `<table>` vs CSS Grid divs

- **Data Table plan** says eliminate `<table>` entirely, use CSS Grid with `div[role="grid"]`
- **Cards plan** references `<th>` and `<td>` elements
- **Color plan** styles `th` and `tr:hover td`

**Decision: Use CSS Grid divs.** The Data Table plan correctly identifies that `<table><thead><tbody>` is the #1 shadcn structural fingerprint. Downstream plans that reference `th`/`td` selectors will be translated to `.dt-th`/`.dt-td` selectors. ARIA roles (`role="grid"`, `role="row"`, `role="gridcell"`) preserve accessibility.

### 5. Nav Active State: Background Fill vs Left-Rule

- **Color plan** says `background: rgba(59,89,152,0.08)` + left bar `::before`
- **Sidebar Nav plan** says `background: none` + left bar `::before`, text color shift only
- **Motion plan** adds `scaleY` animation to the left indicator

**Decision: Use the Sidebar Nav plan's approach (no background fill) with the Motion plan's animated indicator.** Rationale: the Color plan's background fill, even brand-tinted, is still recognizable as the shadcn active state pattern. No-fill + left-rule is distinctively Linear-like and scores lower on template detection. The Motion plan's `scaleY(0) -> scaleY(1)` spring animation adds the physical quality that makes it feel intentional.

### 6. Header: Persistent Full-Width vs Per-Panel Contextual Toolbar

- **Layout plan** says eliminate the persistent header, use per-panel 40px toolbars
- **Color plan** reskins the existing header with glass/blur treatment
- **Motion plan** doesn't restructure the header

**Decision: Use the Layout plan's per-panel toolbar approach.** The persistent partial-width header inside `.main` is the most damning structural shadcn tell. Contextual toolbars are what Linear/Craft/Codebase use. The glass/blur treatment from the Color plan carries over to the panel toolbar -- it is a strength that should be preserved.

### 7. Button Resting Border: Visible vs Hidden

- **Buttons plan** says no border at rest, border materializes on hover via `box-shadow: 0 0 0 1px`
- **Data Table plan** toolbar buttons have `border: 1px solid var(--border-subtle)` at rest

**Decision: Use the Buttons plan's no-border-at-rest approach for all `.btn` instances.** The table toolbar buttons (search, sort) should follow the base `.btn` pattern. Their borders appear on hover. This is the Linear convention and the single most impactful change for the button system.

### 8. Card Header Border-Bottom: Keep vs Remove

- **Cards plan** says kill `border-bottom: 1px solid` on `.card-header` entirely
- **Color plan** replaces it with a gradient blush

**Decision: Remove the border-bottom entirely (Cards plan).** Replace with an uppercase micro-label that serves as a typographic section marker. The gradient blush from the Color plan can optionally tint the card interior, but the horizontal rule dividing header from body is a primary shadcn signature and must go.

### 9. Toast Position: Top-Right vs Bottom-Right

- **Motion plan** places toasts top-right
- **Empty States plan** places toasts bottom-right

**Decision: Bottom-right.** The sidebar occupies the left edge, the toolbar and primary content occupy the top. Bottom-right avoids competing with any active content zone. This is Linear's convention.

### 10. Stat Grid: `repeat(4, 1fr)` vs Asymmetric

- **Cards plan** says break into asymmetric grid (`220px 1fr 1fr 1fr`) with a hero stat
- **Color plan** adds per-stat gradient tints to the existing 4-equal grid

**Decision: Use the Cards plan's asymmetric grid with hero stat.** The 4-equal grid is the #1 shadcn dashboard signature. The Color plan's gradient tints are excellent and should be applied to the new asymmetric layout. The hero stat gets the accent-tinted gradient; the 3 smaller stats get left-border accents with semantic colors.

### 11. Calendar Event Chips: Filled Badge vs Left-Border Chip

- **Calendar plan** redesigns chips with white background + left-edge 3px color bar
- **Data Table plan** redesigns status badges with dot + text (no background)

**Decision: Calendar chips use the left-border pattern. Table status badges use the dot + text pattern.** These are different contexts -- calendar events need spatial structure (the left bar), while table badges need inline compactness (the dot). Both diverge from shadcn's filled-pill default.

### 12. Toggle Shape: Pill (iOS) vs Rectangular

- **Buttons plan** redesigns toggle to `border-radius: 5px` with square thumb, fill-expands-from-left motion
- **Motion plan** adds spring easing to existing toggle thumb

**Decision: Use the Buttons plan's rectangular toggle with the Motion plan's spring easing.** The rectangular track with square thumb is the single most impactful change for the toggle -- it completely breaks the iOS visual fingerprint. The spring easing from the Motion plan (`cubic-bezier(0.34, 1.20, 0.64, 1)`) applies to the thumb's `translateX` transition.

### 13. Messages: Bubble Layout vs Full-Width Record Feed

- **Messages plan** replaces iMessage-style left/right bubbles with full-width document-style entries
- **Color plan** tints `.bubble.in` background

**Decision: Use the Messages plan's full-width record feed.** The iMessage bubble pattern is consumer-grade. Full-width entries with left-border differentiation (internal vs external) match the legal/professional domain. The Color plan's tinting concept carries over as `border-left-color` on internal notes.

---

## Unified :root CSS Variables

This is the single definitive `:root` block that merges all plans. Every variable is annotated with its source plan.

```css
:root {
  /* ============================================
     SURFACES — warm base, navy-tinted cards
     Source: Color plan + Typography plan
     ============================================ */
  --bg: #FAFAF8;
  --surface-0: #F8F9FC;                      /* Color: was #FFFFFF */
  --surface-1: rgba(248,249,252,0.82);       /* Color: was rgba(255,255,255,0.72) */
  --surface-2: rgba(248,249,252,0.55);       /* Color: was rgba(255,255,255,0.5) */
  --surface-hover: rgba(59,89,152,0.04);     /* Color: was rgba(0,0,0,0.024) */
  --surface-active: rgba(59,89,152,0.08);    /* Color: was rgba(0,0,0,0.04) */
  --surface-selected: rgba(59,89,152,0.09);  /* Color: was rgba(43,76,140,0.06) */

  /* ============================================
     TEXT — violet-tinted grays, non-uniform gaps
     Source: Typography plan (values), kept numbered naming
     ============================================ */
  --text-1: #18181a;       /* Typography: was #1a1a1a -- warm off-black, violet */
  --text-2: #52525e;       /* Typography: was #6b6b6b -- closer to primary */
  --text-3: #8b8b97;       /* Typography: was #999999 -- violet-gray */
  --text-4: #c4c4ce;       /* Typography: was #bbbbbb -- violet-tinted ghost */
  --text-label: #6e6e80;   /* Typography: NEW -- uppercase headers/labels */

  /* ============================================
     BORDERS — brand-tinted, not pure black alpha
     Source: Color plan
     ============================================ */
  --border-subtle:  rgba(59,89,152,0.08);    /* Color: was rgba(0,0,0,0.06) */
  --border-default: rgba(59,89,152,0.13);    /* Color: was rgba(0,0,0,0.09) */
  --border-strong:  rgba(59,89,152,0.20);    /* Color: was rgba(0,0,0,0.14) */

  /* ============================================
     BRAND — muted navy (unchanged)
     ============================================ */
  --accent: #3b5998;
  --accent-hover: #2d4a85;
  --accent-subtle: rgba(59,89,152,0.08);
  --accent-muted: rgba(59,89,152,0.14);

  /* ============================================
     SEMANTIC COLORS (unchanged)
     ============================================ */
  --red: #d1453b;
  --red-subtle: rgba(209,69,59,0.08);
  --amber: #cf8a00;
  --amber-subtle: rgba(207,138,0,0.08);
  --green: #2b8a3e;
  --green-subtle: rgba(43,138,62,0.08);
  --blue: #3b5998;
  --blue-subtle: rgba(59,89,152,0.08);

  /* ============================================
     SHADOWS — brand-tinted drop shadows
     Source: Color plan
     ============================================ */
  --shadow-xs: 0 1px 2px rgba(59,89,152,0.06);
  --shadow-sm: 0 1px 3px rgba(59,89,152,0.07), 0 1px 2px rgba(0,0,0,0.02);
  --shadow-md: 0 4px 12px rgba(59,89,152,0.09), 0 1px 3px rgba(0,0,0,0.03);
  --shadow-lg: 0 8px 30px rgba(59,89,152,0.12), 0 2px 8px rgba(0,0,0,0.03);
  --shadow-glow: 0 0 0 1px var(--accent), 0 0 0 4px rgba(59,89,152,0.14);

  /* Asymmetric card highlight system -- Source: Color plan */
  --shadow-card:
    inset 0 1px 0 rgba(255,255,255,0.85),
    inset 1px 0 0 rgba(255,255,255,0.5),
    0 1px 3px rgba(59,89,152,0.06),
    0 1px 2px rgba(0,0,0,0.03);

  /* ============================================
     MOTION TOKENS
     Source: Motion plan
     ============================================ */
  --duration-instant: 60ms;    /* press response */
  --duration-fast:    120ms;   /* micro-feedback */
  --duration:         150ms;   /* base (existing) */
  --duration-enter:   220ms;   /* element arrival */
  --duration-page:    160ms;   /* page transitions */
  --duration-modal:   280ms;   /* modal/overlay */

  --ease:        cubic-bezier(0.25, 0.1, 0.25, 1);    /* existing */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);   /* slight overshoot */
  --ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1);      /* decelerate */
  --ease-in:     cubic-bezier(0.4, 0.0, 1.0, 1);      /* accelerate (exits) */

  /* ============================================
     LAYOUT
     Source: Layout plan (replaces --header-h with --toolbar-h)
     ============================================ */
  --sidebar-w: 232px;
  --toolbar-h: 40px;        /* was --header-h: 48px */
  --detail-w: 380px;        /* NEW: detail panel width */
  --panel-transition: 200ms cubic-bezier(0.25, 0.1, 0.25, 1);

  /* ============================================
     MESSAGES — domain-specific role colors
     Source: Messages plan
     ============================================ */
  --role-claimant: rgba(120,80,200,0.09);
  --role-claimant-text: #5b21b6;
  --role-provider: rgba(6,120,100,0.09);
  --role-provider-text: #065f46;
  --role-staff: rgba(59,89,152,0.09);
  --role-staff-text: #2d4a85;
  --unread-dot: #3b5998;
}
```

---

## Google Fonts Link Tag

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Body font-family declaration:
```css
body {
  font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
  font-optical-sizing: auto;
  font-feature-settings: "calt" 1, "kern" 1;
}
```

---

## Phase A: Foundation

**What:** Fonts, colors, :root variables, motion tokens, global resets, keyframes.
**Why first:** Every subsequent phase depends on these tokens. Changing them later would cascade breakage.
**Scope:** MEDIUM (one file, ~120 CSS rules, no HTML restructuring)

### A.1 Replace the Google Fonts link

Remove the existing Inter import. Add the DM Sans + DM Mono link tag above.

### A.2 Replace the entire `:root {}` block

Swap lines 22-73 of concept-9-refined.html with the unified `:root` block above. This is a single-action replacement.

### A.3 Update the `body` rule

```css
body {
  font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
  background: var(--bg);
  color: var(--text-1);
  font-size: 13.5px;
  line-height: 1.48;                    /* Typography: was 1.5 */
  font-optical-sizing: auto;            /* Typography: NEW */
  font-feature-settings: "calt" 1, "kern" 1;  /* Typography: NEW */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* display/height/overflow handled by Layout in Phase C */
}
```

### A.4 Add global keyframes

Add these after `:root` and `body`:

```css
@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position: 600px 0; }
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes toast-out {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(4px) scale(0.97); }
}

@keyframes cmd-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.97); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes pulse-once {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

### A.5 Update scrollbar and selection styles

```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(59,89,152,0.14); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(59,89,152,0.25); }

::selection { background: var(--accent-subtle); color: var(--text-1); }
```

### A.6 Add `will-change` declarations

```css
.stat, .card, .contact-card { will-change: transform; }
.page { will-change: opacity, transform; }
.btn { will-change: transform; }
```

---

## Phase B: Core Components

**What:** Buttons, inputs, toggles, checkboxes, badges, empty states, skeletons, toasts.
**Why second:** These are the atomic units referenced by every page. Their new behavior must be established before page-level redesigns.
**Scope:** LARGE (200+ CSS rules, new HTML structures for toggle/checkbox/toast/command palette, JS additions)

### B.1 Button System (Source: Buttons plan)

Replace the entire `.btn` system. Key changes:
- **No border at rest** -- border materializes on hover via `box-shadow: 0 0 0 1px`
- **Primary: top-to-bottom gradient** + inset top highlight + drop shadow (Stripe-inspired)
- **Active state:** `scale(0.972)` + shadow collapse at 60ms (faster than `--duration`)
- **Focus ring:** OS-style double ring with white gap (`0 0 0 2px var(--bg), 0 0 0 4px rgba(59,89,152,0.50)`)
- **Ghost:** no ring ever, stays frameless
- **Danger variant:** only red on interaction, not at rest
- **Icon button:** `28x28px`, `border-radius: 5px` (tighter than text buttons)

See Buttons plan for complete CSS values.

### B.2 Toggle (Source: Buttons plan + Motion plan)

Replace the iOS pill toggle with:
- Rectangular track: `border-radius: 5px`, `38x22px`, inset shadow (recessed)
- Square thumb: `border-radius: 3px`, `16x16px`
- Fill-expands-from-left animation with spring easing
- `transition: transform 200ms cubic-bezier(0.34, 1.20, 0.64, 1)`

### B.3 Checkbox (Source: Buttons plan)

New `.queue-check` with:
- `15x15px`, `border: 1.5px`, `border-radius: 4px`
- Checkmark via `::after` pseudo-element with `border-left` + `border-bottom` rotated
- Hover: `scale(1.08)` + accent border + 3px glow ring
- Checked: accent fill + inset highlight (matching primary button)
- Press: `scale(0.90)`
- JS: `el.classList.toggle('checked')` on click

### B.4 Input Focus (Source: Buttons plan)

Replace the standard ring treatment:
- Border subtly tints on focus (not full accent): `border-color: rgba(59,89,152,0.35)`
- Background gets near-invisible tint: `rgba(59,89,152,0.018)`
- Bottom bar grows from center outward via `::after` pseudo on `.field` wrapper
- `width: 0% -> calc(100% - 2px)` with `transition: width 200ms`
- No halo/ring

### B.5 Badge System (Source: Data Table plan + Color plan)

Two badge patterns:

**Table status badges** (dot + text, no background):
```css
.badge-v2 { display: inline-flex; gap: 5px; background: transparent; }
.badge-v2::before { width: 5px; height: 5px; border-radius: 50%; }
```
Per-variant: `.active` green dot, `.urgent` red dot, `.pending` amber dot, `.closed` muted dot.

**Neutral badge** (brand-tinted):
```css
.badge-neutral { background: rgba(59,89,152,0.07); color: #6b7a9a; border: 1px solid rgba(59,89,152,0.12); }
```

### B.6 Segmented Control (Source: Buttons plan + Calendar plan)

New component for Day/Week/Month toggle and anywhere three options exist:
- Container: `background: var(--surface-active)`, `border-radius: 7px`, `padding: 3px`
- Active segment: `background: var(--surface-0)`, `box-shadow: var(--shadow-xs)` (white pill floating on gray track)
- No border on active -- shadow only

### B.7 Empty State Component (Source: Empty States plan)

Universal `.empty-state` centered flex column:
- `padding: 64px 32px`, centered text
- 40x40 SVG icon at `--text-4` with `opacity: 0.7`
- Title: `14px/600`, Subtext: `13px/--text-3`, max-width: `280px`
- Optional CTA inherits `.btn .btn-primary`
- Per-surface copy (Cases: "No cases yet", Queue: "All caught up", Messages: "Select a conversation", etc.)

### B.8 Skeleton/Shimmer System (Source: Empty States plan + Motion plan)

```css
.skeleton {
  background: linear-gradient(90deg, var(--surface-active) 0%, rgba(0,0,0,0.07) 40%, var(--surface-active) 80%);
  background-size: 600px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
```
Utility classes: `.sk-line`, `.sk-line--sm`, `.sk-line--md`, `.sk-circle`, `.sk-badge`
Pre-built templates for: stat card skeleton, table row skeleton (5 rows), queue item skeleton (4 items).

### B.9 Toast System (Source: Empty States plan -- adopted over Motion plan's dark toasts)

**Decision: Light toasts (Empty States plan) over dark toasts (Motion plan).** Rationale: light toasts with a left-edge color bar match the card surface system and feel more cohesive. Dark toasts are a valid option but create a separate visual language.

- Position: fixed, bottom-right, `24px` from edges
- Light background (`var(--surface-0)`) with `border: 1px solid var(--border-default)`
- Left accent bar via `::before` pseudo (3px, color per variant)
- Variants: success (green), warning (amber), error (red), info (accent)
- Enter: `toast-in 220ms spring`, Exit: `toast-out 160ms ease`
- Auto-dismiss at 4 seconds
- JS `toast(variant, title, body)` function

### B.10 Save Bar (Source: Settings plan)

Floating save bar for settings (and potentially other edit contexts):
- `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)`
- Dark inverted background (`var(--text-1)`, white text)
- Spring animation on show: `translateY(80px) -> translateY(0)`
- "You have unsaved changes" + Discard/Save buttons

---

## Phase C: Layout Structure

**What:** CSS Grid conversion, toolbar replacement, sidebar restructuring, detail panel.
**Why third:** Layout changes affect every page. Must happen after foundations (tokens) and components (buttons etc.) are stable, but before page-specific redesigns that depend on the new structure.
**Scope:** LARGE (major HTML restructuring of body/main/header/sidebar, 150+ CSS rules, JS rewrite of `go()`)

### C.1 Body Grid Conversion (Source: Layout plan)

Replace `body { display: flex }` with:
```css
body {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  grid-template-rows: 100vh;
  height: 100vh;
  overflow: hidden;
}
```

### C.2 Workspace Grid (Source: Layout plan)

Replace `.main` with `.workspace`:
```css
.workspace {
  grid-column: 2;
  display: grid;
  grid-template-rows: var(--toolbar-h) 1fr;
  grid-template-columns: 1fr 0px;
  overflow: hidden;
  transition: grid-template-columns var(--panel-transition);
}
.workspace.detail-open {
  grid-template-columns: 1fr var(--detail-w);
}
```

### C.3 Replace Header with Panel Toolbar (Source: Layout plan)

Remove the persistent `.header` element. Replace with `.panel-toolbar`:
- 40px height, contextual content per view
- Glass/blur treatment preserved from current header
- Left: view label + count/filter chips (not breadcrumb)
- Right: view toggle + compact icon action buttons (not `+ New Case` text button)

### C.4 Panel Content (Source: Layout plan)

Replace `.content` with `.panel-content`:
```css
.panel-content {
  grid-row: 2;
  grid-column: 1;
  overflow-y: auto;
  padding: 0;  /* views own their own padding */
}
```

### C.5 Detail Panel (Source: Layout plan)

New `.detail-panel` as third column:
- `grid-row: 1 / -1` (spans toolbar + content)
- `border-left: 1px solid var(--border-subtle)`
- Starts hidden (`opacity: 0; transform: translateX(8px)`)
- Animates in when `.workspace.detail-open` is toggled
- Contains: 40px toolbar, case identity, stage indicator, property list, activity feed, compose area

### C.6 Sidebar Restructuring (Source: Sidebar Nav plan)

Major changes to sidebar internals:

**Brand section:** Replace icon+text workspace switcher with typographic lockup:
```html
<div class="brand">
  <div class="brand-wordmark"><span class="brand-abbr">HS</span> Hogan Smith</div>
  <div class="brand-product">CaseFlow</div>
</div>
```
No rounded-square icon container. Product name in uppercase with wide tracking.

**Nav items:** Break the SidebarMenuButton pattern:
- Remove leading icons from flow. Place them as trailing icons, invisible at rest, visible on hover/active
- `border-radius: 0` (no rounded pill)
- No hover fill, only color shift
- Text becomes the primary element at left edge

**Active state:** Left-rule indicator (2px, 14px tall, spring-animated `scaleY`), no background fill, text color shift to `--text-1`, 4px left-indent on active item

**Badges:** Replace inline pills with circular counters (`16px` diameter, `border-radius: 50%`)

**User section:** Remove the footer container pattern. User becomes a regular nav item at the bottom with a green presence dot (not an avatar), no `border-top`

### C.7 Page Transition System (Source: Motion plan)

Replace display:none/block swap with animated transitions:
- Pages use `position: absolute` when inactive, `position: relative` when active
- Enter: `opacity: 0 + translateY(6px)` -> `opacity: 1 + translateY(0)` over 160ms
- Exit: 100ms fade + `translateY(-4px)` (exits up, faster than entrance)
- Rewrite `go()` function to use `classList.add('exiting')` with `transitionend` cleanup
- Add `animatePage()` for staggered card entrance on dashboard

### C.8 Remove `.page-head` (Source: Layout plan)

The `page-title + page-desc + action button` block is removed from all views. Page identity moves to the toolbar label. Action buttons move to the toolbar's right side as compact icon buttons.

---

## Phase D: Page Redesigns

**What:** Dashboard/stats, data table, calendar, messages, settings, login.
**Why fourth:** These are the page-specific implementations that consume the new layout, components, and tokens.
**Can be parallelized:** Each page redesign is independent once Phases A-C are complete.
**Scope:** LARGE (complete HTML/CSS rewrite for each page section)

### D.1 Dashboard / Stats (Source: Cards plan + Color plan)

**Stat grid:** Replace `repeat(4, 1fr)` with asymmetric `220px 1fr 1fr 1fr`:
- Left column: hero stat with tinted accent background (`var(--accent-subtle)`), 38px number, sparkline SVG
- Right 3 columns: left-border accent stats (`border-left: 3px solid [semantic-color]`), 24px numbers, inline deltas

**Content grid:** Replace `1fr 1fr` with `3fr 2fr`:
- Activity feed card gets more width (content-dense)
- Cases by Stage card narrows (compact list)

**Card treatment:**
- Remove `border-bottom` from `.card-header`
- Replace with uppercase micro-label (`10.5px`, `0.05em` tracking, `--text-4`)
- "View all" moves to bottom of content as text-link
- Card surfaces get the asymmetric highlight shadow (`var(--shadow-card)`)
- Hero stat: no border, tinted fill
- Feed card: standard bordered
- Stage card: left-accent border (`border-left: 3px solid var(--accent-muted)`)

**Typography updates:** Apply DM Sans values from Typography plan:
- `.stat-value`: `30px`, `font-weight: 650` (hero: `38px`), `line-height: 0.95`, `font-variant-numeric: tabular-nums lining-nums`
- `.stat-label`: `11.5px`, `font-weight: 490`
- `.feed-text`: `13px`, `line-height: 1.46`
- `.feed-meta`: `11.5px`, `--text-4` (now `--text-ghost` value `#c4c4ce`)

**Card hover:** `translateY(-2px)` with `cubic-bezier(0.34, 1.56, 0.64, 1)` spring + shadow escalation

### D.2 Data Table (Source: Data Table plan)

**Structure:** Replace `<table>` with CSS Grid:
```css
.dt-head, .dt-row {
  display: grid;
  grid-template-columns: 28px 110px 1fr 160px 140px 120px 90px 32px;
}
```

**Container:** Remove the white card wrapper. Table floats borderless on page background.

**Column headers:** `10.5px`, `uppercase`, `letter-spacing: 0.065em`, transparent background, `--text-label` color. Sort arrows appear on hover only.

**Row dividers:** Removed entirely. 38px fixed row height creates rhythm.

**Row hover:** 2px left accent bar (`var(--accent)`) + accent-tinted fill (`rgba(59,89,152,0.03)`). No uniform gray fill.

**Left gutter:** 28px column, invisible at rest, reveals custom checkbox on row hover.

**Case #:** DM Mono, `12px`, `--text-3`, `letter-spacing: 0.02em`

**Assigned To:** Avatar initials (20x20 circle) + name

**Deadline:** Relative time with urgency coloring (`5 days` in red, `2 days` in amber, `Apr 2` in muted)

**Status badges:** Dot + text pattern (no filled pill)

**Toolbar:** Filter tags (pill buttons), search input, sort button -- above the table, no border

**Pagination:** Replace with "Showing 6 of 147 cases" + "Load more" text link

**Row actions:** Appear on hover -- open icon + ellipsis menu

### D.3 Calendar (Source: Calendar plan)

**Full month grid:** 35 cells (5 weeks) with out-of-month days dimmed

**DOW headers:** `10.5px`, `uppercase`, `0.05em` tracking, `--text-label`. Weekend columns: `--text-4`

**View toggle:** Segmented control (from Phase B) replacing three separate buttons

**Navigation:** SVG chevrons + "Today" bordered button + month label (`15px/600/-0.025em`)

**Today cell:** Two-layer treatment:
- Cell background: `rgba(59,89,152,0.03)`
- Number circle: `24x24`, `var(--accent)` fill, white text

**Event chips:** White background + 3px left-edge color bar + time prefix (`10px`, `--text-4`) + title
- Color variants: blue (hearings), red (deadlines), green (exams), amber (intakes), purple (appeals)

**Weekend columns:** Subtle background tint (`rgba(0,0,0,0.013)`)

**Overflow:** Max 2 chips per cell + "+N more" overflow link

### D.4 Messages (Source: Messages plan)

**Conversation list:**
- Avatar (32px, `border-radius: 8px` -- square-ish, not iMessage circle) + presence dot
- Name + role chip (Claimant/Provider/Staff with semantic colors)
- Case # badge + stage pill (domain context)
- Message preview with unread styling (bolder name, darker preview)

**Thread header:** New element above message feed:
- Contact avatar + name + role
- Case context: case #, claimant name, stage badge, deadline
- Action buttons: view case, call, more

**Message feed:** Full-width record entries replacing L/R bubbles:
- Avatar + name + role + timestamp on same line
- Message body full-width below
- Internal notes: `border-left: 2px solid var(--accent)` + subtle blue tint
- Hover reveals Reply/React action buttons

**Compose bar:** Pinned to bottom:
- Tab bar: "Message" / "Internal Note" (with lock icon)
- Auto-expanding textarea with contextual placeholder
- Tool buttons: attach, link case doc, mention
- Send button + keyboard hint (`Enter send, Shift+Enter new line`)

**Date separators:** Centered date label with horizontal rules

### D.5 Settings (Source: Settings plan)

**Layout:** Replace two-column grid with:
- Horizontal tab bar (underline style) replacing left nav
- `max-width: 680px` centered content column
- Tabs with small SVG icons: General, Users, Workflows, Templates, Integrations

**Rows:** Remove card wrapper. Sections separated by typography + thin dividers:
- Section title: `13px/600`
- Section subtitle: `12px/--text-3`
- Setting rows: label + description on left, inline control on right
- Controls visible and interactive at rest (no "Edit" buttons)

**Inline controls:**
- Firm Name: text input, `220px` width
- Case Numbering: monospace text input showing format string
- Timezone: `<select>` with custom chevron
- Toggles: use new rectangular toggle from Phase B

**Danger zone:** Final section with red tint:
- `border-top: 1px solid var(--red-subtle)`
- Export data (neutral button), Reset counter (danger button), Delete account (danger button)

**Floating save bar:** Slides up from bottom on any setting change (spring animation)

### D.6 Login (Source: Login plan)

**Complete redesign** -- abandon split panel:

**Background:** Full-viewport dark canvas (`#0c0f18`) with:
- Two radial gradients creating subtle navy light pools
- Diagonal ruled-line texture at 2% opacity (legal paper evocation)
- Large "HOGAN SMITH" watermark at 2.5% opacity

**Card:** Centered glass card, `max-width: 380px`:
- `background: rgba(255,255,255,0.035)`, `border: 1px solid rgba(255,255,255,0.08)`
- `backdrop-filter: blur(20px)`
- `border-radius: 12px`, `padding: 44px 48px`

**Logo:** Scales-of-justice SVG monogram (stroke-based, 48x48) above "HOGAN SMITH" wordmark in `0.16em` tracking

**Form fields:** Dark translucent inputs:
- `background: rgba(255,255,255,0.05)`, `border-radius: 4px` (sharper than current 7px)
- Focus changes border color only, no glow ring
- Uppercase labels with `0.07em` tracking

**Additional elements:**
- "Remember me" checkbox + "Forgot password?" link
- Button: gradient top-to-bottom with inset highlights
- Trust signals: "HIPAA compliant" + "256-bit encryption" in muted text below button

---

## Phase E: Polish

**What:** Command palette, onboarding, edge cases, accessibility, cursor specificity, stagger animations.
**Why last:** These are refinements that layer on top of the completed redesign.
**Scope:** MEDIUM (100+ CSS rules, moderate JS, no major HTML restructuring)

### E.1 Command Palette (Source: Empty States plan)

Triggered by `Cmd+K` (remove the ghost button from header/toolbar):
- Backdrop: `rgba(0,0,0,0.3)` with `backdrop-filter: blur(2px)`
- Palette: `560px` wide, centered, `top: 18%`, `border-radius: 12px`
- Search input with search icon + `esc` kbd hint
- Results grouped by section (Navigation, Actions) with uppercase labels
- Keyboard navigation: `Up/Down` to select, `Enter` to execute, `Esc` to close
- Footer: keyboard hints
- Empty search: "No results for [query]" centered text

### E.2 Staggered Card Entrance (Source: Motion plan)

Dashboard cards arrive sequentially on page transition:
- `animatePage()` function adds `.animated` class to each card with 60ms stagger
- `animation: fade-up 220ms ease forwards`
- Total dashboard settle time: ~380ms (4 stats + 2 content cards)

### E.3 Cursor Specificity (Source: Motion plan)

```css
.nav-item, .queue-item, .contact-card, .cal-day, .msg-item, .toggle, .btn { cursor: pointer; }
.stat, .card { cursor: default; }
```

### E.4 Button `:active` States (Source: Motion plan)

All buttons get physical press feedback:
- Default: `translateY(1px) scale(0.985)`, 60ms transition
- Primary: `translateY(1px) scale(0.982)` + darken background
- Ghost: `translateY(1px)` only
- Nav items: `scale(0.97)`, 60ms

### E.5 Accessibility Audit

- All CSS Grid table elements need ARIA roles: `role="grid"`, `role="row"`, `role="columnheader"`, `role="gridcell"`
- Command palette: `role="dialog"`, `aria-modal="true"`, focus trapping
- Toast region: `role="region"`, `aria-label="Notifications"`, `aria-live="polite"`
- All icon buttons need `aria-label` or `title` attributes
- Toggle needs `role="switch"`, `aria-checked`
- Skeleton loading: `aria-busy="true"`, `aria-label="Loading..."`

### E.6 Additional Color Micro-Details (Source: Color plan)

These are lower-priority surface treatments to add after all major work:
- Stat cards get per-stat semantic gradient tints (blue for active cases, red for tasks, etc.)
- Sidebar gets ambient top blush: `background: linear-gradient(180deg, rgba(59,89,152,0.018) 0%, transparent 50%)`
- Calendar DOW row gets navy gradient: `linear-gradient(to bottom, rgba(59,89,152,0.045) 0%, transparent 100%)`
- Login left panel (if keeping split panel approach): multi-layer radial gradients
- Today calendar cell: number circle gets `box-shadow: 0 2px 6px rgba(59,89,152,0.35)` glow

---

## Scope Estimates

| Phase | Scope | CSS Rules | HTML Changes | JS Changes | Dependencies |
|-------|-------|-----------|--------------|------------|--------------|
| **A: Foundation** | MEDIUM | ~120 new/replaced | Font link tag only | None | None |
| **B: Core Components** | LARGE | ~200+ new/replaced | Toast container, command palette shell, toggle/checkbox markup | Toast JS, checkbox toggle, save bar triggers | Phase A |
| **C: Layout Structure** | LARGE | ~150 new/replaced | Body grid, sidebar restructure, header->toolbar, detail panel, page wrapper rename | `go()` rewrite, `animatePage()` | Phase A |
| **D: Page Redesigns** | LARGE | ~400+ new/replaced | Each page gets near-complete HTML rewrite | Compose bar, date separators, tab switching | Phases A+B+C |
| **E: Polish** | MEDIUM | ~100 new | Command palette full HTML | Command palette JS, keyboard nav, stagger timing | Phases A+B+C+D |

### Parallelization Notes

- **Phases A -> B -> C** must be sequential (each depends on the previous)
- **Within Phase D**, all 6 page redesigns can run in parallel once C is complete
- **Phase E** can begin as soon as Phase C is complete for items E.3/E.4 (cursor/active states), but E.1 (command palette) and E.2 (stagger) depend on Phase D's dashboard being done
- **Estimated total effort:** 6 implementation sessions if serialized, 4 if D is parallelized

### Risk Areas

1. **Layout restructure (C.1-C.2)** is the highest-risk change -- it touches the outer shell that contains everything. Test page transitions and overflow behavior immediately.
2. **Sidebar restructure (C.6)** breaks the existing `go()` onclick wiring. The nav item HTML changes class names and structure.
3. **Table grid conversion (D.2)** is the largest single page change. The grid column widths must be tested with real data lengths.
4. **Login dark theme (D.6)** is a completely separate color context. All values use explicit `rgba(255,255,255,x)` rather than CSS variables, so it is self-contained and low-risk.
5. **DM Sans font swap (A.1)** may shift metrics slightly from Inter. All hardcoded `px` values for padding/height may need +-1px optical adjustments.
