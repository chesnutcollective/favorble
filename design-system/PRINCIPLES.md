# Hogan Smith CaseFlow -- Design Principles

## 1. Emotional Tone & Personality

CaseFlow should feel like walking into a well-appointed law office: **warm, confident, organized, and human**. Not a sterile SaaS dashboard. Not a cluttered legacy system.

### The Three Words

- **Warm** -- Every surface, every shadow, every transition should feel like it has life. Cream backgrounds instead of gray. Lora headings instead of geometric sans. Shadows tinted amber, not black.
- **Assured** -- This is a law firm's most important tool. The design should communicate competence and reliability without being stiff. Navy blue anchors the interface with quiet authority.
- **Spacious** -- Generous whitespace is not wasted space. It signals that the system respects the user's attention and organizes information clearly.

### Voice in the UI

- Labels and headings: professional but not stuffy ("Case Details" not "CASE INFORMATION")
- Empty states: helpful and human ("No documents yet. Drop files here to get started.")
- Error messages: clear and non-blaming ("We couldn't save your changes. Check your connection and try again.")
- Success confirmations: brief and warm ("Saved" with a gentle checkmark, not "Operation completed successfully!")

---

## 2. Do's and Don'ts

### DO

- **Use warm off-whites** (`--bg-base: #FAF8F5`) as the default page background. Cards and panels sit on top in `--bg-raised` (white).
- **Use Lora for headings**, Plus Jakarta Sans for body text. The serif gives the app warmth and character that pure sans-serif cannot.
- **Give elements room to breathe.** A card with 20px padding and 16px gaps between its children is better than one crammed with 12px padding.
- **Use the navy accent sparingly.** Primary actions, active nav items, selected states. Not every link and icon.
- **Use warm gold for secondary emphasis.** Status badges, premium features, secondary CTAs. It pairs naturally with the navy.
- **Animate with intent.** Hover states should transition in 150ms. Modals should ease in over 250ms. The `--ease-default` curve (fast-in, gentle-settle) gives everything a Notion-like quality.
- **Use warm-tinted shadows.** `rgba(120, 80, 40, 0.06)` -- never pure black rgba.
- **Keep borders subtle.** Most dividers should use `--border-subtle` (8% opacity). Only use `--border-default` (16%) for input fields and explicit containers.
- **Use overline text for section labels.** Small, uppercase, widely tracked (`0.1em`), in `--text-tertiary`. This creates clear information hierarchy without visual weight.

### DON'T

- **Don't use pure gray backgrounds.** No `#F5F5F5`, no `#FAFAFA`, no `slate-50`. Always warm: `#FAF8F5`, `#F3F0EB`.
- **Don't use Inter or system sans-serif for headings.** The whole personality of the redesign lives in the serif headings.
- **Don't use saturated semantic colors.** Success green should be muted (`#3D8B5E`), not neon. Error red should be warm (`#C44040`), not alarming.
- **Don't overuse navy blue.** If more than 20% of a screen is navy, something is wrong. The accent is powerful because it's rare.
- **Don't use sharp corners on cards.** Cards are `--radius-lg` (12px). Inputs/buttons are `--radius-md` (8px). No 0px or 2px radii anywhere.
- **Don't use cool-toned dark mode.** The dark theme uses warm near-blacks (`#1C1A17`), never blue-blacks (`#0F172A`).
- **Don't auto-capitalize UI labels** (unless it's an overline). "Case details" not "Case Details" for form section headers. Let the typography weight and size carry the hierarchy.
- **Don't use heavy box shadows for elevation.** Prefer layered subtle shadows. If you need to separate two things, a 1px warm border is often better than a shadow.
- **Don't put icons on every button.** Icons should add clarity, not decoration. A "Save" button does not need a floppy disk icon. A "Download PDF" button benefits from a download icon.

---

## 3. Density Handling

CaseFlow has two density contexts. Both use the same token system but apply different spacing.

### Comfortable (default)

Used for: detail views, forms, settings, document preview, dashboard.

- Card padding: `--space-card-padding` (20px)
- Stack gap: `--space-stack` (12px)
- Input height: `--size-input-md` (40px)
- Section gap: `--space-section` (40px)
- Body text: `--text-body-size` (15px)
- Tables: 48px row height, 16px cell padding

