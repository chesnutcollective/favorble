# Process Elimination Framework

**Purpose:** A structured lens for deciding which roles at Hogan Smith Law can be fully automated, significantly reduced, or must remain human. Prompted by Austin's Part 2 email on 2026-04-11.

**How to use this document:** walk through each role in the firm with the operator. For each role, apply the five-lens test, then land on one of three dispositions: `ELIMINATE`, `REDUCE`, or `HUMAN-REQUIRED`. The output is a headcount plan + a feature priority list for Favorble.

## The Five-Lens Test

For any given role or task, ask these five questions before deciding its fate. A role that passes all five can be **eliminated**. A role that passes 3-4 can be **reduced to exception handling**. A role that passes 0-2 must **remain human** (though tooling can still make them faster).

### Lens 1 — Judgment Load
**Question:** How often does the task require a genuine, context-sensitive judgment call that a human would defend if challenged?

- **Low:** Filing a standardized form, sending a templated letter, requesting records from a known provider, logging a call.
- **Medium:** Drafting a pre-hearing brief, writing a client explanation of a denial, choosing which records to emphasize.
- **High:** Cross-examining an ALJ, negotiating a fee waiver, deciding whether to take a case on appeal, coaching a team member.

**Rule:** Low judgment = automate. High judgment = keep human. Medium = AI drafts, human approves (reviewer role).

### Lens 2 — Liability Exposure
**Question:** If this task goes wrong, does the firm face Bar complaints, malpractice claims, or client harm?

- **Low:** Sending a status update message, scheduling a call, logging a document to the case file, pulling records the client already authorized.
- **High:** Filing a brief with the court, signing a fee agreement, closing a case, advising on strategic decisions.

**Rule:** Low liability = automate. High liability = human must approve before action, even if AI drafts.

### Lens 3 — Error Recoverability
**Question:** If the AI makes a mistake, can it be undone or corrected without lasting harm?

- **High recoverability:** A bad status message can be followed by a correction. A miscategorized record can be reclassified.
- **Low recoverability:** A missed appeal deadline kills the case. A signed fee agreement creates legal obligations. An out-of-policy disclosure on a Bar-regulated matter could be a violation.

**Rule:** High recoverability = automate. Low recoverability = human approval gate, especially for any action with a clock or a signature.

### Lens 4 — Training Data Density
**Question:** Does the firm already have the data an AI would need to do this task well?

- **Dense:** ~28,700 cases of precedent, ~3,000+ medical records per month, decades of ALJ rulings, millions of client messages — ideal training ground for records routing, pre-hearing brief drafting, denial explanation.
- **Sparse:** Individual coaching conversations, nuanced advocate performance reviews, strategic partnership decisions — no historical corpus.

**Rule:** Dense = AI can do the work today. Sparse = keep human or build data collection first.

### Lens 5 — Client Preference
**Question:** Would a client be comforted or alienated if they knew an AI handled this?

- **Comforted:** "The system automatically pulled your records so we didn't delay your case." "The AI flagged your message as urgent and routed it to your case manager."
- **Alienated:** "The AI wrote the brief your attorney is arguing from." "An AI denied your case on first review."

**Rule:** Client-facing judgment calls stay human. Back-office drudgery becomes invisible automation.

## Disposition Definitions

| Disposition | Definition | Headcount Outcome |
|---|---|---|
| **ELIMINATE** | Task can run fully automated. No human review required except for random audit sampling. | Role goes to 0 (or absorbed into a reviewer/auditor function). |
| **REDUCE to reviewer** | AI does the drafting. A human reviews and approves before the action fires. Human's job becomes "catch the 5% the AI gets wrong." | Role shrinks to 10-25% of current headcount, becomes an exception-handling + quality-audit function. |
| **REDUCE to exception handler** | AI handles the 80% happy path automatically. A human picks up the 20% that hit edge cases (complex claimants, unusual records, contested matters). | Role shrinks to 20-40% of current headcount. |
| **HUMAN-REQUIRED** | Task needs full-time human attention because of judgment, liability, client preference, or legal requirement. AI provides tooling (drafts, summaries, suggestions) but human does the work. | Headcount stays the same, but productivity per person goes up significantly. |
| **HYBRID** | New role that doesn't exist today. Usually a "quality/compliance reviewer" who oversees the automated pipelines and handles escalations. | Net new headcount (usually 5-10% of eliminated roles). |

## Role-by-Role Analysis Template

For each role in the firm, fill in this template. The operator should walk through every role with the team lead for that function.

