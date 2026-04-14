# AI Supervisor + Client Communication Module — Implementation Plan

**Status:** Tiered build underway (2026-04-11)
**Source:** Three emails from Austin Hogan describing AI Client Communication, AI Supervisor, and Process Elimination requirements.

## Context

Favorble is a legal SaaS for Hogan Smith Law (~170 staff, Social Security Disability practice, ~28,700 active cases, replacing 16+ systems including MyCase, CaseStatus, Chronicle, and HRG Tracker).

The operator asked for:

1. **AI Client Communication Module** — clients message through the platform (or via CaseStatus bridge), the AI reads the full case file and drafts case-specific responses, identifies action items, drafts artifacts (letters, call scripts, filings), and logs everything automatically.
2. **AI Supervisor Module** — a virtual operations manager that continuously monitors every team member across 10 roles, flags stagnant cases and missed deadlines, proactively drives case action on triggering events, analyzes call/message quality, scores and ranks performers, and drafts coaching conversations.
3. **Process Elimination Framework** — a strategic lens for deciding which roles can be automated away, significantly reduced, or kept human-only. Covered in `docs/process-elimination-framework.md`.

## 29 User Stories

### AI Client Communication Module (CM)
| ID | Story |
|---|---|
| CM-1 | Two-way messaging tied to case file (inbound + outbound via CaseStatus bridge or direct) |
| CM-2 | AI drafts case-specific responses using the full case file as context |
| CM-3 | AI identifies action items, asks client if already done, creates client tasks with instructions |
| CM-4 | AI drafts artifacts for team tasks (filings, call scripts, letters, MR requests) |
| CM-5 | Every message + AI draft + task action auto-logged to case audit timeline |

### Quality Analysis (QA)
| ID | Story |
|---|---|
| QA-1 | Call transcripts ingested + reviewed by AI for quality/compliance, results per member |
| QA-2 | Outbound messages auto-reviewed for accuracy/tone/professionalism |
| QA-3 | Client sentiment analysis flagging frustration / churn risk |
| QA-4 | Per-member role-specific performance scoring |

### Supervisor Monitoring (SM)
| ID | Story |
|---|---|
| SM-1 | Continuous task completion monitoring per team member across roles |
| SM-2 | SSA-deadline tracking flagging inaction by responsible party |
| SM-3 | Stagnant case detection with role-specific next-step recommendations |
| SM-4 | Workload balancing + reassignment recommendations |
| SM-5 | Role-specific metrics dashboards for each of 10 roles |

### Supervisor Action (SA)
| ID | Story |
|---|---|
| SA-1 | Event-driven alerts telling responsible party exactly what to do |
| SA-2 | AI auto-drafts responsive documents (appeals, briefs, petitions, letters, requests) |
| SA-3 | AI auto-drafts client explanation messages on events |
| SA-4 | AI auto-generates tailored call scripts per situation |
| SA-5 | AI auto-assigns tasks with SSA-timeline-based deadlines |
| SA-6 | AI auto-updates case file with new providers/parties/judges from docs |
| SA-7 | Auto follow-up + 3-tier escalation (reminder → supervisor → dashboard) |
| SA-8 | Full lifecycle timeline visible in one view |

### Reporting & Rankings (RP)
| ID | Story |
|---|---|
| RP-1 | Daily/weekly/monthly per-member and per-team performance reports |
| RP-2 | Role-based within-role leaderboards |
| RP-3 | Pattern identification — process problem vs people problem |
| RP-4 | Trend tracking over time per member |
| RP-5 | Cross-team handoff performance metrics |

### Coaching (CC)
| ID | Story |
|---|---|
| CC-1 | Role-tailored action steps for underperformers |
| CC-2 | AI-drafted coaching conversations with file-specific examples |
| CC-3 | Training gap identification across a role |
| CC-4 | AI-generated call scripts for supervisor coaching |

### Predictive & Compliance (PR)
| ID | Story |
|---|---|
| PR-1 | Predictive risk scoring on cases (denial / missed deadline likelihood) |
| PR-2 | Compliance monitoring (bar, ethics, documentation) |
| PR-3 | Bottleneck identification by stage and team |

## Baseline Scoring (pre-build, 2026-04-11)

