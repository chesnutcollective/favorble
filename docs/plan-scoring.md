# Favorble Plan Scoring — Multi-Perspective Audit
## Scored against: /Users/ace/Downloads/plan-loom-2026-03-18-114340.md
## Date: 2026-03-28

---

## Summary Scores

| Perspective | Score | Evaluator |
|-------------|-------|-----------|
| UI/Visual Design | **68/100** | Senior UI Designer |
| Architecture/Backend | **78/100** (schema), **70/100** (actions) | Senior Architect |
| UX/Usability | **44/100** | UX Researcher |
| Feature Completeness | *pending* | Product Manager |

---

## Top Issues by Priority

### 1. Wire up stage change dropdown on case detail (UX #1, UI #5)
The `StageChangeDialog` component exists, `changeCaseStage` action handles workflow execution, but there is NO dropdown on the case header to trigger it. This single missing UI element blocks the #1 feature of the entire system.

### 2. Make custom fields editable (UX #2, UI score 45)
`updateCaseFieldValues` action exists. Fields tab is read-only. Adding inline edit forms would unlock the entire custom fields requirement — the #2 pain point.

### 3. Build admin CRUD forms (UX #3, Architecture gap)
Every admin page has "New" and "Edit" buttons that do nothing. Without creating workflows, stages, or fields, the system cannot be configured. Blocks Admin persona entirely.

### 4. Add global search Cmd+K (UX #4, UI #4)
`command.tsx` component exists but is never used. Header is nearly empty. Critical for navigating 2,847+ cases.

### 5. Add Recharts visualizations (UI #2)
Dashboard and Reports have no real charts. Plan specifies BarChart, LineChart, FunnelChart. "Reports are terrible" was a P0 pain point.

---

## Persona Scores

| Persona | Score | Biggest Blocker |
|---------|-------|-----------------|
| Filing Agent (Apple) | **38** | No saved filter presets, no keyboard shortcuts |
| Case Manager | **42** | Cannot change case stages from UI |
| Attorney | **48** | No document templates, no case summary |
| Admin | **32** | All admin CRUD is non-functional |
| Intake Agent | **22** | Lead detail is a stub, no intake forms |

---

## Page Scores (All Perspectives)

| Page | UI | UX | Notes |
|------|----|----|-------|
| Login | 72 | — | Demo-only, no real auth |
| Dashboard | 62 | 62 | Missing funnel chart, activity feed |
| My Queue | 75 | 58 | Good tabs, missing bulk/keyboard |
| Cases List | 68 | 52 | No Kanban, no column sort |
| Case Detail Layout | 76 | 68 | No stage change dropdown |
| Case Overview | 70 | 65 | Missing assigned staff |
| Case Documents | 82 | 78 | Best page — full upload/preview |
| Case Fields | 74 | 45 | Read-only — critical gap |
| Case Activity | 71 | 70 | Notes work, no rich text |
| Case Messages | 73 | 55 | No compose/reply |
| Case Tasks | 66 | 60 | No create task button |
| Case Calendar | 69 | 50 | List only, no grid view |
| Case SSA Data | 78 | 72 | Good Chronicle deep link |
| Leads | 70 | 55 | No drag-and-drop |
| Lead Detail | — | 5 | Complete stub |
| Calendar | 55 | 48 | List only, no calendar views |
| Messages | 65 | 52 | No compose, no search |
| Contacts | 72 | 55 | New page, working |
| Documents | 74 | 55 | No cross-case search |
| Reports | 58 | 40 | No charts, no export |
| Admin: Workflows | 74 | 55 | View-only |
| Admin: Stages | 76 | 60 | View-only, no delete+migrate |
| Admin: Fields | 77 | 60 | View-only |
| Admin: Users | 73 | 55 | View-only |
| Admin: Templates | 15 | 5 | Complete stub |
| Admin: Integrations | 80 | 65 | Informational only |
| Admin: Settings | 65 | 50 | Read-only |

---

## Architecture Scores by Requirement

| REQ | Schema | Logic | Overall |
|-----|--------|-------|---------|
| REQ-001 Workflows | 90 | 85 | 88 |
| REQ-002 Custom Fields | 95 | 80 | 88 |
| REQ-003 Work Queue | 90 | 85 | 88 |
| REQ-004 Case Stages | 95 | 90 | 93 |
| REQ-005 Lead Pipeline | 80 | 75 | 78 |
| REQ-006 Documents | 85 | 75 | 80 |
| REQ-007 Case Detail | 90 | 80 | 85 |
| REQ-008 Reporting | 60 | 50 | 55 |
| REQ-009 Case List | 85 | 80 | 83 |
| REQ-010 Calendar | 85 | 45 | 65 |
| REQ-011 Case Status | 75 | 55 | 65 |
| REQ-012 Email | 70 | 40 | 55 |
| REQ-013 Chronicle | 85 | 60 | 73 |
| REQ-014 Notes | 70 | 60 | 65 |
| REQ-015 Calculations | 70 | 15 | 43 |
| REQ-016 AI | 0 | 0 | 0 |
| REQ-017 Import | 0 | 0 | 0 |

---

## Quick Wins (Highest Impact, Lowest Effort)

1. **Wire StageChangeDialog to case header** — component exists, action exists, just needs a Select trigger
2. **Add Cmd+K search** — command.tsx component exists, just wire to header + search actions
3. **Make Fields tab editable** — updateCaseFieldValues action exists, add form inputs
4. **Add loading.tsx files** — Skeleton component exists, zero loading states anywhere
5. **Install Recharts** — add 2-3 charts to dashboard and reports