### Role: `<name>`

**Current headcount:** `<N>`

**Primary tasks (top 5):**
1.
2.
3.
4.
5.

**Five-Lens Scores (Low / Medium / High per lens):**
- Judgment Load:
- Liability Exposure:
- Error Recoverability:
- Training Data Density:
- Client Preference:

**Disposition:** `ELIMINATE` / `REDUCE to reviewer` / `REDUCE to exception handler` / `HUMAN-REQUIRED` / `HYBRID`

**Projected headcount after 12 months of Favorble automation:** `<N>`

**Favorble features required to reach that state:** `<list of feature IDs>`

**Risks:** `<what breaks if this disposition is wrong>`

## First-Pass Dispositions for Hogan Smith Roles

These are directional — they should be debated with the operator and each team lead. They reflect the author's interpretation of the emails, not a firm decision.

### Intake Team
- **Current:** Handles new case intake, eligibility screening, fee agreement, welcome call.
- **Five-Lens read:** Eligibility screening (Medium judgment, Medium liability, High recoverability, Dense data, Comforted). Fee agreement generation (Low / High / Low / Dense / Alienated). Welcome call (High / Low / High / Sparse / Alienated).
- **Disposition:** **REDUCE to exception handler**. AI screens the 80% of clear cases. A small human team handles borderline eligibility, rapport-building calls, and Spanish-speaking claimants. The welcome call stays human.
- **Required features:** CM-2, CM-3, CM-4, PR-1, QA-3.
- **Projected headcount:** ~25% of current.

### Filing Agents
- **Current:** Prepare and submit SSDI + SSI applications through Chronicle/ERE, attach receipts, transition stages post-filing.
- **Five-Lens read:** Primarily form-filling + submission tracking. Low judgment, Medium liability (filing with court), High recoverability, Dense data, Invisible to client.
- **Disposition:** **ELIMINATE** with a **HYBRID** reviewer role overseeing submissions. AI drafts the filing, auto-submits via ERE, a human reviewer in a new "submissions QA" function spot-checks ~10% of filings and handles any ERE rejections.
- **Required features:** SA-2, SA-5, SA-6, SA-8, QA-2, PR-2.
- **Projected headcount:** ~10% of current, merged into a new submissions QA team.

### Medical Records Agents
- **Current:** 40+ specialists in 5 color-coded teams. Request records from providers, track completeness, coordinate RFC forms.
- **Five-Lens read:** Sending records requests (Low / Low / High / Dense / Invisible). Following up with providers (Low / Low / High / Dense / Invisible). Verifying completeness against hearing date (Medium / Medium / Medium / Dense / Invisible). RFC form coordination (Medium / High / Medium / Dense / Alienated — doctors notice AI-generated RFC letters).
- **Disposition:** **REDUCE to reviewer**. AI handles 80% of request + follow-up automatically. Humans handle provider escalations, RFC form coordination with doctors, and quality audits on records completeness. Portal credential management goes to admin (and must be moved out of the current plaintext spreadsheet — security-critical).
- **Required features:** SA-2 (MR requests), SA-7 (escalation), SM-2 (deadline tracking), SM-5 (MR dashboards), SA-6 (auto-populate providers), a dedicated credential vault.
- **Projected headcount:** ~35% of current. Savings are offset by the new credential vault + QA reviewer roles.

### Case Managers
- **Current:** ~10 case workers, each handling 50-100 active cases. Daily task queue, SSA status updates, document management, client messaging, deadline management.
- **Five-Lens read:** Client messaging (Medium / Medium / High / Dense / Mixed). Deadline tracking (Low / High / Low / Dense / Invisible). Status updates (Medium / Low / High / Dense / Comforted).
- **Disposition:** **REDUCE to exception handler**. AI handles routine client messaging (SA-3, CM-2), deadline tracking, SSA status updates. Humans handle client escalations, complex message triage, and the relationship side of case management. The "50-100 cases per person" ratio could grow to 200-400 with AI assistance.
- **Required features:** All of CM-1 through CM-5, SA-1, SA-3, SA-7, SM-2, SM-3.
- **Projected headcount:** Same headcount, 3-4× higher case capacity per person. NO reduction recommended — the leverage goes into serving more cases, not cutting staff.