| ID | Score | ID | Score | ID | Score | ID | Score |
|---|---|---|---|---|---|---|---|
| CM-1 | 72 | QA-1 | 5 | SM-1 | 55 | RP-1 | 28 |
| CM-2 | 35 | QA-2 | 3 | SM-2 | 25 | RP-2 | 22 |
| CM-3 | 8 | QA-3 | 2 | SM-3 | 20 | RP-3 | 12 |
| CM-4 | 18 | QA-4 | 25 | SM-4 | 35 | RP-4 | 15 |
| CM-5 | 45 | | | SM-5 | 40 | RP-5 | 30 |
| SA-1 | 30 | CC-1 | 5 | PR-1 | 18 | | |
| SA-2 | 15 | CC-2 | 3 | PR-2 | 8 | | |
| SA-3 | 60 | CC-3 | 5 | PR-3 | 32 | | |
| SA-4 | 5 | CC-4 | 2 | | | | |
| SA-5 | 45 | | | | | | |
| SA-6 | 35 | | | | | | |
| SA-7 | 10 | | | | | | |
| SA-8 | 25 | | | | | | |

**Overall average: ~23/100.** The app has a strong data layer but very little intelligence/automation layer on top.

## Cross-cutting Building Blocks

All three research agents converged on ~15 primitives that unblock most of the 29 stories. Building these once is the highest-leverage work:

1. **`buildCaseContext(caseId)`** — `lib/services/case-context.ts`. Single helper returning `{ case, communications, chronology, docs, tasks, stage history, notes }` for AI prompts. Unlocks CM-2, CM-4, SA-2, SA-3, SA-4, QA-2, CC-2.
2. **Notifications subsystem** — `db/schema/notifications.ts` + bell component + delivery channels. Unlocks SA-1, SA-7, coaching alerts.
3. **Supervisor events table** — `db/schema/supervisor-events.ts` with event_type + lifecycle steps JSON. Unlocks SA-1, SA-5, SA-8.
4. **Generalized workflow triggers** — extend `lib/workflow-engine.ts` beyond `stage_enter` (document_received, message_received, time_elapsed, field_changed). Unlocks CM-3, SA-1, SA-5.
5. **Performance snapshots table** — `db/schema/performance-snapshots.ts` keyed by `(userId, periodStart, metricKey)` rolled up nightly via cron. Unlocks RP-1, RP-2, RP-4, QA-4.
6. **Role-metric dictionary** — `lib/services/role-metrics.ts` encoding per-role targets, weights, SLAs. Unlocks SM-5, RP-1, RP-2, QA-4, CC-1.
7. **SSA deadline rules engine** — `lib/services/ssa-deadlines.ts` encoding appeal windows, 5-day evidence rule, fee petitions. Unlocks SM-2, SA-5, SA-7.
8. **Cron scheduling layer** — expand `vercel.json` crons for deadline scan, stagnant scan, overdue escalation, nightly snapshot rollup.
9. **AI action queue on inbound events** — extend `lib/services/enqueue-processing.ts` `after()` pattern for analyze-communication jobs. Unlocks CM-3, QA-1, QA-2, QA-3.
10. **Case risk scoring service** — `lib/services/risk-scorer.ts` + `db/schema/case-risk.ts`. Unlocks PR-1, feeds PR-2, CC-2, SM-3.
11. **Pattern analysis service** — `lib/services/pattern-analysis.ts` (stddev, z-score, outlier detection). Unlocks RP-3, RP-4, CC-3, SM-4, PR-3.
12. **Coaching context bundler** — pulls audit + tasks + communications + stage transitions for a user/period. Unlocks all CC stories.
13. **Sentiment analyzer** — extends `communications` with `sentiment_score`, `sentiment_label` columns + scanner. Unlocks QA-3, feeds PR-1.
14. **AI document drafts** — `db/schema/ai-drafts.ts` (or reuse `documents` with source='ai_draft') + per-artifact-type generators. Unlocks SA-2, CM-4.
15. **Role enum expansion** — add `fee_collection`, `hearing_advocate`, `appeals_council`, `post_hearing`, `pre_hearing_prep` to `user_role` enum. Prerequisite for SM-5, RP-1/2/4, CC-1/2/3.

## Tiered Implementation Plan

### Tier 1 — Foundation (schema + primitives)

**Impact:** +15 average score (notifications table existing moves SA-1 from 30 → 55, supervisor events table moves SA-8 from 25 → 50, even before UI lands).