### Compact

Used for: case lists, data tables, sidebar navigation, activity feeds.

- Card padding: `--space-3` (12px)
- Stack gap: `--space-2` (8px)
- Input height: `--size-input-sm` (32px)
- Section gap: `--space-6` (24px)
- Body text: `--text-body-sm-size` (13px)
- Tables: 36px row height, 12px cell padding

### Rules

- Never mix densities in the same card or panel.
- Sidebars are always compact.
- The main content area defaults to comfortable but switches to compact for list/table views.
- Modals and sheets use comfortable density regardless of the parent context.

---

## 4. Accessibility Requirements

### Color Contrast

- All text must meet **WCAG 2.1 AA** minimums:
  - `--text-primary` on `--bg-base`: aim for 12:1+ (currently ~14:1)
  - `--text-secondary` on `--bg-base`: must be 4.5:1+ (currently ~5.2:1)
  - `--text-tertiary` on `--bg-base`: must be 3:1+ for large text only (currently ~3.8:1). Do not use for body-sized text without a stronger foreground.
  - `--text-ghost`: decorative only. Never use for required-reading text.
- Interactive elements (buttons, links) in `--accent-primary` must meet 4.5:1 on their background.

### Focus Indicators

- All interactive elements must show a visible focus ring on `:focus-visible`.
- Use `--shadow-ring` (3px blue ring at 40% opacity) plus a 2px outline offset.
- Never use `outline: none` without providing an alternative focus indicator.

### Motion

- Respect `prefers-reduced-motion`. When active:
  - Set all `--duration-*` tokens to `0ms`.
  - Disable transform-based animations.
  - Opacity transitions may remain but should be instant (< 100ms).

### Touch Targets

- Minimum 44x44px touch target for all interactive elements on mobile.
- Minimum 32x32px on desktop (covered by `--size-input-sm`).

### Screen Reader Support

- All icons must have `aria-hidden="true"` when decorative, or descriptive `aria-label` when functional.
- Form inputs must have visible labels (not just placeholders).
- Status badges must convey meaning through text, not color alone (e.g., "Status: Active" not just a green dot).
- Modals must trap focus and return focus to the trigger on close.

### Typography

- Minimum font size: 12px (`--text-caption-size`) and only for supplementary information.
- Body text minimum: 15px (`--text-body-size`).
- Line height for body text: 1.6+ to ensure readability for dense legal content.

---

## 5. Icon Style Guidance

### Style

- **Line icons only.** 1.5px stroke weight. Rounded caps and joins.
- Recommended library: **Lucide** (already standard with shadcn/ui). Do not mix icon libraries.
- Icon optical size: design to a 24x24 grid with 2px padding (20x20 live area).

### Usage

| Context | Size Token | Actual Size | Notes |
|---------|-----------|-------------|-------|
| Inline with body text | `--size-icon-sm` | 16px | Vertically centered with text |
| Button icons | `--size-icon-md` | 20px | 8px gap from label |
| Standalone / nav | `--size-icon-lg` | 24px | Primary sidebar, toolbar |
| Feature / empty state | 32-48px | Custom | Use sparingly |

### Color

- Default icon color: `--text-secondary` (warm mid-gray).
- Active / selected icon: `--accent-primary`.
- Destructive icon (delete, remove): `--color-error`.
- Icons in buttons inherit the button's text color.

### Rules

- **No filled icons.** Outlined only, always.
- **No icon-only buttons** without a tooltip or `aria-label`.
- **Consistent metaphors.** Pick one icon per concept and use it everywhere:
  - Case/matter: `Briefcase`
  - Client/contact: `User`
  - Document: `FileText`
  - Calendar/date: `Calendar`
  - Search: `Search`
  - Settings: `Settings`
  - Add/create: `Plus`
  - More actions: `MoreHorizontal`
  - Close: `X`
  - Back/navigate: `ChevronLeft` / `ChevronRight`
  - Status/activity: `Activity`
  - Money/billing: `DollarSign`
  - Email: `Mail`
  - Phone: `Phone`
  - Notes: `StickyNote`