### Pre-Hearing Brief Writers
- **Current:** Dedicated team drafting pre-hearing briefs for every case.
- **Five-Lens read:** Synthesizing medical evidence into a brief (High judgment, Medium liability, Medium recoverability, Dense data, Invisible to client). The core work IS judgment-heavy, but the drafting mechanics are repetitive.
- **Disposition:** **REDUCE to reviewer**. AI drafts the brief from the full case context (buildCaseContext + medical chronology + SSA decision history + ALJ pattern data). A human reviewer spends 15 minutes per brief catching errors, adjusting emphasis, and approving. Today's writers become reviewers.
- **Required features:** SA-2 (brief generation), PR-1 (risk scoring so high-risk cases get more human attention), RP-3 (quality tracking).
- **Projected headcount:** ~30% of current. The remaining team is higher-skilled and reviews drafts rather than writing from scratch.

### Hearing Advocates / Representatives
- **Current:** 37 reps (8 internal, 22 external/contract, 7 in-house). Caseloads vary 11-613 hearings. Represent claimants at ALJ hearings.
- **Five-Lens read:** Appearing at hearings (High / High / Low / Sparse / Alienated by AI substitute). Post-hearing case analysis (Medium / Low / Medium / Dense / Invisible). Advocacy during hearing (High / High / Low / Sparse / Very Alienated).
- **Disposition:** **HUMAN-REQUIRED**. AI gives them vastly better prep materials (PHI sheets, ALJ stats, case context, medical chronology summaries) but the advocate MUST be human for every hearing. The 37-person team stays the same, but average case capacity per rep grows because prep time drops from hours to minutes.
- **Required features:** CM-2, SA-2 (brief generation), QA-1 (transcript review of past hearings), SM-5 (advocate leaderboard), RP-2 (performance ranking).
- **Projected headcount:** Same. External/contract reps stay external/contract but get RBAC-scoped portal access.

### Post-Hearing Processing Team
- **Current:** Processes hearing outcomes, files post-hearing paperwork, updates case stage, notifies clients.
- **Five-Lens read:** Recording hearing outcome (Low / Low / High / Dense / Invisible). Filing post-hearing paperwork (Low / Medium / Medium / Dense / Invisible). Client notification (Medium / Low / High / Dense / Mixed).
- **Disposition:** **ELIMINATE** with **HYBRID** reviewer overseeing outcome-driven automation. AI reads the hearing outcome, auto-files the right paperwork, drafts the client notification, updates the case stage, kicks off fee collection if favorable.
- **Required features:** SA-1 (outcome events), SA-2 (paperwork drafts), SA-3 (client notifications), SA-5 (stage transitions), all driven by an "outcome detected" event.
- **Projected headcount:** 0 as a standalone team; ~2 people absorbed into the new submissions QA function.

### Fee Collection Team
- **Current:** Collects attorney fees post-favorable decision, tracks delinquent payments.
- **Five-Lens read:** Generating fee petition (Low / Medium / Medium / Dense / Invisible). Following up on collections (Low / Low / High / Dense / Mixed — some clients resent dunning). Handling disputes (High / High / Low / Sparse / Alienated).
- **Disposition:** **REDUCE to exception handler**. AI generates the fee petition on favorable decision, auto-follows up via CaseStatus messaging, escalates unpaid fees to a small human team. Humans handle disputes and difficult conversations.
- **Required features:** SA-2 (fee petition generation), SA-3 (collection messaging), SA-7 (escalation ladder), a fee-collection workspace.
- **Projected headcount:** ~20% of current.

### Appeals Council Brief Writers
- **Current:** Dedicated team drafting Appeals Council briefs.
- **Five-Lens read:** Same reasoning as pre-hearing brief writers but with higher liability because these briefs are the last-chance filing.
- **Disposition:** **REDUCE to reviewer**. AI drafts from ALJ decision + full case context. A SENIOR human reviewer spends 30-60 minutes per brief because of the higher stakes. This is where the small number of remaining brief writers lives.
- **Required features:** SA-2 (AC brief generation), PR-2 (compliance checks), RP-2 (quality scoring).
- **Projected headcount:** ~40% of current (kept higher than pre-hearing because of the liability profile).

### Mail Clerks
- **Current:** 3-5 clerks. Process physical mail, scan and attach to cases, categorize, log outbound certified mail.
- **Five-Lens read:** Scanning + categorization (Low / Low / High / Dense / Invisible). Case matching (Low / Low / High / Dense / Invisible). Outbound certified logging (Low / Medium / Medium / Dense / Invisible).
- **Disposition:** **REDUCE to exception handler**. AI categorizes scanned mail and auto-attaches to cases. Humans handle scanner exceptions and unmatched mail. Outbound certified mail stays human because of chain-of-custody requirements.
- **Required features:** SA-6 (auto-populate from extraction), enhanced mail workspace with AI categorization, OCR pipeline.
- **Projected headcount:** ~30% of current (1-2 clerks remain).