- A. `lib/services/case-context.ts`
- B. Notifications schema + `lib/services/notify.ts` + `NotificationBell` component
- C. Supervisor events schema + event recording helpers
- D. Generalized workflow triggers in `lib/workflow-engine.ts`
- E. New role enum values (migration)
- F. New cron entries: deadline scan, stagnant scan, overdue escalation, nightly snapshot rollup
- G. `lib/services/role-metrics.ts` (per-role metric dictionary)
- H. `lib/services/ssa-deadlines.ts` (SSA rules engine)
- I. `performance_snapshots` schema + nightly rollup cron
- J. `case_risk` schema + `lib/services/risk-scorer.ts`
- K. `lib/services/pattern-analysis.ts`
- L. `ai_drafts` schema (or documents extension)
- M. `communications` column additions (sentiment, thread, read state, response time)
- N. Sentiment analyzer service

### Tier 2 — High-ROI features building on Tier 1

**Impact:** +18 average score.

- CM-5 (45 → 90): Communications in case activity timeline + `logCommunicationEvent()` helper
- CM-2 (35 → 85): Rewrite `draftCommunication()` on `buildCaseContext()`, wire into message thread
- SA-3 (60 → 90): Auto-trigger `draftCommunication` from webhook events
- SA-1 (30 → 80): Notifications bell fires on webhook events with "what-to-do-next"
- SM-2 (25 → 75): `app/api/cron/deadline-scan/route.ts` + appeal-window detection
- SM-3 (20 → 75): Stagnant case scanner with role-specific next-step prompts
- PR-3 (32 → 80): Bottleneck analysis from `caseStageTransitions` joined to team/role
- SA-4 (5 → 70): `generateCallScript(caseId, callType, scenario)` action

### Tier 3 — Bigger concrete deliverables

**Impact:** +20 average score.

- CM-3 two-step client task confirmation flow (new task status, webhook extension, AI extractor)
- CM-4 AI artifact generator (letters, MR requests, filings)
- SA-2 AI document auto-drafts per event type (appeals, reconsiderations, AC briefs, fee petitions)
- SA-5 SSA-deadline-aware task assignment
- SA-6 auto-populate contacts from extraction output
- SA-7 Escalation ladder (reminder → supervisor → dashboard)
- SA-8 Unified lifecycle timeline view
- SM-4 Workload balancing detector with reassignment recommendations
- SM-5 Full per-role dashboards (all 10 roles)
- RP-1 Daily/weekly/monthly performance reports
- RP-2 Role leaderboards
- RP-4 Per-member time series trends
- RP-5 Cross-team handoff metrics

### Tier 4 — Heavy greenfield (needs external integrations or multi-week effort)

- QA-1 Call transcript ingestion (CallTools webhook + Whisper/Deepgram + QC scoring + review UI). **Scaffold level:** schema + webhook receiver + review UI; transcription service is a stub with a "connect Deepgram" hook.
- QA-2 Outbound message QA with pre-send interception
- QA-3 Sentiment analysis + at-risk client dashboard
- QA-4 Full per-member performance scoring across all metrics
- CC-1/2/3/4 Complete coaching workflow module
- PR-1 Case risk scoring (heuristic version in this build; ML version deferred)
- PR-2 Compliance rule engine
- RP-3 Pattern analysis (process vs people)

## Honest Scope Notes

- **"All tiers to 100"** in one session is physically impossible. The realistic interpretation is "ship the data model, server actions, and UI for every story; stub external-service integrations with clear extension points." Full production polish for things like ML risk scoring or real-time transcript QC legitimately requires weeks with external services.
- **Tier 1+2** should be shippable in one extended session with parallel agents, moving the average from ~23 to ~56.
- **Tier 3** expands the average to ~76 across all stories but introduces significant code volume. Parallelizable via agents.
- **Tier 4** requires scope compromises: heuristic risk scoring instead of ML, stubbed transcript service, scaffolded coaching UI. Stories land at ~70-80 instead of 100 in one session, with a clear path to 100 documented in each feature's own README.

## Roles vs schema mismatch

The 10 personas described by the operator don't all map 1:1 to the current `user_role` enum. Missing enum values to add as part of Tier 1:
- `fee_collection`
- `hearing_advocate`
- `appeals_council`
- `post_hearing`
- `pre_hearing_prep`

Already present: `admin`, `attorney`, `case_manager`, `filing_agent`, `intake_agent`, `mail_clerk`, `medical_records`, `phi_sheet_writer`, `reviewer`, `viewer`.