### PHI Sheet Writers
- **Current:** 4-6 writers producing pre-hearing intelligence sheets.
- **Five-Lens read:** Research (Medium / Low / High / Dense / Invisible). Writing the sheet (High / Low / Medium / Dense / Invisible). Editorial review (Medium / Low / High / Dense / Invisible).
- **Disposition:** **REDUCE to reviewer**. Already partially automated via LangExtract `phi_sheet_draft`. Human reviews and refines the AI draft. Today's writers become reviewers.
- **Required features:** SA-2 (PHI sheet generation already scaffolded), SM-5 (PHI writer dashboard), RP-2 (throughput ranking).
- **Projected headcount:** ~50% of current (2-3 writers).

## Aggregate Projection

| Role | Current | Projected | Delta |
|---|---|---|---|
| Intake | 10 | 2-3 | -75% |
| Filing Agents | 10 | 1-2 | -85% |
| Medical Records | 40 | 14 | -65% |
| Case Managers | 10 | 10 | 0% (leverage goes into capacity) |
| Pre-Hearing Brief Writers | 8 | 2-3 | -70% |
| Hearing Advocates | 37 | 37 | 0% |
| Post-Hearing Processing | 5 | 0 | -100% |
| Fee Collection | 6 | 1-2 | -75% |
| Appeals Council Writers | 5 | 2 | -60% |
| Mail Clerks | 4 | 1-2 | -65% |
| PHI Writers | 5 | 2-3 | -50% |
| **New: Submissions QA reviewer** | 0 | 3-5 | +∞ |
| **New: Compliance auditor** | 0 | 1-2 | +∞ |
| **TOTAL** | ~140 | ~75-85 | ~-45% |

**Caveat:** These are directional. The real conversation happens with each team lead, using the five-lens test and the role-by-role template. Some of these dispositions will shift in the conversation. The point is the framework, not the numbers.

## Connection to Favorble Feature Priority

The dispositions above drive which Favorble features MUST ship before any role reduction can happen:

### Must ship before ANY reduction
- SA-2 AI document auto-drafts (all roles depend on this)
- SA-1 Event-driven alerts (replaces the "humans notice things" function)
- SA-7 Escalation ladder (the safety net when AI misses)
- CM-2 AI client message drafting (replaces most intake + case manager messaging)
- PR-2 Compliance monitoring (the guardrail that lets us trust reduced headcount)
- QA-1/2 Quality audit pipelines (the QA review function for any reduced role)

### Must ship before specific reductions
- Filing Agents eliminated: SA-5 (auto task + SSA deadlines) + SA-6 (auto-populate contacts)
- Post-Hearing eliminated: outcome-detection webhook + SA-2 + SA-3
- Medical Records reduced: credential vault + SA-2 (MR request drafts) + SM-2 (deadline tracking)
- Brief writers reduced: SA-2 (brief generation with high-context prompts) + PR-2 (compliance checks)

## Discussion prompts for the call with Austin

1. **Which roles do you have the political capital to reduce first?** Some roles will be culturally easier to shrink than others. Filing agents and post-hearing processing are the lowest-drama candidates.
2. **Where is the current quality baseline low enough that AI beats humans easily?** E.g., if intake response time averages 24 hours, AI's 30-second response is an immediate win regardless of quality.
3. **Which reductions require the new QA / reviewer function?** Every reduced role should pair with a small QA function that catches AI errors — this is non-negotiable for anything near court filings or fee collection.
4. **What's the escalation path when AI is wrong?** The escalation ladder (SA-7) must exist before any reduction can happen, because reduced headcount means fewer humans to notice errors.
5. **Which roles should grow even though AI is eliminating their current tasks?** Case managers are the obvious example — more capacity per person instead of fewer people. This is a culture shift ("we're growing, not shrinking") that needs explicit framing.
6. **External attorneys (22 of 37 reps)** — are they a subset of the advocate role with different tooling needs? RBAC-scoped portal access is a dedicated build.

## Next steps

1. Walk this document through with Austin on the call. Apply the role-by-role template to each of the 10 roles.
2. For each role, land on a disposition and required feature IDs.
3. Update `docs/ai-supervisor-plan.md` with any feature priority changes driven by the reduction decisions.
4. Build the features required for the first wave of reductions.
5. Run a pilot reduction with one role (suggested: filing agents, lowest drama) to prove the model before expanding.
