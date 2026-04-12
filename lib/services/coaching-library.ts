/**
 * Coaching recipe library (CC-1, CC-2, CC-3, CC-4).
 *
 * Static content keyed by `{role, metricKey}` that turns a raw coaching
 * flag into a concrete, role-specific remediation plan. Supervisors see
 * the `diagnosis` + `actionSteps` in the flag UI, Claude uses the
 * talking points + root causes + resources as structured context when
 * drafting a conversation or call script, and `detectTrainingGaps`
 * uses `trainingResources` for its recommendation text.
 *
 * Covers every non-admin role defined in `ROLE_METRICS`. Each recipe is
 * written at a "a new supervisor could run this today" quality bar — no
 * placeholder copy, no generic handwaving. If we ever add a new metric
 * to a role pack, add the matching recipe here.
 *
 * Pure data — no server-only imports so CLI scripts and tests can
 * consume it.
 */

export type CoachingActionStep = {
  /** Short imperative label shown in the flag UI. */
  label: string;
  /** Concrete "do this" description — 1-3 sentences. */
  description: string;
  /** What success looks like if the step is executed. */
  expectedOutcome: string;
  /** Human-readable timeframe ("Today", "This week", etc). */
  timeframe: string;
};

export type CoachingRecipe = {
  role: string;
  metricKey: string;
  /** One-paragraph notification-grade summary of the issue. */
  diagnosis: string;
  /** 3-5 concrete action steps. */
  actionSteps: CoachingActionStep[];
  /** Bullet points the supervisor should hit in the coaching conversation. */
  coachingTalkingPoints: string[];
  /** Training resources to point the team member at. */
  trainingResources: string[];
  /** Typical root-cause patterns when this metric goes sideways. */
  commonRootCauses: string[];
};

export const COACHING_LIBRARY: CoachingRecipe[] = [
  // ------------------------------------------------------------------
  // intake_agent
  // ------------------------------------------------------------------
  {
    role: "intake_agent",
    metricKey: "new_leads_handled_per_day",
    diagnosis:
      "New-lead volume is below the 20/day target. Every untouched lead is a prospective client the firm is losing to a competitor, and the marketing team's cost-per-lead math breaks if leads are not being worked.",
    actionSteps: [
      {
        label: "Start the day in /intake/leads sorted by oldest-first",
        description:
          "Open /intake/leads, filter to 'Assigned to me', sort by created date ascending. Work the oldest lead first — the first-touch clock is the biggest conversion driver.",
        expectedOutcome:
          "Every assigned lead gets a first-touch attempt before end-of-day",
        timeframe: "Daily habit starting tomorrow",
      },
      {
        label: "Batch dial in two 90-minute blocks",
        description:
          "Block 9:30-11:00 and 1:30-3:00 on your calendar as dial time. Close email and Slack during those blocks. Target 25 dials per block.",
        expectedOutcome: "50 dials per day, 20+ meaningful conversations",
        timeframe: "Start Monday",
      },
      {
        label: "Use the auto-dialer sequence on /intake",
        description:
          "Click 'Start auto-dial' on the intake queue instead of clicking each lead individually. It saves ~40 seconds per lead and keeps you in a rhythm.",
        expectedOutcome: "Lead throughput jumps 20-30% in the first week",
        timeframe: "Today",
      },
      {
        label: "Review your leftover leads with the supervisor at end of day",
        description:
          "At 4:30pm, screenshot the list of leads still untouched and send to your supervisor with a 1-sentence note on why. This forces either a reassignment or a next-day plan.",
        expectedOutcome: "Zero leads go 24 hours without a touch",
        timeframe: "Daily through the next 2 weeks",
      },
    ],
    coachingTalkingPoints: [
      "The target is 20 leads handled per day — you are currently at [actual]. At your conversion rate, each missed lead is worth ~$1,800 in potential fees.",
      "Ask open-ended: 'Walk me through the last lead that slipped — what was in the way?' Listen for queue triage, phone anxiety, or tool friction.",
      "Demo the auto-dialer on a real lead during the coaching session — the biggest throughput unlock is behavioral, not volume-based.",
      "Set a specific 7-day goal: 'I want to see 20/day by next Friday' and put a recurring 4:30pm check-in on both calendars.",
    ],
    trainingResources: [
      "Intake Playbook § 2 — The First 60 Seconds (video, 4 min)",
      "Intake Playbook § 3 — Auto-dialer Workflow",
      "Peer shadow: schedule 60 min sitting next to [top intake agent name]",
    ],
    commonRootCauses: [
      "Working leads one-at-a-time instead of using the auto-dialer sequence",
      "Getting pulled into Slack / email during dial windows",
      "Triaging to warmest leads first instead of oldest-first (warm leads stay warm; cold leads go to zero)",
      "Fear of cold calls — needs roleplay with supervisor to rebuild confidence",
    ],
  },
  {
    role: "intake_agent",
    metricKey: "lead_conversion_rate",
    diagnosis:
      "Lead conversion is below the 35% target. Volume alone is not the problem — conversations are happening but contracts are not getting signed. This is almost always a skill issue (objection handling or the close) rather than a volume issue.",
    actionSteps: [
      {
        label: "Review the last 10 lost leads with the supervisor",
        description:
          "Pull /intake/leads filtered to status=lost in the last 14 days. Read the disposition notes together and tag each one: price objection / already represented / bad timing / lost interest / ghosted.",
        expectedOutcome:
          "A clear picture of which objection is killing deals most often",
        timeframe: "Before next Wednesday",
      },
      {
        label: "Roleplay the top objection with the supervisor",
        description:
          "Whatever the #1 disposition from step 1 is, the supervisor plays the prospect and you run the rebuttal 5 times in a row. Record the last rep and listen back.",
        expectedOutcome:
          "A scripted rebuttal you can say naturally, on the spot, in a real call",
        timeframe: "Same session as the review",
      },
      {
        label: "Shadow a top-converting peer for 90 minutes",
        description:
          "Sit with [top intake agent] on three live intake calls. Take notes on exactly how they handle the contract ask and the silence after.",
        expectedOutcome:
          "Import 2-3 concrete phrases or moves into your own flow",
        timeframe: "Within 5 business days",
      },
      {
        label: "Ask for the contract on every qualified call",
        description:
          "Stop offering to 'send info first'. If a lead qualifies (SSI/SSDI eligible, not already represented), say 'Let me get your e-signature started right now' and use /intake/contract-send.",
        expectedOutcome: "Lead-to-contract-sent rate climbs within 3 days",
        timeframe: "Start on your very next call",
      },
    ],
    coachingTalkingPoints: [
      "Target is 35% conversion — you're at [actual]%. Volume is fine, the problem is in the conversation.",
      "Pull up the last 10 lost lead notes together on screen — don't talk about hypothetical calls, talk about real ones with names.",
      "Normalize the close: 'Sending info' is the softest form of not closing. Every qualified lead should get a contract ask.",
      "Commit to a 7-day target (e.g. 30% by next Friday) and schedule a call-review session at the end of the week.",
    ],
    trainingResources: [
      "Intake Playbook § 5 — Handling the Top 8 Objections",
      "Recorded call library: filter tag=won, listen to 3 winning closes",
      "Peer shadow with top converter (schedule via supervisor)",
    ],
    commonRootCauses: [
      "Not asking for the contract on qualified calls — defaulting to 'I'll email you info'",
      "Weak rebuttal to the 'I need to think about it' stall — no muscle memory for the reframe",
      "Qualifying too loosely — spending time on leads already represented elsewhere",
      "Not using the e-sign flow live on the call — telling the lead they'll 'get something in the mail'",
    ],
  },
  {
    role: "intake_agent",
    metricKey: "contracts_sent_per_day",
    diagnosis:
      "Contracts sent per day is below the 8 target. Leads are being worked but the contract-send action is not happening — usually because contracts are being batched for end-of-day or sent by email outside the system.",
    actionSteps: [
      {
        label: "Send every contract the moment the prospect agrees",
        description:
          "From the lead detail page, click 'Send contract' → DocuSign flow while still on the phone. Confirm the email arrived before ending the call.",
        expectedOutcome: "Contract sent within 2 minutes of verbal yes",
        timeframe: "Start on your very next call",
      },
      {
        label: "Stop batching contracts at end-of-day",
        description:
          "Do not collect a list and send them all at 4pm. By then, half the prospects have cooled off or gone to a competitor. Every delay costs signatures.",
        expectedOutcome:
          "Contract-sent-to-contract-signed rate climbs noticeably",
        timeframe: "Break the habit today",
      },
      {
        label: "Pre-fill contract templates for common case types",
        description:
          "Use /intake/templates to set up pre-filled contracts for the 3 most common scenarios (SSDI, SSI, both). Saves 90 seconds per send.",
        expectedOutcome:
          "Time-to-send drops from ~3 minutes to under 30 seconds",
        timeframe: "End of this week",
      },
    ],
    coachingTalkingPoints: [
      "Target is 8 contracts sent per day, you are at [actual]. A contract not sent in the first 5 minutes has about half the close rate of one sent live on the call.",
      "Ask: 'What's stopping you from sending contracts live during the call?' Watch for 'I like to verify info first' — push back: verify while you send.",
      "Demo the one-click template send during the coaching session — this is usually a tool-familiarity gap, not a willingness gap.",
    ],
    trainingResources: [
      "Intake Playbook § 6 — Live Contract Send Workflow (video, 3 min)",
      "Templates cheat sheet at /intake/templates",
    ],
    commonRootCauses: [
      "Batching contracts at end-of-day instead of live-on-call",
      "Sending contracts from personal email instead of /intake/contract-send (missing the metric)",
      "Not using pre-filled templates — re-typing client info each time",
      "Re-confirming info for 5+ minutes after the verbal yes, letting the prospect cool",
    ],
  },
  {
    role: "intake_agent",
    metricKey: "avg_response_time_minutes",
    diagnosis:
      "Average first-touch response time is above 15 minutes. Every minute of delay in the first-touch costs conversion — the data says leads that wait >10 minutes convert at ~60% of the rate of <5-minute first touches.",
    actionSteps: [
      {
        label: "Enable SMS + push notifications for new-lead assignments",
        description:
          "Go to /settings/notifications and turn on 'New lead assigned' for both SMS and mobile push. This is the single highest-leverage fix.",
        expectedOutcome:
          "You know about a new lead within 30 seconds of assignment",
        timeframe: "Today",
      },
      {
        label: "Commit to a 5-minute first-touch SLA",
        description:
          "From now until the metric is green, every new lead gets a phone attempt within 5 minutes of showing up in your queue. If you can't call, send the pre-written SMS via /intake/quick-text.",
        expectedOutcome:
          "Average first-touch drops under 15 minutes within a week",
        timeframe: "Start today",
      },
      {
        label: "Keep the dialer window open during focus time",
        description:
          "During 9:00-5:00, keep /intake/leads open in a dedicated browser tab. Check it every time you finish a call. Don't rely on email to tell you about new leads.",
        expectedOutcome: "Drastically reduced lead-to-first-touch time",
        timeframe: "Daily habit",
      },
    ],
    coachingTalkingPoints: [
      "Target is 15 minutes average — you are at [actual]. The firm's cost-per-lead is $180; at your current speed we're wasting about $X per week in dead leads.",
      "Ask: 'Walk me through what you do between 9am and noon. When do you check the lead queue?' Listen for event-driven checking vs. schedule-driven.",
      "Enable push notifications together during the session — do not leave without seeing a test notification fire.",
      "Set a specific 7-day SLA goal: 'Under 15 minutes by next Friday'.",
    ],
    trainingResources: [
      "Notification settings walkthrough: /settings/notifications",
      "Intake Playbook § 1 — Why First-Touch Speed Matters",
      "SMS quick-text templates at /intake/quick-text",
    ],
    commonRootCauses: [
      "Mobile notifications never enabled — agent only sees leads when they check the queue",
      "Checking the queue only between calls, not at the start of every status change",
      "Trying to call perfectly prepped — spending 10 minutes reading context before dialing instead of calling first, reading second",
      "No 'quick-text' fallback for when dials go to voicemail",
    ],
  },
  {
    role: "intake_agent",
    metricKey: "follow_up_compliance_rate",
    diagnosis:
      "Scheduled lead follow-ups are not being completed on time. The target is 90% and we are below 75%. Missed follow-ups are the #2 leak in the funnel after slow first-touch — prospects who asked to be called back and then weren't rarely come back on their own.",
    actionSteps: [
      {
        label: "Start every day by clearing yesterday's follow-ups",
        description:
          "First action of the day: open /intake/leads, filter to 'follow-up due', and work every one before starting new leads. Yesterday's slips get repaired before today's work begins.",
        expectedOutcome:
          "Follow-up compliance rate climbs 10+ points within 5 days",
        timeframe: "Daily habit starting tomorrow",
      },
      {
        label: "Use the 'snooze & recall' feature, not a notebook",
        description:
          "When you schedule a callback, click 'Snooze & set follow-up' on the lead — it'll reappear at the top of your queue at the right time. Don't rely on sticky notes or a paper planner.",
        expectedOutcome:
          "Every scheduled follow-up fires automatically; nothing falls off",
        timeframe: "Start today",
      },
      {
        label: "Batch non-urgent follow-ups into a 3pm slot",
        description:
          "If you can't keep up with follow-ups as they fire, block 3:00-4:00pm as 'follow-up power hour' and clear the whole list in one batch.",
        expectedOutcome: "No follow-up goes more than 24 hours late",
        timeframe: "Start this week",
      },
    ],
    coachingTalkingPoints: [
      "Target is 90% follow-up compliance — you are at [actual]%. Missed follow-ups are the #2 funnel leak.",
      "Ask: 'How are you tracking your follow-ups right now?' — if the answer isn't '/intake/leads with the snooze feature', that's the fix.",
      "Walk through the snooze flow on a real lead together during the session.",
      "A 3pm daily 'follow-up power hour' block on the calendar is the mechanical fix for anyone who can't keep up in real time.",
    ],
    trainingResources: [
      "Intake Playbook § 4 — Follow-up Discipline",
      "Video: Using Snooze & Recall (2 min)",
    ],
    commonRootCauses: [
      "Tracking follow-ups on paper or in a separate app instead of in /intake/leads",
      "Working only hot leads and letting cold follow-ups slide",
      "No scheduled block of time for follow-ups — relying on 'I'll get to it between calls'",
      "Not closing the loop on the lead when the follow-up is done — the system still shows it as pending",
    ],
  },

  // ------------------------------------------------------------------
  // case_manager
  // ------------------------------------------------------------------
  {
    role: "case_manager",
    metricKey: "task_completion_rate",
    diagnosis:
      "Task completion rate is below the 90% target. Tasks are slipping past their due dates, which usually signals either workload imbalance, poor prioritization, or that the task board doesn't reflect real work.",
    actionSteps: [
      {
        label: "Reconcile your task board with reality",
        description:
          "Open /tasks?assigned=me, go through every open task, close anything already done, reassign anything not yours, and set realistic due dates on everything else. Target: your board matches actual open work by EOD.",
        expectedOutcome: "Task board is trustworthy; metric becomes meaningful",
        timeframe: "Today",
      },
      {
        label: "Start each day with a 10-minute triage",
        description:
          "9:00-9:10 every morning, open /tasks sorted by due date ascending. Identify the 3 tasks you MUST close today and commit to them. Everything else is secondary.",
        expectedOutcome:
          "3+ tasks closed per day minimum; backlog doesn't grow",
        timeframe: "Daily habit",
      },
      {
        label: "Escalate blocked tasks within 24 hours",
        description:
          "If a task is blocked waiting on a provider / client / attorney for >24 hours, add a comment tagging the supervisor and move the status to 'blocked'. Don't let blocked tasks rot in 'in progress'.",
        expectedOutcome: "Blocked tasks get unblocked or reassigned quickly",
        timeframe: "Start today",
      },
      {
        label: "Review workload with supervisor weekly",
        description:
          "Every Friday, send a 3-bullet summary: tasks closed, tasks blocked, tasks rolling to next week. Triggers a real conversation if the load is genuinely unmanageable.",
        expectedOutcome:
          "Workload issues surface early instead of at review time",
        timeframe: "Every Friday",
      },
    ],
    coachingTalkingPoints: [
      "Target is 90% task completion rate — you're at [actual]%. Before we dig into throughput, we need to know the board reflects reality. How confident are you that every open task is actually still needed?",
      "Ask: 'Which tasks do you keep sliding?' Listen for patterns — all MR follow-ups? All client callbacks? The pattern points at the fix.",
      "Walk through the daily triage ritual live during the session — a bad morning triage is upstream of most completion-rate problems.",
      "If the issue is workload, this is a capacity conversation, not a performance conversation — flag it to the supervisor team.",
    ],
    trainingResources: [
      "CM Handbook § 3.1 — Task Board Hygiene",
      "CM Handbook § 3.4 — Daily Triage Ritual",
      "Video: Blocked Task Escalation (2 min)",
    ],
    commonRootCauses: [
      "Task board has stale / completed / irrelevant tasks inflating the denominator",
      "No daily triage — tasks chosen reactively from whatever Slack ping arrives first",
      "Blocked tasks never marked as blocked, making the real workload invisible",
      "Actual workload exceeds capacity — needs workload rebalance, not coaching",
    ],
  },
  {
    role: "case_manager",
    metricKey: "avg_response_time_minutes",
    diagnosis:
      "Average response time to inbound client messages is exceeding the 60-minute target. Slow responses erode client trust and drive negative client-satisfaction signals and escalations to supervisors and attorneys.",
    actionSteps: [
      {
        label: "Review unread message backlog first",
        description:
          "At the start of each shift, open /messages filtered to your cases and process oldest-first before starting other task work. Every message gets at least an acknowledgment.",
        expectedOutcome:
          "Every inbound message has an acknowledgment within 60 minutes",
        timeframe: "Daily habit, measured weekly",
      },
      {
        label: "Use AI reply drafting for anything over one line",
        description:
          "On any message that requires more than a one-line response, click 'Draft AI reply' to get a case-context-aware draft in under 10 seconds. Review, edit, and send.",
        expectedOutcome:
          "Composition time drops from minutes per message to seconds",
        timeframe: "Start today",
      },
      {
        label: "Turn on push + email notifications for urgent messages",
        description:
          "/settings/notifications → enable email + mobile push for 'client_sentiment_risk' and 'client_message_received'. This gets you alerts on high-priority messages outside the app.",
        expectedOutcome:
          "No urgent message waits longer than 30 minutes, even outside normal hours",
        timeframe: "Today",
      },
      {
        label: "Batch-triage every 2 hours, not continuously",
        description:
          "Context-switching to messages every 5 minutes destroys task completion. Instead, set a timer: triage messages at 9, 11, 1, 3, 5. In between, you're heads-down on tasks.",
        expectedOutcome:
          "Response time stays under target without sacrificing task completion",
        timeframe: "Start this week",
      },
    ],
    coachingTalkingPoints: [
      "Target is 60-minute average response, we're currently averaging [actual] minutes.",
      "Clients who wait >4 hours for a response are dramatically more likely to leave a negative sentiment signal or escalate to the attorney.",
      "AI reply drafting reduces composition time by ~80% — demo it on a real message during the coaching conversation.",
      "Ask: 'Do you get a notification when a client messages?' — notification gaps are the #1 cause outside of triage habits.",
    ],
    trainingResources: [
      "CM Handbook § 4.2 — Client Communication SLAs",
      "Video: Using AI Reply Drafting (2 min)",
      "Notification settings walkthrough: /settings/notifications",
    ],
    commonRootCauses: [
      "Task queue triage prioritizes checklist tasks over messages",
      "Not using AI draft feature — composing every reply from scratch",
      "Missing notifications outside the app — no email/SMS/push set up",
      "Triaging messages continuously and getting context-switch-thrashed instead of batching",
    ],
  },
  {
    role: "case_manager",
    metricKey: "unread_messages_backlog",
    diagnosis:
      "Unread client messages have piled up beyond the 10-message warn threshold. A backlog this size means messages are being missed entirely, not just answered slowly — which is how sentiment risks and escalations hide.",
    actionSteps: [
      {
        label: "Zero the backlog by end of day",
        description:
          "Block the next 60-90 minutes as 'inbox zero' time. Open /messages filtered to unread on your cases, sort oldest-first, and work through every single one. Mark as read only after acknowledging.",
        expectedOutcome: "Unread backlog at 0 before you leave today",
        timeframe: "Today, non-negotiable",
      },
      {
        label: "Adopt a twice-daily inbox triage cadence",
        description:
          "9:00am and 2:00pm — triage every unread message. Not 'check for messages', but 'go to zero'. Everything else waits until triage is done.",
        expectedOutcome: "Backlog stays under 5 throughout the week",
        timeframe: "Daily habit starting tomorrow",
      },
      {
        label: "Use the 'acknowledge' quick action",
        description:
          "If a message needs a real reply later but you can't write it now, send the 1-click 'Got it, I'll look into this today' acknowledgment. Stops the clock on client anxiety without committing to a full response.",
        expectedOutcome:
          "Clients feel heard even when you can't answer immediately",
        timeframe: "Start on the very next message",
      },
    ],
    coachingTalkingPoints: [
      "Target backlog is under 10 messages, you're at [actual]. We treat a backlog of this size as an operational emergency, not a metric problem.",
      "Ask: 'When's the last time you had inbox zero?' If the answer is 'never' or '2 weeks ago', we need the 'clear it now' action step.",
      "Demo the 1-click acknowledge action — supervisors consistently find case managers who don't know it exists.",
      "Commit to a backlog of zero at end-of-day tomorrow, and twice-daily triage after that.",
    ],
    trainingResources: [
      "CM Handbook § 4.3 — Inbox Triage",
      "Video: 1-Click Acknowledge Action (90 sec)",
    ],
    commonRootCauses: [
      "Opening messages but not sending an acknowledgment — they stay unread because 'I'll reply later'",
      "Filtering out of the message view while working on tasks and forgetting to return",
      "Triaging only the urgent-looking messages and letting everything else age",
      "Tool confusion — reading in Gmail/Outlook but the message stays 'unread' in the app",
    ],
  },
  {
    role: "case_manager",
    metricKey: "active_cases",
    diagnosis:
      "Active case count is below the expected range. This usually means recent cases are being reassigned away or that intake handoffs are not landing on this case manager's dock — either way, this is a capacity or routing issue, not a performance deficit.",
    actionSteps: [
      {
        label: "Confirm you're in the active intake rotation",
        description:
          "Ask your supervisor: 'Am I getting new-case assignments from intake?' If the answer is 'no' or 'less than others', something in /admin/assignment-rules has you paused or deprioritized.",
        expectedOutcome: "Clear picture of why new cases aren't arriving",
        timeframe: "This week",
      },
      {
        label: "Volunteer for the next 5 newly-filed cases",
        description:
          "Message the intake supervisor: 'I have capacity — please route the next 5 filings to me.' This is a capacity-signal; most managers sit quietly and wait.",
        expectedOutcome: "Active case count climbs within 7 days",
        timeframe: "Today",
      },
      {
        label: "Review your recently-closed cases for lessons",
        description:
          "If cases are being pulled from you before expected, pull /cases filtered to 'recently closed/transferred' and read the transfer reasons. Patterns here are coachable.",
        expectedOutcome:
          "Understanding of whether cases are being pulled for a reason",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Target active case count is 100, you're at [actual]. This is unusual — it usually means we're not routing cases to you, not that you're performing poorly.",
      "Ask: 'Have you been asking for more cases?' — low-case-count CMs often don't raise their hand because they don't want to look unloaded.",
      "If there's a routing issue in /admin/assignment-rules, this is a 5-minute fix that unlocks everything.",
    ],
    trainingResources: [
      "CM Handbook § 1.2 — Case Assignment Flow",
      "Admin guide: /admin/assignment-rules",
    ],
    commonRootCauses: [
      "Paused or deprioritized in /admin/assignment-rules from a past vacation and never re-enabled",
      "Recent transfer-out events because of client conflicts — worth investigating",
      "Not self-advocating for new-case assignment",
      "Intake supervisor defaults to assigning to 2-3 trusted CMs, creating invisible routing inequity",
    ],
  },
  {
    role: "case_manager",
    metricKey: "stage_transitions_per_week",
    diagnosis:
      "Stage transitions per week are below target — cases on this manager's dock are not progressing through the workflow as quickly as the team average. This is almost always a process problem (stuck on a specific bottleneck stage) rather than a throughput problem.",
    actionSteps: [
      {
        label: "Identify your top stuck stage",
        description:
          "Open /cases?assigned=me and group by stage. Where are most of your cases sitting? That stage is your bottleneck. Common answers: 'Awaiting MR', 'Waiting on Contract Signature', 'Ready for Filing Review'.",
        expectedOutcome: "Clear picture of exactly where cases are stalling",
        timeframe: "Today",
      },
      {
        label: "Run a 10-case unstick session with the supervisor",
        description:
          "Pick the 10 cases stuck longest in your top stuck stage. Sit with the supervisor for 30 minutes, go through each one, and either take an action or mark it as blocked.",
        expectedOutcome: "5+ cases transition to next stage, others escalated",
        timeframe: "This week",
      },
      {
        label: "Add the stage-transition action to your daily task list",
        description:
          "Every day, pick 3 cases from your stuck stage and commit to transitioning them by EOD. Small, daily, mechanical.",
        expectedOutcome:
          "Stage transition count climbs from [actual] to 10+ per week within 2 weeks",
        timeframe: "Daily starting Monday",
      },
    ],
    coachingTalkingPoints: [
      "Target is 15 stage transitions per week, you're at [actual]. This is usually a workflow-bottleneck issue, not an effort issue.",
      "Pull up /cases?assigned=me grouped by stage live during the session — the bottleneck is visible immediately.",
      "Ask: 'What's blocking each of these?' — you will hear patterns fast.",
      "A weekly 'unstick review' cadence is the structural fix — schedule it with the supervisor.",
    ],
    trainingResources: [
      "CM Handbook § 5 — Workflow Stages & Transition Checklists",
      "Dashboard: /coaching/workflow-bottlenecks (when available)",
    ],
    commonRootCauses: [
      "All cases stuck waiting on MR — should be escalated to medical-records team, not owned by the CM",
      "Signature / documentation collection missing — needs client outreach sprint",
      "Not aware that a transition is needed — missing a review checkpoint in the CM workflow",
      "Waiting for 'perfect' conditions to advance instead of advancing with known caveats",
    ],
  },
  {
    role: "case_manager",
    metricKey: "stagnant_case_count",
    diagnosis:
      "Stagnant cases (no activity in 14+ days) have crossed the 5-case threshold. Stagnant cases are the leading indicator of case-abandonment complaints, client churn, and state bar complaints.",
    actionSteps: [
      {
        label: "Pull the stagnant case list and categorize each one",
        description:
          "Open /cases?assigned=me&stagnant=true. For each one, tag: 'waiting on us', 'waiting on client', 'waiting on provider', or 'waiting on SSA'. Only the first bucket is your fault.",
        expectedOutcome: "A categorized list you can triage",
        timeframe: "Today",
      },
      {
        label: "Touch every 'waiting on us' case by EOD",
        description:
          "For any case in the 'waiting on us' bucket, do the next action today — even if it's just writing a note that says 'Blocked on X, escalated to Y'. Break the silence.",
        expectedOutcome: "Stagnant count drops by at least 50% by tomorrow",
        timeframe: "Today",
      },
      {
        label:
          "Schedule client-touch outreach for the 'waiting on client' bucket",
        description:
          "Block 30 minutes this week to call or send a personal SMS to every client in this bucket. Use /cases/bulk-message if you have more than 5.",
        expectedOutcome: "Clients re-engage or cases get closed out cleanly",
        timeframe: "This week",
      },
      {
        label: "Set a recurring Friday stagnant-case review",
        description:
          "Recurring weekly calendar block: Friday 2-3pm, 'stagnant case review'. No case should ever hit 14 days stagnant again.",
        expectedOutcome: "Stagnant count stays under 3 week over week",
        timeframe: "Weekly starting this Friday",
      },
    ],
    coachingTalkingPoints: [
      "You have [actual] stagnant cases — target is under 5. Stagnant cases are a bar-complaint risk, not just a metric.",
      "Review the list live together — categorization is the 90% of the fix.",
      "Only the 'waiting on us' bucket is coachable; the others are process or client-side and get different treatment.",
      "Commit to Friday 2pm as your recurring stagnant review, and to hitting 0 'waiting on us' by next Friday.",
    ],
    trainingResources: [
      "CM Handbook § 6.1 — Stagnant Case Playbook",
      "Video: Bulk Client Outreach via /cases/bulk-message (3 min)",
    ],
    commonRootCauses: [
      "Cases that are blocked but never marked as blocked — hiding in 'in progress'",
      "Waiting on client for documents without a scheduled follow-up cadence",
      "Taking no action because 'nothing can happen yet' — but the client doesn't know that",
      "Not using the stagnant-cases dashboard at all — relying on memory to surface stalled work",
    ],
  },

  // ------------------------------------------------------------------
  // filing_agent
  // ------------------------------------------------------------------
  {
    role: "filing_agent",
    metricKey: "applications_filed_per_day",
    diagnosis:
      "Daily filings are below the 12/day target. Each undersized day pushes cases further into the SSA backlog, adds weeks of delay to eventual hearings, and costs the client money in lost back-pay.",
    actionSteps: [
      {
        label: "Clear the ready-to-file queue top-to-bottom",
        description:
          "Open /filing/queue sorted by time-in-queue descending. Work oldest-first, no exceptions. Don't cherry-pick the easy ones; the oldest are costing the firm the most.",
        expectedOutcome:
          "Oldest queue items get filed or escalated, not skipped",
        timeframe: "Daily habit",
      },
      {
        label: "Block two 2-hour filing sprints each day",
        description:
          "9:30-11:30 and 1:30-3:30 — calendar-blocked, no meetings, no interruptions. Close Slack. Target: 6 filings per sprint.",
        expectedOutcome: "12 filings per day consistently",
        timeframe: "Starting Monday",
      },
      {
        label: "Use the bulk-filing feature for clean submissions",
        description:
          "If you have 3+ filings from the same representative (you) on the same provider / case type, use /filing/bulk-submit. Saves ~4 minutes per filing in ERE form-filling.",
        expectedOutcome: "Throughput climbs 15-20% on batch-eligible days",
        timeframe: "This week",
      },
      {
        label: "Escalate queue items you cannot file",
        description:
          "If an item has been in your queue 5+ days and is missing info, don't keep skipping it. Move it back to the case manager with a specific 'need X, Y, Z' note.",
        expectedOutcome:
          "Queue contents are actually fileable, not zombie items",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Target is 12 filings per day, you're at [actual]. Every day below target pushes cases further into the SSA backlog.",
      "Ask: 'What's in the queue right now that you keep passing over?' — those are the symptoms we need to fix.",
      "Demo the bulk-filing feature live — this is usually a tool-awareness gap.",
      "Commit to two calendar-blocked filing sprints per day starting Monday, and a 7-day target of 10+ per day.",
    ],
    trainingResources: [
      "Filing Playbook § 2.1 — Queue Prioritization",
      "Video: Bulk-Filing Workflow (4 min)",
      "SSA ERE quick-reference cheat sheet",
    ],
    commonRootCauses: [
      "Cherry-picking easy filings — oldest queue items get skipped",
      "No calendar-blocked filing time — filings happen between other work, never in focus",
      "Zombie queue items (missing info) clogging the queue and inflating the denominator",
      "Not using bulk-submit for eligible batches — doing each filing individually",
    ],
  },
  {
    role: "filing_agent",
    metricKey: "avg_time_ready_to_filed_hours",
    diagnosis:
      "Average time from 'ready to file' to actually filed is exceeding 72 hours. Every hour in this gap is a day the SSA clock isn't running for the client — and pile-ups here cascade into missed statutory deadlines.",
    actionSteps: [
      {
        label: "Work the queue oldest-first, every session",
        description:
          "Stop sorting by case type or perceived complexity. Sort /filing/queue by 'time-in-ready' descending and work top-down.",
        expectedOutcome:
          "Average ready-to-filed time drops to under 48 hours within a week",
        timeframe: "Start today",
      },
      {
        label: "File same-day for any case flagged urgent",
        description:
          "Urgent-flagged cases (DDS deadlines, dire need) must be filed the same day they hit the queue. Set a notification for 'urgent filing ready' in /settings/notifications.",
        expectedOutcome: "Zero urgent filings wait overnight",
        timeframe: "Today",
      },
      {
        label: "End-of-day queue check",
        description:
          "Last 15 minutes of each day, re-open /filing/queue. Anything that's been sitting >48 hours gets either filed or escalated before you log off.",
        expectedOutcome: "Nothing ages past 48 hours silently",
        timeframe: "Daily habit",
      },
    ],
    coachingTalkingPoints: [
      "Target is 24-hour ready-to-filed turnaround, you're at [actual] hours.",
      "Ask: 'How do you choose which filing to work next?' — if the answer is anything other than 'oldest-first', that's the fix.",
      "Urgent-flagged cases bypass the queue entirely — make sure the agent knows they must be filed same day.",
    ],
    trainingResources: [
      "Filing Playbook § 2.2 — Ready-to-Filed SLAs",
      "Notification setup for urgent filings",
    ],
    commonRootCauses: [
      "Sorting queue by case type / complexity instead of oldest-first",
      "Urgent-flagged cases sitting because the agent doesn't see the flag",
      "No end-of-day queue check — aging items hide until morning",
      "Waiting for missing info that could have been escalated instead",
    ],
  },
  {
    role: "filing_agent",
    metricKey: "queue_depth",
    diagnosis:
      "The ready-to-file queue is above 30 items, which is the warn threshold. A deep queue cascades into missed deadlines, client frustration, and attorney escalations — even if per-day throughput looks OK.",
    actionSteps: [
      {
        label: "Run a 1-day clear-the-queue sprint",
        description:
          "With supervisor approval, spend a full day on nothing but filing. Close Slack, decline meetings, don't pick up any new case-manager requests. Target: drop the queue by 30+ items.",
        expectedOutcome: "Queue depth back under 20",
        timeframe: "This week",
      },
      {
        label: "Reassign overflow to a second filer",
        description:
          "If the queue is 60+ items, this is a capacity problem not a performance problem. Ask the supervisor to temporarily route half to another agent.",
        expectedOutcome: "Queue depth back to normal within 3 days",
        timeframe: "Today",
      },
      {
        label: "Send zombie items back",
        description:
          "Go through /filing/queue and identify anything missing info. Return each to the case manager with a specific note. Don't just skip them forever.",
        expectedOutcome:
          "Queue denominator drops; real filable work is visible",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Queue depth is [actual], target is under 10. A queue this size is an operational risk, not a performance metric.",
      "The first question is whether this is throughput or capacity — throughput is coachable, capacity is a staffing decision.",
      "A 1-day all-hands clear-the-queue sprint can reset the problem if we commit to it this week.",
    ],
    trainingResources: [
      "Filing Playbook § 2.3 — Queue Management",
      "Admin guide: reassignment workflow",
    ],
    commonRootCauses: [
      "Throughput not keeping up with inflow — may need a second filer",
      "Zombie items (missing info) inflating the queue count",
      "Agent taking on non-filing work during supposed filing time",
      "No escalation path when the queue crosses the warn threshold",
    ],
  },
  {
    role: "filing_agent",
    metricKey: "filing_error_rate",
    diagnosis:
      "SSA rejection / error rate is above the 8% warn threshold. Rejected filings cost the client weeks of delay and force the case back into the queue — a 10% error rate is equivalent to filing 10% fewer cases overall.",
    actionSteps: [
      {
        label: "Review the last 10 rejected filings with the supervisor",
        description:
          "Pull /filing?status=rejected from the last 14 days. Read each rejection reason together and tag: 'missing info' / 'wrong form' / 'ERE error' / 'SSA data entry'.",
        expectedOutcome:
          "Clear pattern on the #1 rejection cause — that's the fix target",
        timeframe: "This week",
      },
      {
        label: "Update the pre-submission checklist",
        description:
          "Based on step 1, add the top 3 failure points to the pre-submission checklist. Everyone on the team benefits, not just you.",
        expectedOutcome: "Rejection rate drops 50%+ within 2 weeks",
        timeframe: "Same session as the review",
      },
      {
        label: "Run every filing through the pre-flight checker",
        description:
          "Before hitting 'submit' on any filing, run the /filing/pre-flight check. It catches the top 10 common SSA rejections automatically.",
        expectedOutcome: "Reject rate drops below 5%",
        timeframe: "Every filing starting today",
      },
    ],
    coachingTalkingPoints: [
      "Error rate is [actual]%, target is under 2%. Every rejection is a week of delay for a client who can't afford it.",
      "Pull up the last 10 rejections live during the session — don't talk about hypothetical errors, talk about specific ones.",
      "This is often a tooling gap — demo the pre-flight checker during the session and confirm the agent knows it exists.",
    ],
    trainingResources: [
      "Filing Playbook § 3 — SSA Rejection Patterns",
      "Video: Pre-flight Checker (2 min)",
      "SSA error code reference sheet",
    ],
    commonRootCauses: [
      "Not running the pre-flight checker — or not knowing it exists",
      "Missing a specific piece of info (DOB format, SSN format, rep name) consistently",
      "Using the wrong form variant for the case type",
      "ERE credential timing out mid-submission and the agent retries without catching errors",
    ],
  },

  // ------------------------------------------------------------------
  // medical_records
  // ------------------------------------------------------------------
  {
    role: "medical_records",
    metricKey: "mr_requests_sent_per_day",
    diagnosis:
      "Medical-record requests sent per day are below the 20/day target. Every day of delay in requesting records compounds into a multi-week delay at hearing — and records that don't get requested early get requested late.",
    actionSteps: [
      {
        label: "Clear the request queue top-down",
        description:
          "Open /mr/queue sorted by case-age descending. The oldest case with no request out is the biggest risk — work it first.",
        expectedOutcome:
          "Every case with needed records has at least one request out",
        timeframe: "Daily habit",
      },
      {
        label: "Use the bulk-request feature for hospital systems",
        description:
          "If you have 3+ cases needing records from the same hospital system (Kaiser, Sutter, etc), use /mr/bulk-request to send them all with one upload.",
        expectedOutcome: "Request throughput climbs 30%+ on batch days",
        timeframe: "This week",
      },
      {
        label: "Pair with a peer hitting target for 1 hour",
        description:
          "Sit with [top MR specialist] and observe exactly how they triage and send. Import their shortcuts and keyboard flow.",
        expectedOutcome: "Pickup of 2-3 specific workflow improvements",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Target is 20 requests per day, you're at [actual]. Delays here compound — every day of delay at request = roughly 1 day of delay at hearing.",
      "Ask: 'What's in the queue that you keep passing over?' — usually it's the complicated ones.",
      "Demo bulk-request live during the session. It is the #1 underused feature in the MR tool.",
    ],
    trainingResources: [
      "MR Playbook § 1 — Daily Request Cadence",
      "Video: Bulk-Request Workflow (3 min)",
      "Provider shortlist cheat sheet (top 20 hospitals + their fax lines)",
    ],
    commonRootCauses: [
      "Not using bulk-request for batchable providers",
      "Cherry-picking easy providers and leaving the hard ones",
      "No calendar-blocked request time — requests happen between other work",
      "Queue has zombie items (cases that don't actually need records yet) inflating the denominator",
    ],
  },
  {
    role: "medical_records",
    metricKey: "mr_request_turnaround_days",
    diagnosis:
      "Average turnaround from case-needs-records to first records received is above the 35-day warn threshold. Long turnarounds usually mean requests are going out but not being followed up on — providers sit on requests unless poked.",
    actionSteps: [
      {
        label: "Pull all open requests older than 14 days",
        description:
          "Open /mr/requests filtered to open + older than 14 days. Every one gets a follow-up call or fax today. No exceptions.",
        expectedOutcome: "At least 20 follow-ups logged in a single session",
        timeframe: "This week",
      },
      {
        label: "Set up automated 14-day re-requests",
        description:
          "In /mr/settings, enable 'auto re-request after 14 days'. If a provider hasn't responded, the system re-sends automatically.",
        expectedOutcome: "No request sits >14 days without a nudge",
        timeframe: "Today",
      },
      {
        label: "Flag chronically slow providers for escalation",
        description:
          "Any provider consistently >30 days without responding goes on the escalation list. Supervisor handles the phone chase to their records department.",
        expectedOutcome: "Top-5 offenders get named and handled, not absorbed",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Turnaround is [actual] days, target is 21. Turnaround = send + wait + follow-up. Most teams focus on send; the fix is in the follow-up.",
      "Ask: 'What's your follow-up cadence today?' If the answer is 'when I remember', that's the fix.",
      "Enable auto re-request together live during the session.",
    ],
    trainingResources: [
      "MR Playbook § 2 — Provider Follow-up Cadence",
      "Video: Auto Re-request Setup (2 min)",
      "Escalation template for chronically slow providers",
    ],
    commonRootCauses: [
      "Sending a request and never following up",
      "Auto re-request never enabled — or disabled and forgotten",
      "No escalation path when a provider goes silent for 30+ days",
      "Follow-ups logged in a personal notebook instead of /mr so the metric looks worse than reality",
    ],
  },
  {
    role: "medical_records",
    metricKey: "follow_up_compliance_rate",
    diagnosis:
      "Follow-up compliance on MR requests is below 80%. The target is 95% because providers treat records requests as low-priority unless consistently chased — and unchased requests can sit for months.",
    actionSteps: [
      {
        label: "Review the MR follow-up checklist",
        description:
          "Open the MR request-send flow. Is the 14-day follow-up auto-scheduled on every new request? If not, fix that setting today.",
        expectedOutcome: "Every new request has an auto-follow-up scheduled",
        timeframe: "Today",
      },
      {
        label: "Clear the overdue follow-up queue",
        description:
          "Open /mr/followups?overdue=true. Every overdue follow-up gets closed today — either by contacting the provider or by re-requesting.",
        expectedOutcome: "Overdue queue hits zero",
        timeframe: "Today",
      },
      {
        label: "Turn on daily follow-up reminders",
        description:
          "/settings/notifications → enable 'MR follow-up due' daily digest. Arrives at 9am with the day's follow-up list.",
        expectedOutcome:
          "Follow-ups become a first-thing habit, not an afterthought",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Target is 95% follow-up compliance, you're at [actual]%. Without follow-up, records requests are effectively lost.",
      "Ask: 'Are follow-ups getting scheduled automatically when you send a request?' — often the setting is off.",
      "Demo the daily digest setup during the session.",
    ],
    trainingResources: [
      "MR Playbook § 3 — Follow-up Discipline",
      "Video: Daily Digest Setup (90 sec)",
    ],
    commonRootCauses: [
      "Auto-follow-up setting never turned on",
      "Follow-ups scheduled but not worked — queue ignored",
      "No daily digest notification — relying on in-app check",
      "Closing follow-ups without actually following up (gaming the metric)",
    ],
  },
  {
    role: "medical_records",
    metricKey: "records_complete_by_hearing_date",
    diagnosis:
      "Share of cases with complete records by hearing date is below 80%. This is the most important MR metric — incomplete records at hearing costs cases. Even one unreceived record at hearing can be the difference between win and loss.",
    actionSteps: [
      {
        label: "Pull every hearing in the next 30 days",
        description:
          "Open /hearings?within=30d and check MR completeness for each. Any hearing at <100% records gets a targeted sprint this week.",
        expectedOutcome: "Hearing docket is visible and prioritized correctly",
        timeframe: "Today",
      },
      {
        label: "Escalate any provider gap >14 days before hearing",
        description:
          "For any hearing in <14 days with an open MR request, call the provider yourself (not fax). Personal chase, supervisor escalation if needed.",
        expectedOutcome: "No hearing goes in with a silent open request",
        timeframe: "Daily this week",
      },
      {
        label: "Set a 30-day-out MR completeness review",
        description:
          "Every Monday, open /hearings?within=30d and review MR status. Catch gaps 30 days out, not 3 days out.",
        expectedOutcome: "Records-complete rate climbs to 95%+ within 3 weeks",
        timeframe: "Weekly starting Monday",
      },
    ],
    coachingTalkingPoints: [
      "This is the metric that most directly affects win rate — [actual]% vs. 95% target. A record that doesn't make it in is evidence that doesn't get weighed.",
      "Pull up next week's hearings live during the session and triage together.",
      "Ask the attorney team: 'Which upcoming hearings are you worried about?' and cross-reference the MR status.",
    ],
    trainingResources: [
      "MR Playbook § 4 — Hearing Readiness Checklist",
      "Video: 30-Day Out Review Workflow (3 min)",
    ],
    commonRootCauses: [
      "MR agent not aware of hearing dates — no hearing-aware view",
      "Reviewing MR completeness reactively (when attorney asks) instead of proactively",
      "Chronic gaps at specific providers that never got escalated",
      "Auto re-request not escalating to phone chase within 14 days of hearing",
    ],
  },
  {
    role: "medical_records",
    metricKey: "rfc_forms_completed_per_week",
    diagnosis:
      "RFC (Residual Functional Capacity) forms completed per week are below the 5/week warn threshold. RFC forms are the most valuable piece of medical evidence we control — an RFC from a treating doctor is worth 3x any other record in hearing prep.",
    actionSteps: [
      {
        label: "Pull the list of cases needing RFC forms",
        description:
          "Open /mr/rfc-needed. Sort by hearing date ascending. Work the closest-to-hearing first.",
        expectedOutcome:
          "Clear picture of how many forms are actually needed and by when",
        timeframe: "Today",
      },
      {
        label: "Send RFCs in batches by provider",
        description:
          "When you find multiple cases needing an RFC from the same treating doctor, send them all with one cover letter. Saves ~15 minutes per batch and improves return rate.",
        expectedOutcome: "Throughput climbs 40%+ on batch days",
        timeframe: "This week",
      },
      {
        label: "Follow up at 10 days, not 30",
        description:
          "RFCs get returned faster if followed up at 10 days. Set the auto-follow-up interval to 10 days in /mr/settings.",
        expectedOutcome: "Average RFC return time drops from ~30 to ~15 days",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Target is 8 RFCs per week, you're at [actual]. RFCs are the single highest-leverage evidence type we control.",
      "Ask: 'What's stopping you from sending more RFCs?' Listen for 'doctors don't fill them out' — that's a follow-up cadence fix, not a volume fix.",
      "Demo batch-RFC send during the session.",
    ],
    trainingResources: [
      "MR Playbook § 5 — RFC Strategy",
      "Video: Batch RFC Send Workflow (4 min)",
      "RFC cover letter templates",
    ],
    commonRootCauses: [
      "Sending one RFC at a time instead of batching by provider",
      "Not following up at 10 days — waiting until 30+",
      "Not identifying which cases need RFCs until too close to hearing",
      "Using generic cover letters — specific, hand-addressed letters return 2x faster",
    ],
  },

  // ------------------------------------------------------------------
  // phi_sheet_writer
  // ------------------------------------------------------------------
  {
    role: "phi_sheet_writer",
    metricKey: "phi_sheets_completed_per_week",
    diagnosis:
      "PHI sheets completed per week is below the 10/week warn threshold. PHI sheets are the backbone of hearing prep — a missing PHI sheet almost guarantees the attorney walks into hearing underprepared.",
    actionSteps: [
      {
        label: "Clear the oldest sheets first",
        description:
          "Open /phi/queue sorted by assignment date ascending. Work oldest-first. Don't cherry-pick short or easy sheets.",
        expectedOutcome: "Aging sheets get completed instead of skipped",
        timeframe: "Daily habit",
      },
      {
        label: "Use the PHI auto-populate feature",
        description:
          "Click 'Auto-populate from records' on any new sheet. It pulls demographics, diagnosis, meds, and impairments from the MR documents into the sheet. Saves 20-30 minutes per sheet.",
        expectedOutcome: "Time per sheet drops from ~90 minutes to ~45 minutes",
        timeframe: "Start on the very next sheet",
      },
      {
        label: "Batch 3 sheets per day in a 3-hour block",
        description:
          "Calendar block 9:00-12:00 as 'PHI deep work'. Phone off, Slack closed. Target: 3 completed sheets by noon.",
        expectedOutcome: "15 sheets per week consistently",
        timeframe: "Daily starting Monday",
      },
    ],
    coachingTalkingPoints: [
      "Target is 15 sheets per week, you're at [actual]. Every missing sheet is a hearing where the attorney is improvising.",
      "Ask: 'Are you using auto-populate on new sheets?' — if no, this is a 30-minutes-per-sheet unlock.",
      "Demo auto-populate live during the session on a real sheet.",
    ],
    trainingResources: [
      "PHI Playbook § 2 — Auto-populate Workflow",
      "Video: Writing a PHI Sheet in 45 Minutes (walkthrough, 15 min)",
      "PHI sheet template library",
    ],
    commonRootCauses: [
      "Not using auto-populate — writing every section from scratch",
      "Letting each sheet stretch because there's no deep-work block",
      "Constantly re-reading records instead of working from a highlighted summary",
      "Taking on non-PHI work during supposed PHI time",
    ],
  },
  {
    role: "phi_sheet_writer",
    metricKey: "phi_sheet_turnaround_hours",
    diagnosis:
      "Average turnaround from assigned to completed is above 48 hours. A 48+ hour turnaround means sheets are competing with other work instead of getting focused time — and long turnaround correlates with more review cycles (they go stale in the writer's head).",
    actionSteps: [
      {
        label: "Commit to next-day turnaround on every new assignment",
        description:
          "Any sheet assigned today should be done by end of tomorrow. No multi-day drift.",
        expectedOutcome:
          "Turnaround drops from [actual] to under 24 hours within a week",
        timeframe: "Starting today",
      },
      {
        label: "Work a sheet in a single sitting",
        description:
          "Don't start a sheet, stop, and come back 2 days later — you lose ~20 minutes of re-familiarization each time. Block 60-90 minutes and finish it.",
        expectedOutcome: "Fewer review cycles and faster turnaround",
        timeframe: "Start on next assignment",
      },
      {
        label: "Use the PHI auto-populate feature",
        description:
          "Click 'Auto-populate from records' on every new sheet — saves 20-30 minutes.",
        expectedOutcome: "Time per sheet cuts by a third",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Target turnaround is 24 hours, you're at [actual]. Turnaround and review cycles are correlated — the longer a sheet sits, the stalely it feels, the more rework it needs.",
      "Ask: 'When you get a sheet assigned, what do you do first?' — if the answer involves waiting, that's the habit fix.",
      "Demo auto-populate during the session.",
    ],
    trainingResources: [
      "PHI Playbook § 3 — Single-Sitting Discipline",
      "Video: Auto-populate Walkthrough (3 min)",
    ],
    commonRootCauses: [
      "Starting a sheet, switching context, returning hours or days later",
      "Not using auto-populate — starting from a blank template every time",
      "Over-researching records before writing — reading instead of drafting",
      "Treating PHI as fill-in between other work instead of focused deep work",
    ],
  },
  {
    role: "phi_sheet_writer",
    metricKey: "overdue_phi_sheet_count",
    diagnosis:
      "Overdue PHI sheets have crossed the 3-sheet warn threshold. Overdue sheets are hearings where prep is at risk — and the attorney team has to scramble or improvise.",
    actionSteps: [
      {
        label: "Pull the overdue list and commit dates",
        description:
          "Open /phi/overdue. For each sheet, commit a specific completion date to your supervisor. Write it in the sheet notes.",
        expectedOutcome: "Overdue list has a plan, not just a problem",
        timeframe: "Today",
      },
      {
        label: "Clear 2 overdue sheets per day until zero",
        description:
          "Commit to a specific per-day clear rate. Don't take new assignments until the overdue list is under 3.",
        expectedOutcome: "Overdue count hits zero within a week",
        timeframe: "Daily",
      },
      {
        label: "Flag sheets blocked by missing records",
        description:
          "If a sheet is overdue because medical records aren't in, mark it 'blocked: waiting on MR' and escalate to the MR team — don't just let the clock run.",
        expectedOutcome: "Blocked sheets get unblocked; others get finished",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "You have [actual] overdue sheets, target is under 3. This is an operational risk to upcoming hearings.",
      "Walk through the overdue list together live during the session — commit to specific dates for each one.",
      "If multiple sheets are blocked on MR, this is a process escalation, not a performance issue.",
    ],
    trainingResources: [
      "PHI Playbook § 4.1 — Overdue Recovery Playbook",
      "Video: Escalating Blocked Sheets (2 min)",
    ],
    commonRootCauses: [
      "Sheets missing a real due date and slipping silently",
      "Blocked on MR but not flagged as blocked — clock keeps running",
      "New assignments accepted while overdue list grows",
      "No daily overdue-check habit",
    ],
  },
  {
    role: "phi_sheet_writer",
    metricKey: "phi_review_cycle_count",
    diagnosis:
      "Average review cycles per sheet is above 2. Every extra review cycle costs the reviewer's time AND means the sheet is going out without things the attorney actually needs. This is a quality problem, not a speed problem.",
    actionSteps: [
      {
        label: "Review the last 5 sheets that needed multiple cycles",
        description:
          "Pull /phi filtered to 'review_cycles > 1'. Sit with the reviewer and read through what they flagged. Tag the feedback: missing section / wrong cite / unclear writing / typo.",
        expectedOutcome: "Clear picture of the top failure mode in your drafts",
        timeframe: "This week",
      },
      {
        label: "Run the PHI self-check before submitting",
        description:
          "Before clicking 'submit for review', run the self-check that lints for the 10 most common issues (missing sections, bad cites, passive voice). Takes 90 seconds, catches most 1-cycle issues.",
        expectedOutcome: "First-cycle acceptance rate climbs to 70%+",
        timeframe: "Every sheet starting today",
      },
      {
        label: "Pair on a sheet with the reviewer",
        description:
          "Schedule 90 minutes with the reviewer. Write a sheet together in real time, watching what they flag as you go. Imports their standards into your head.",
        expectedOutcome: "Aligned on what 'done' actually means",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Target is 1 review cycle, you're at [actual]. This is a quality gap, not a speed gap.",
      "Pull up the last 5 multi-cycle sheets during the session — don't guess at the failure mode, read the feedback.",
      "A pair-writing session with the reviewer is the single biggest lever here.",
    ],
    trainingResources: [
      "PHI Playbook § 5 — Quality Standards",
      "PHI self-check guide",
      "Sample approved sheets library at /phi/examples",
    ],
    commonRootCauses: [
      "Not running the self-check before submitting",
      "Unclear on reviewer standards — writing to personal taste, not to spec",
      "Missing sections from the template (rushing to submit)",
      "Reviewer and writer have never paired — standards drift",
    ],
  },

  // ------------------------------------------------------------------
  // attorney
  // ------------------------------------------------------------------
  {
    role: "attorney",
    metricKey: "hearings_this_week",
    diagnosis:
      "Hearings scheduled this week are below the 2-hearing warn threshold. This is almost never a performance issue — it's usually a scheduling or routing problem. Attorneys cannot schedule their own hearings; the firm must.",
    actionSteps: [
      {
        label: "Audit hearing assignment routing",
        description:
          "Check /admin/hearing-rotation. Are you in the active rotation? Are you flagged unavailable for any reason? Are you getting the share you expected?",
        expectedOutcome: "Clear answer on whether routing is fair",
        timeframe: "This week",
      },
      {
        label: "Volunteer for upcoming unassigned hearings",
        description:
          "Open /hearings?unassigned. Pick 3-5 in the next 30 days and claim them. Send the scheduler a note confirming.",
        expectedOutcome: "Hearing count for next week climbs to target",
        timeframe: "Today",
      },
      {
        label: "Confirm availability signals are correct",
        description:
          "Check /calendar/availability. Make sure you're not accidentally blocked off for the week. Common cause: an old PTO that never got removed.",
        expectedOutcome: "Availability signals match your actual capacity",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Hearings this week are [actual], expected is 5. This is usually routing, not output.",
      "Ask: 'Do you feel you're getting a fair share of hearings?' and then actually check the data together.",
      "If there's a stale PTO or a rotation bug, it's a 5-minute fix.",
    ],
    trainingResources: [
      "Attorney Handbook § 1 — Hearing Rotation & Scheduling",
      "Admin guide: /admin/hearing-rotation",
    ],
    commonRootCauses: [
      "Stale PTO or unavailability flag never removed",
      "Rotation weighting misconfigured",
      "Attorney not self-advocating — sitting quietly when routing is uneven",
      "Scheduler defaulting to a few trusted attorneys",
    ],
  },
  {
    role: "attorney",
    metricKey: "win_rate",
    diagnosis:
      "Hearing win rate is below the 45% warn threshold. Win rate below 45% is usually traceable to specific hearing-prep gaps (PHI, records, testimony prep) — not innate ability.",
    actionSteps: [
      {
        label: "Case-review the last 5 losses with a peer attorney",
        description:
          "Pull the last 5 unfavorable decisions. Read the ALJ's reasoning with a peer attorney and tag: 'credibility problem' / 'RFC mismatch' / 'missing evidence' / 'bad testimony'.",
        expectedOutcome: "Pattern on the top 1-2 failure modes",
        timeframe: "This week",
      },
      {
        label: "Schedule a prep audit for the next 5 hearings",
        description:
          "For the next 5 upcoming hearings, sit with the prep team 3 days before each one and stress-test the record. What's weak? What could the ALJ attack?",
        expectedOutcome: "Walk in prepared, not hoping",
        timeframe: "Starting next week",
      },
      {
        label: "Practice opening statements with a peer",
        description:
          "Record yourself giving the opening for one upcoming hearing. Share with a peer attorney for feedback. The opening shapes the ALJ's view of the case.",
        expectedOutcome: "Stronger opens, higher favorable rate",
        timeframe: "Before next hearing",
      },
      {
        label: "Request mentor shadowing from a top-winning attorney",
        description:
          "Ask a top-winning peer if you can sit in on one of their hearings. Observe exactly how they question the claimant and cross-examine the VE.",
        expectedOutcome: "Import 2-3 specific techniques",
        timeframe: "Next 2 weeks",
      },
    ],
    coachingTalkingPoints: [
      "Win rate is [actual]%, target is 60%. This is a sensitive conversation — lead with 'we're going to figure this out together'.",
      "Pull up the last 5 unfavorable decisions live and read the ALJ's reasoning out loud.",
      "The pattern in losses is the coaching target — don't talk generally about win rate.",
      "Mentor-shadowing is the single highest-leverage intervention. Commit to one shadow session.",
    ],
    trainingResources: [
      "Attorney Handbook § 3 — Hearing Prep Checklist",
      "Video: Cross-examining a VE (30 min)",
      "Winning openings library (internal)",
      "Peer shadow with top-winning attorney",
    ],
    commonRootCauses: [
      "Walking into hearings without a prep audit 3 days out",
      "Weak opening statements — not framing the case for the ALJ",
      "Not challenging VE hypotheticals effectively",
      "Incomplete medical records at hearing time (MR team upstream issue)",
    ],
  },
  {
    role: "attorney",
    metricKey: "prep_completion_rate",
    diagnosis:
      "Share of hearings fully prepped 3+ days prior is below 80%. Late prep is the #1 cause of avoidable losses — when prep happens the night before, the attorney can't address gaps.",
    actionSteps: [
      {
        label: "Schedule prep sessions 5 days out, not 3",
        description:
          "For every hearing on your calendar, add a 90-minute prep block at 5 days out. That gives 2 days of buffer to fix anything the prep surfaces.",
        expectedOutcome: "100% of hearings prepped with buffer",
        timeframe: "Today",
      },
      {
        label: "Confirm prep materials at 5 days out",
        description:
          "Open each hearing in /hearings and verify: PHI sheet done, MR complete, brief drafted, client prep scheduled. Anything missing = escalation.",
        expectedOutcome: "Gaps surface in time to fix",
        timeframe: "Every hearing, starting now",
      },
      {
        label: "Hand off prep to a prep attorney when overloaded",
        description:
          "If you have 5+ hearings in a week, assign prep on 2 of them to a junior prep attorney. Focus your energy on the harder cases.",
        expectedOutcome: "Prep quality holds even at high hearing volume",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Prep completion rate is [actual]%, target is 95%. Late prep correlates directly with avoidable losses.",
      "Ask: 'When do you typically start prepping a hearing?' — if the answer is 'day before' or 'day of', that's the fix.",
      "Commit to 5-day-out prep block on the next hearing as the experiment.",
    ],
    trainingResources: [
      "Attorney Handbook § 3.2 — Hearing Prep Timeline",
      "Video: 5-Day-Out Prep Ritual (walkthrough, 10 min)",
    ],
    commonRootCauses: [
      "Prep is reactive — only happens when the hearing is imminent",
      "No scheduled prep block in the calendar, relying on 'I'll get to it'",
      "Attorney overloaded — needs prep handoff to junior",
      "Upstream PHI/MR gaps not surfacing until day-of",
    ],
  },
  {
    role: "attorney",
    metricKey: "avg_case_age_days",
    diagnosis:
      "Average case age across active cases is above 365 days. Old cases aren't always a performance problem — but they are a client-experience and cash-flow problem. Every old case should have a reason it's still open.",
    actionSteps: [
      {
        label: "Pull all cases >18 months old",
        description:
          "Open /cases?assigned=me&age>540. Read through every one. Is it genuinely stuck in SSA backlog, or is there something on our side?",
        expectedOutcome: "Clear picture of avoidable vs. unavoidable old cases",
        timeframe: "This week",
      },
      {
        label: "Close out the closeable ones",
        description:
          "For any old case that is resolved but still open in the system, close it out. Good hygiene makes the metric meaningful.",
        expectedOutcome: "Case age drops by cleanup alone",
        timeframe: "This week",
      },
      {
        label: "Set a monthly stale-case review",
        description:
          "First Monday of each month, review cases older than 12 months. For each, either take action or write a 1-sentence 'waiting on X until Y' note.",
        expectedOutcome: "No case goes silent for a full month",
        timeframe: "Monthly recurring",
      },
    ],
    coachingTalkingPoints: [
      "Average case age is [actual] days, target is under 180. Most of this is SSA backlog, but we need to separate 'unavoidable' from 'our fault'.",
      "This is usually a hygiene problem — closed cases still open in the system inflate the number.",
      "The monthly review is the mechanical fix. Put it on the calendar.",
    ],
    trainingResources: [
      "Attorney Handbook § 6 — Case Lifecycle Management",
      "Dashboard: stale case audit",
    ],
    commonRootCauses: [
      "Closed cases not marked closed in the system",
      "Genuinely stuck in SSA backlog (not coachable)",
      "No monthly stale-case review — old cases invisible",
      "Appeals in-flight that should be tracked separately",
    ],
  },
  {
    role: "attorney",
    metricKey: "client_nps",
    diagnosis:
      "Client NPS across closed cases is below 30. Client satisfaction is usually about communication, not outcomes — clients with losses can still give high NPS if they felt heard, and clients with wins can give low NPS if they felt ignored.",
    actionSteps: [
      {
        label: "Review the last 5 low-NPS comments",
        description:
          "Pull /clients/nps filtered to score ≤6 from the last 30 days. Read every comment. Tag: 'communication' / 'outcome' / 'billing' / 'preparation'.",
        expectedOutcome: "Clear picture of the top driver of dissatisfaction",
        timeframe: "This week",
      },
      {
        label: "Schedule a monthly client check-in on every active case",
        description:
          "First Tuesday of each month, send a 1-paragraph status update to every active client. Doesn't have to be long — has to exist.",
        expectedOutcome:
          "Clients feel informed; 'you never told me anything' complaints drop",
        timeframe: "Monthly starting next Tuesday",
      },
      {
        label: "Personal call on every unfavorable decision",
        description:
          "When a case is lost, call the client personally within 24 hours. Don't send a letter, don't delegate to CM. A personal call on a loss is the #1 NPS-preserving action.",
        expectedOutcome: "Losing clients don't become bad NPS scores",
        timeframe: "Starting next loss",
      },
    ],
    coachingTalkingPoints: [
      "NPS is [actual], target is 50. Losses don't kill NPS; silence does.",
      "Pull up the last 5 low-score comments together during the session. Read them out loud.",
      "The monthly-update habit is the biggest single NPS mover. Commit to it.",
    ],
    trainingResources: [
      "Attorney Handbook § 7 — Client Communication Cadence",
      "Video: Delivering a Loss with Grace (12 min)",
    ],
    commonRootCauses: [
      "No regular client communication between major case events",
      "Losses delivered by letter, not by personal call",
      "Client doesn't know what's happening on the case for months at a time",
      "Billing surprises — fees explained at the end instead of upfront",
    ],
  },

  // ------------------------------------------------------------------
  // hearing_advocate
  // ------------------------------------------------------------------
  {
    role: "hearing_advocate",
    metricKey: "hearings_represented_per_week",
    diagnosis:
      "Hearings represented per week is below the 6-hearing warn threshold. Advocate throughput is usually a routing / scheduling issue, not a performance one — advocates cannot schedule their own hearings.",
    actionSteps: [
      {
        label: "Check the hearing assignment rotation",
        description:
          "Open /admin/advocate-rotation. Confirm you're active, not flagged unavailable, and in the same weight class as peers.",
        expectedOutcome: "Clear answer on whether routing is the cause",
        timeframe: "Today",
      },
      {
        label: "Volunteer for next week's unassigned hearings",
        description:
          "Open /hearings?unassigned&next=7d. Claim 3-5 to get to target count.",
        expectedOutcome: "Next week's count hits target",
        timeframe: "Today",
      },
      {
        label: "Ask the scheduler for 10 hearings / week capacity",
        description:
          "Send the scheduler a direct message: 'I have capacity for 10 hearings / week, please route accordingly.' Most advocates don't self-advocate.",
        expectedOutcome: "Routing pipeline becomes explicit",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Hearings this week are [actual], target is 10. This is usually routing, not effort.",
      "Pull up /admin/advocate-rotation together during the session.",
      "Self-advocacy is expected — we can't guess capacity.",
    ],
    trainingResources: ["Advocate Handbook § 1 — Rotation & Scheduling"],
    commonRootCauses: [
      "Stale unavailability flag on the rotation",
      "Not self-advocating for a share of the week's hearings",
      "Scheduler defaulting to known advocates",
    ],
  },
  {
    role: "hearing_advocate",
    metricKey: "win_rate",
    diagnosis:
      "Win rate is below 45%. Advocate wins are almost always determined by prep quality and cross-exam skill — not luck. This is coachable.",
    actionSteps: [
      {
        label: "Review the last 5 losses with a supervising attorney",
        description:
          "Pull the last 5 unfavorable outcomes. Read the ALJ reasoning together and tag the failure mode.",
        expectedOutcome: "Pattern on top 1-2 failure modes",
        timeframe: "This week",
      },
      {
        label: "Schedule a mock hearing session",
        description:
          "Pick an upcoming hearing. Run a 45-minute mock with a peer playing ALJ and claimant. Full opening, claimant direct, VE cross.",
        expectedOutcome: "Real reps before the real hearing",
        timeframe: "Within 5 business days",
      },
      {
        label: "Shadow a top-winning advocate",
        description:
          "Sit in on one hearing by a top-winning advocate. Observe cross-exam technique and objection handling.",
        expectedOutcome: "Import 2-3 specific techniques",
        timeframe: "Next 2 weeks",
      },
      {
        label: "Re-read the VE hypothetical playbook",
        description:
          "The #1 lost-hearing pattern is blown VE hypotheticals. Re-read § 4 of the Advocate Handbook and practice one hypothetical out loud.",
        expectedOutcome: "Sharper VE cross on the next hearing",
        timeframe: "Before next hearing",
      },
    ],
    coachingTalkingPoints: [
      "Win rate is [actual]%, target is 60%. This is coachable — let's pull up the last 5 losses and see what they have in common.",
      "Read the ALJ's reasoning in each loss together. The pattern is the coaching target.",
      "Commit to one mock hearing session before next week's docket.",
    ],
    trainingResources: [
      "Advocate Handbook § 4 — VE Hypotheticals",
      "Advocate Handbook § 5 — Cross-Examination Technique",
      "Shadow a top-winning advocate (supervisor to schedule)",
    ],
    commonRootCauses: [
      "Weak VE hypothetical cross — not challenging jobs cited",
      "Leading the claimant during direct (harms credibility)",
      "Walking in under-prepped because PHI / brief is late",
      "Not raising available objections",
    ],
  },
  {
    role: "hearing_advocate",
    metricKey: "avg_transcript_qc_score",
    diagnosis:
      "Average call transcript QC score is below 70. This reflects how the advocate handles the call structurally — opening, questioning, objections, closing — independent of outcome. It is always coachable.",
    actionSteps: [
      {
        label: "Review your last 3 QC'd transcripts with a supervisor",
        description:
          "Open /qc/transcripts?me. Read the QC feedback on your last 3 scored calls. Tag: 'opening' / 'direct' / 'cross' / 'objections' / 'closing'.",
        expectedOutcome: "Clear picture of where you're losing points",
        timeframe: "This week",
      },
      {
        label: "Pick a top-scoring transcript and read it end-to-end",
        description:
          "Find a peer transcript with a 90+ QC score. Read it. See how the pro structures each phase.",
        expectedOutcome: "Imported template for high-scoring calls",
        timeframe: "This week",
      },
      {
        label: "Re-do one past hearing as a written exercise",
        description:
          "Pick a transcript where you scored low. Rewrite your cross-exam section as you'd do it today. Share with supervisor for feedback.",
        expectedOutcome: "Muscle memory for the corrected pattern",
        timeframe: "Next 2 weeks",
      },
    ],
    coachingTalkingPoints: [
      "QC score is [actual], target is 85. This is always structural, not talent.",
      "Read a high-scoring peer transcript together during the session. Show, don't tell.",
      "The rewrite exercise is the single best intervention.",
    ],
    trainingResources: [
      "Advocate Handbook § 6 — Hearing Structure Scorecard",
      "Exemplar transcript library (internal)",
    ],
    commonRootCauses: [
      "Unstructured opening — no roadmap for the ALJ",
      "Leading questions on direct",
      "Missed objections",
      "Closing without a clear 'therefore' statement",
    ],
  },
  {
    role: "hearing_advocate",
    metricKey: "prep_completion_rate",
    diagnosis:
      "Hearings with full prep (PHI + MR + brief) on time are below 80%. Late prep is the leading cause of low transcript QC scores and losses.",
    actionSteps: [
      {
        label: "Pull prep status for the next 5 hearings",
        description:
          "Open /hearings?me&next=14d. For each, confirm PHI, MR, and brief status. Anything incomplete at 5 days out = immediate escalation.",
        expectedOutcome: "Gaps visible in time to fix",
        timeframe: "Today",
      },
      {
        label: "Confirm prep 5 days out on every hearing",
        description:
          "Calendar-block every hearing with a 30-minute 'prep confirmation' block 5 days before.",
        expectedOutcome: "No hearings prepped late",
        timeframe: "Today",
      },
      {
        label: "Escalate blocked prep to supervisor within 48 hours",
        description:
          "If PHI / MR / brief is not in by 5 days out, escalate to supervisor. Don't absorb other teams' delays silently.",
        expectedOutcome: "Blocked prep becomes visible, not invisible",
        timeframe: "Start today",
      },
    ],
    coachingTalkingPoints: [
      "Prep completion is [actual]%, target is 95%. Late prep drives losses.",
      "Pull up next 2 weeks of hearings and check prep status live.",
      "Commit to 5-day-out confirmation on every upcoming hearing.",
    ],
    trainingResources: ["Advocate Handbook § 3 — Prep Timeline"],
    commonRootCauses: [
      "No scheduled prep-confirmation block on the calendar",
      "Upstream PHI / MR delays not surfaced to supervisor",
      "Prep happening day-of instead of days before",
    ],
  },

  // ------------------------------------------------------------------
  // fee_collection
  // ------------------------------------------------------------------
  {
    role: "fee_collection",
    metricKey: "fee_petition_filing_days",
    diagnosis:
      "Average days from favorable decision to fee petition filed is above 21 days. Every day of delay is a day of delayed collection — and the SSA fee petition clock is real, with consequences if missed.",
    actionSteps: [
      {
        label: "File the fee petition within 5 business days of every win",
        description:
          "Set an alert on /cases?status=favorable-decision. Every new win triggers a fee petition within 5 business days. No exceptions.",
        expectedOutcome: "Average filing days drops from [actual] to under 7",
        timeframe: "Starting on the next win",
      },
      {
        label: "Clear the backlog of unfiled petitions",
        description:
          "Open /fees?status=unfiled. Every petition older than 7 days gets worked today. Block 2-3 hours if needed.",
        expectedOutcome: "Unfiled backlog drops to zero",
        timeframe: "This week",
      },
      {
        label: "Use the fee-petition template library",
        description:
          "Click 'Use template' on the petition form. Pre-filled for the 3 most common scenarios. Saves ~20 minutes per petition.",
        expectedOutcome: "Time per petition drops from 45 to 20 minutes",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Filing days are [actual], target is 7. Every delay is delayed cash for the firm and delayed back-pay for the client.",
      "Demo the template library during the session.",
      "Ask: 'When do you start the petition after a win?' — if the answer is 'when I get to it', that's the fix.",
    ],
    trainingResources: [
      "Fee Collection Playbook § 1 — Post-Win Workflow",
      "Video: Fee Petition Template Library (3 min)",
    ],
    commonRootCauses: [
      "No alert on new favorable decisions — petitions started reactively",
      "Not using templates — re-typing each petition from scratch",
      "Petitions batched at end-of-month instead of run as they land",
      "Waiting for the client letter before filing — not necessary",
    ],
  },
  {
    role: "fee_collection",
    metricKey: "fee_collection_rate",
    diagnosis:
      "Share of awarded fees collected within 90 days is below 85%. Uncollected fees are the single biggest cash-flow risk in the firm — each unpaid fee is revenue we've earned but don't have.",
    actionSteps: [
      {
        label: "Pull the 90-day unpaid list",
        description:
          "Open /fees?status=unpaid&age>90. Every line is a collections conversation waiting to happen.",
        expectedOutcome: "Clear picture of real collection gap",
        timeframe: "Today",
      },
      {
        label: "Run a 14-day collection cadence on every open fee",
        description:
          "For each unpaid fee, schedule: day 0 letter, day 14 call, day 30 letter, day 45 supervisor escalation. Put it in /fees as an automation.",
        expectedOutcome: "Collection rate climbs to 90%+ within a quarter",
        timeframe: "Today",
      },
      {
        label: "Personal call on every fee >60 days overdue",
        description:
          "No more letters after 60 days. Pick up the phone and call the client personally. Most fees are psychological, not financial.",
        expectedOutcome: "60+ day collection rate climbs sharply",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Collection rate is [actual]%, target is 95%. We've earned this money; we need to actually collect it.",
      "Pull up the unpaid list live during the session. Commit to a specific reduction by next Friday.",
      "Demo the 14-day automation during the session.",
    ],
    trainingResources: [
      "Fee Collection Playbook § 3 — Collection Cadence",
      "Video: Phone Collection Script (8 min)",
    ],
    commonRootCauses: [
      "Letter-only collection strategy — no phone escalation",
      "No automated cadence — collections happen reactively",
      "60+ day fees never get a personal call",
      "No supervisor escalation path for hard cases",
    ],
  },
  {
    role: "fee_collection",
    metricKey: "delinquent_fee_followup_compliance",
    diagnosis:
      "Share of unpaid fees with a follow-up logged this week is below 85%. The target is 100% because unpaid fees without follow-up become written-off fees.",
    actionSteps: [
      {
        label: "Clear the follow-up queue today",
        description:
          "Open /fees/followups?overdue=true. Every overdue follow-up gets done today — letter, call, or system note.",
        expectedOutcome: "Overdue queue hits zero",
        timeframe: "Today",
      },
      {
        label: "Enable the daily fee-followup digest",
        description:
          "/settings/notifications → enable 'Fee follow-ups due' daily digest. Arrives at 9am with that day's list.",
        expectedOutcome: "Follow-ups become first-thing habit",
        timeframe: "Today",
      },
      {
        label: "Block Tuesday + Thursday afternoons for collections",
        description:
          "Recurring calendar blocks. Tuesday 2-4pm and Thursday 2-4pm = collections time. Nothing else.",
        expectedOutcome: "100% follow-up compliance",
        timeframe: "Starting this week",
      },
    ],
    coachingTalkingPoints: [
      "Follow-up compliance is [actual]%, target is 100%. There is no acceptable 'skipped' fee.",
      "Demo the daily digest during the session.",
      "Commit to Tuesday + Thursday blocks on the calendar.",
    ],
    trainingResources: ["Fee Collection Playbook § 4 — Follow-up Discipline"],
    commonRootCauses: [
      "No daily digest — relying on memory",
      "No scheduled collection time — happens between other work",
      "Skipping the hard follow-ups",
      "Closing follow-ups without actually following up (gaming the metric)",
    ],
  },

  // ------------------------------------------------------------------
  // appeals_council
  // ------------------------------------------------------------------
  {
    role: "appeals_council",
    metricKey: "ac_briefs_submitted_per_week",
    diagnosis:
      "AC briefs submitted per week is below the 5/week warn threshold. Under-submission means we're missing 60-day appeal windows — every missed window is a case that can't be appealed, period.",
    actionSteps: [
      {
        label: "Audit the 60-day window list",
        description:
          "Open /appeals?status=unfiled&window<60d. Every case here has a real deadline. Work them oldest-first.",
        expectedOutcome: "Zero cases in the <60d window go unfiled",
        timeframe: "Today",
      },
      {
        label: "Block 2 mornings per week for AC brief writing",
        description:
          "Tuesday 9-12 and Thursday 9-12 — calendar-blocked, no meetings, deep-work time. Target: 2 briefs per session.",
        expectedOutcome: "4 briefs per week minimum",
        timeframe: "Starting Monday",
      },
      {
        label: "Use the AC brief template library",
        description:
          "Open /appeals/templates. Pre-built structures for the 5 most common error types (substantial evidence, legal error, new evidence, etc).",
        expectedOutcome: "Time per brief cuts from ~4 hours to ~2",
        timeframe: "Next brief",
      },
    ],
    coachingTalkingPoints: [
      "Briefs per week is [actual], target is 8. Every missed brief is a client who loses their appeal right.",
      "Demo the template library during the session.",
      "Commit to two calendar-blocked deep-work mornings per week.",
    ],
    trainingResources: [
      "Appeals Playbook § 1 — AC Brief Workflow",
      "Video: Using the Template Library (4 min)",
    ],
    commonRootCauses: [
      "Briefs happen between other tasks — no deep-work block",
      "Not using templates — writing from scratch",
      "60-day deadline not surfaced clearly — aging cases go quiet",
    ],
  },
  {
    role: "appeals_council",
    metricKey: "ac_briefs_on_time_rate",
    diagnosis:
      "Share of AC briefs filed before the 65-day deadline is below 95%. Missing the 65-day window is malpractice-grade — the appeal right is lost forever.",
    actionSteps: [
      {
        label: "Build a red-zone alert",
        description:
          "/settings/alerts → add 'AC brief deadline <10 days' as a daily push + email. Red zone is non-negotiable.",
        expectedOutcome: "No brief ever enters the <10d zone without attention",
        timeframe: "Today",
      },
      {
        label: "Clear the red zone today",
        description:
          "Open /appeals?window<10d. Work every one before anything else.",
        expectedOutcome: "No red-zone brief left unfiled at EOD",
        timeframe: "Today",
      },
      {
        label: "Set a weekly deadline review",
        description:
          "Every Monday 9am, open /appeals?window<30d. Plan the week around them.",
        expectedOutcome: "Deadlines visible early, not at the last minute",
        timeframe: "Weekly recurring",
      },
    ],
    coachingTalkingPoints: [
      "On-time rate is [actual]%, target is 100%. This is a bar-complaint-grade metric.",
      "Walk through the red-zone alert setup live during the session.",
      "Commit to a Monday 9am deadline review as a non-negotiable ritual.",
    ],
    trainingResources: [
      "Appeals Playbook § 2 — Deadline Management",
      "Alert setup guide",
    ],
    commonRootCauses: [
      "No deadline alerts — deadlines discovered too late",
      "Red-zone cases treated as normal queue items",
      "No Monday-morning planning ritual",
    ],
  },
  {
    role: "appeals_council",
    metricKey: "ac_grant_rate",
    diagnosis:
      "AC remand/grant rate is below 15%. Most AC submissions are denied — but at <15% we're likely filing formulaic briefs instead of identifying real legal errors.",
    actionSteps: [
      {
        label: "Review the last 5 denied AC decisions",
        description:
          "Read the AC's denial reasoning on 5 recent submissions. Tag: 'no legal error identified' / 'error waived' / 'insufficient record cite' / 'frivolous'.",
        expectedOutcome: "Pattern on what AC actually wants to see",
        timeframe: "This week",
      },
      {
        label: "Pair with a senior brief writer on 2 upcoming briefs",
        description:
          "Sit with [senior AC writer] for 2 briefs. Watch how they identify legal error and craft the argument.",
        expectedOutcome: "Imported technique for next solo brief",
        timeframe: "Next 2 weeks",
      },
      {
        label: "Re-read the AC's own criteria for granting review",
        description:
          "Read HALLEX I-3-0-1. Know what AC reviews for, write directly to those criteria.",
        expectedOutcome: "Briefs target the right audience",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Grant rate is [actual]%, target is 25%. This is a skill problem, not an output problem.",
      "Read denied decisions together during the session. Don't guess at what AC wants.",
      "Pair writing is the single biggest skill lever.",
    ],
    trainingResources: [
      "Appeals Playbook § 3 — Identifying Legal Error",
      "HALLEX I-3-0-1 study guide",
    ],
    commonRootCauses: [
      "Formulaic briefs that don't identify specific legal error",
      "Not citing the record specifically enough",
      "Missing the 'new and material evidence' hook when available",
      "Not pairing with seniors — working in a skill bubble",
    ],
  },

  // ------------------------------------------------------------------
  // pre_hearing_prep
  // ------------------------------------------------------------------
  {
    role: "pre_hearing_prep",
    metricKey: "prehearing_briefs_drafted_per_week",
    diagnosis:
      "Pre-hearing briefs drafted per week is below the 8/week warn threshold. Every brief short is a hearing where the attorney walks in without a theory of the case.",
    actionSteps: [
      {
        label: "Block 2 brief-writing mornings per week",
        description:
          "Tuesday 9-12 and Thursday 9-12 as deep-work time. Target: 3 briefs per session.",
        expectedOutcome: "6 briefs per week minimum",
        timeframe: "Starting Monday",
      },
      {
        label: "Use the brief template library",
        description:
          "Open /prep/templates. Pick by case type. Pre-filled with structure, key-cite slots, and theory-of-case framing.",
        expectedOutcome: "Time per brief drops from ~3 hours to ~90 minutes",
        timeframe: "Next brief",
      },
      {
        label: "Auto-populate from PHI sheets",
        description:
          "Click 'Import PHI summary' in the brief tool. Pulls medical timeline, RFC limits, and provider list automatically.",
        expectedOutcome: "Saves 30 minutes per brief",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Briefs per week is [actual], target is 12. Every missing brief is a hearing the attorney walks into improvising.",
      "Demo templates + auto-populate live during the session.",
      "Commit to two calendar-blocked brief mornings per week.",
    ],
    trainingResources: [
      "Prep Playbook § 1 — Brief Writing Workflow",
      "Video: Templates + Auto-populate (5 min)",
    ],
    commonRootCauses: [
      "No deep-work block for brief writing",
      "Writing each brief from scratch without templates",
      "Not using auto-populate from PHI",
      "Brief writing treated as fill-in work between other tasks",
    ],
  },
  {
    role: "pre_hearing_prep",
    metricKey: "brief_on_time_rate",
    diagnosis:
      "Share of briefs delivered 3+ days before hearing is below 90%. Late briefs leave the attorney no time to digest and adjust. A brief the night before is worse than no brief, because it creates false confidence.",
    actionSteps: [
      {
        label: "Target delivery at 5 days out, not 3",
        description:
          "Every brief should be in the attorney's hands 5 days before hearing. 3 days is the floor, not the goal.",
        expectedOutcome: "Attorneys prep with real time, not in panic",
        timeframe: "Starting next brief",
      },
      {
        label: "Weekly hearing-docket review",
        description:
          "Every Monday 9am, review /hearings?next=14d. Every hearing needs a brief due date assigned.",
        expectedOutcome: "Briefs show up in the writer's queue 10+ days out",
        timeframe: "Weekly recurring",
      },
      {
        label: "Escalate blocked briefs within 48 hours",
        description:
          "If a brief is blocked on PHI or MR, escalate to supervisor within 48 hours. Don't absorb upstream delays.",
        expectedOutcome: "Blocked briefs get unblocked",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "On-time rate is [actual]%, target is 98%. Late briefs don't help anyone.",
      "Ask: 'When do you start working a brief?' — if it's less than a week out, that's the fix.",
      "Monday docket review is the mechanical fix. Commit to it.",
    ],
    trainingResources: ["Prep Playbook § 2 — Brief Timeline"],
    commonRootCauses: [
      "No Monday docket review — briefs discovered late",
      "Writing reactively — starting the brief 2-3 days before the hearing",
      "Not escalating when blocked",
      "Over-polishing — spending 4 hours on a brief that needed 90 minutes",
    ],
  },
  {
    role: "pre_hearing_prep",
    metricKey: "evidence_incorporation_rate",
    diagnosis:
      "Share of briefs incorporating all available medical evidence is below 80%. Missing evidence in the brief means missing evidence in the hearing — the attorney argues from what's in the brief, not from memory.",
    actionSteps: [
      {
        label: "Run the evidence-completeness check on every brief",
        description:
          "Before submitting, click 'Check evidence coverage'. Flags any record in the case file not cited in the brief.",
        expectedOutcome: "100% evidence incorporation rate",
        timeframe: "Every brief starting today",
      },
      {
        label: "Review the last 5 briefs that missed evidence",
        description:
          "Pull /prep?missing_evidence>0 from the last 30 days. Read what was missed. Tag: 'missed MR' / 'missed RFC' / 'missed testimony'.",
        expectedOutcome: "Clear pattern on what gets missed",
        timeframe: "This week",
      },
      {
        label: "Pair with a senior prep writer on 2 briefs",
        description:
          "Watch how a senior identifies and incorporates evidence. Import their read-then-cite workflow.",
        expectedOutcome: "Better evidence discipline",
        timeframe: "Next 2 weeks",
      },
    ],
    coachingTalkingPoints: [
      "Incorporation rate is [actual]%, target is 95%. A cite that's not in the brief is a cite that's not in the hearing.",
      "Demo the evidence-completeness check live during the session.",
      "Pair-writing is the single biggest skill lever.",
    ],
    trainingResources: [
      "Prep Playbook § 3 — Evidence Discipline",
      "Video: Evidence Completeness Check (2 min)",
    ],
    commonRootCauses: [
      "Not running the evidence-completeness check",
      "Not reading every record before writing — skimming",
      "Cherry-picking favorable evidence and ignoring unfavorable",
      "Missing late-added records that landed after the first pass",
    ],
  },

  // ------------------------------------------------------------------
  // post_hearing
  // ------------------------------------------------------------------
  {
    role: "post_hearing",
    metricKey: "post_hearing_processing_days",
    diagnosis:
      "Average days from hearing outcome to complete post-hearing processing is above 7. Delays here mean clients don't know the result, fee petitions don't start, and benefits don't flow.",
    actionSteps: [
      {
        label: "Process every hearing outcome within 48 hours",
        description:
          "Open /hearings?processed=false daily. Every hearing gets its outcome logged and client notified within 48 hours.",
        expectedOutcome: "Processing days drops from [actual] to under 3",
        timeframe: "Starting today",
      },
      {
        label: "Use the post-hearing workflow checklist",
        description:
          "Click 'Start post-hearing' on each case. The 7-step checklist (outcome log, client call, next-steps letter, fee team handoff, MR team handoff, case stage update, file close) prevents missed steps.",
        expectedOutcome: "No missed steps; consistent processing",
        timeframe: "Every case starting today",
      },
      {
        label: "Block 1 hour each morning for post-hearing work",
        description:
          "9:00-10:00 daily is post-hearing time. Close nothing else until yesterday's hearings are processed.",
        expectedOutcome: "Processing stays under 3 days reliably",
        timeframe: "Daily starting Monday",
      },
    ],
    coachingTalkingPoints: [
      "Processing days are [actual], target is 3. Every day of delay is a client wondering what happened.",
      "Demo the checklist during the session.",
      "Commit to the 9-10am daily block.",
    ],
    trainingResources: [
      "Post-Hearing Playbook § 1 — Processing Workflow",
      "Video: The 7-Step Checklist (4 min)",
    ],
    commonRootCauses: [
      "Not using the checklist — skipping steps and having to come back",
      "No daily time block — happens between other work",
      "Waiting for the ALJ's written decision to start — the client call can happen on the verbal outcome",
    ],
  },
  {
    role: "post_hearing",
    metricKey: "client_notification_compliance",
    diagnosis:
      "Share of hearings with client notification logged within 48 hours is below 90%. The target is 100% because the client call is the single most important post-hearing action — and it's easy to skip in the chaos.",
    actionSteps: [
      {
        label: "Personal call, not letter, on every outcome",
        description:
          "Every hearing outcome — win or loss — gets a personal call within 48 hours. No exceptions, no delegation to letter.",
        expectedOutcome: "100% client notification rate",
        timeframe: "Starting today",
      },
      {
        label: "Enable the 'hearing outcome → notify client' reminder",
        description:
          "/settings/notifications → enable 'Hearing concluded, client not yet notified'. Fires at 24 hours post-hearing if no call logged.",
        expectedOutcome: "Reminder fires before the 48-hour deadline",
        timeframe: "Today",
      },
      {
        label: "Script the loss call with a supervisor",
        description:
          "Losing calls are hard and get avoided. Script yours with a supervisor and practice once. The hardest call becomes routine.",
        expectedOutcome: "Losses get called, not letter'd",
        timeframe: "This week",
      },
    ],
    coachingTalkingPoints: [
      "Notification compliance is [actual]%, target is 100%. The client call is sacred.",
      "Ask: 'Which calls do you skip?' Usually it's losses — that's the hardest one to coach but also the most important.",
      "Script the loss call together live during the session.",
    ],
    trainingResources: [
      "Post-Hearing Playbook § 2 — Client Call Script",
      "Video: Delivering a Loss (12 min)",
    ],
    commonRootCauses: [
      "Avoiding the hard calls (losses) — letter as default",
      "No reminder fired — relying on memory",
      "Delegating the call to case manager — doesn't count as supervisor notification",
      "Not logging the call in /cases — happened but not tracked",
    ],
  },

  // ------------------------------------------------------------------
  // mail_clerk
  // ------------------------------------------------------------------
  {
    role: "mail_clerk",
    metricKey: "mail_items_processed_per_day",
    diagnosis:
      "Mail items processed per day is below the 40-item warn threshold. Mail delays cascade into everything — a medical record that sits in the mail room for 3 days is a hearing that might not be ready.",
    actionSteps: [
      {
        label: "Clear the mail room top-down every morning",
        description:
          "9:00am daily — open the mail room queue (/mail) and work oldest-first until the queue is under 10 items. Then move on to other work.",
        expectedOutcome: "Queue starts every day near zero",
        timeframe: "Daily habit",
      },
      {
        label: "Use the bulk-scan + auto-categorize feature",
        description:
          "Instead of scanning items one-at-a-time, use /mail/bulk-scan. Auto-categorizes by sender and routes automatically to the right case.",
        expectedOutcome: "Throughput climbs 50%+",
        timeframe: "Start on the next batch",
      },
      {
        label: "Block the 9-11am slot for mail processing",
        description:
          "Calendar-block 9:00-11:00 as 'mail processing deep work'. Nothing else during that window.",
        expectedOutcome: "60 items per day consistently",
        timeframe: "Starting Monday",
      },
    ],
    coachingTalkingPoints: [
      "Items per day is [actual], target is 60. Mail delays cascade into hearings.",
      "Demo bulk-scan live during the session.",
      "Commit to the 9-11am calendar block.",
    ],
    trainingResources: [
      "Mail Room Playbook § 1 — Daily Workflow",
      "Video: Bulk-scan Walkthrough (3 min)",
    ],
    commonRootCauses: [
      "Scanning items one-at-a-time instead of bulk",
      "No morning block — mail worked between other tasks",
      "Letting the queue accumulate all week",
    ],
  },
  {
    role: "mail_clerk",
    metricKey: "avg_mail_routing_minutes",
    diagnosis:
      "Average minutes from mail received to attached-to-case is above 90. Routing delays mean a record sits in the mail room unseen — and that's how medical records get to hearings late.",
    actionSteps: [
      {
        label: "Use auto-categorize on every scan",
        description:
          "Bulk-scan automatically attaches mail to the correct case by matching claimant name + DOB. Reduces routing to seconds.",
        expectedOutcome: "Routing time drops from [actual] to under 30 minutes",
        timeframe: "Start on the next scan",
      },
      {
        label: "Route in real time, not in batches",
        description:
          "Don't scan everything first and route later. Scan → route → confirm attached → next item.",
        expectedOutcome: "Nothing aged more than a few minutes in limbo",
        timeframe: "Start today",
      },
      {
        label: "Escalate unroutable items immediately",
        description:
          "If mail can't be matched to a case (bad name match, etc), create a 'unroutable' ticket and tag the case manager team. Don't let unroutable items rot.",
        expectedOutcome: "Unroutable mail gets resolved same-day",
        timeframe: "Today",
      },
    ],
    coachingTalkingPoints: [
      "Routing minutes are [actual], target is 30. The mail room is a 30-minute pit stop, not a 90-minute warehouse.",
      "Demo auto-categorize during the session.",
      "Ask: 'What's your biggest unroutable pain point?' — usually it's bad name matches, which is a fixable process issue.",
    ],
    trainingResources: [
      "Mail Room Playbook § 2 — Routing Workflow",
      "Video: Auto-categorize (2 min)",
    ],
    commonRootCauses: [
      "Not using auto-categorize",
      "Scanning in batches and routing after — long limbo",
      "Unroutable items piling up with no escalation path",
      "Routing the easy items first and letting hard ones age",
    ],
  },
  {
    role: "mail_clerk",
    metricKey: "unprocessed_mail_aging_hours",
    diagnosis:
      "Oldest unprocessed mail item age is above 24 hours. One piece of mail aging 24+ hours is operationally OK; a pattern of 24+ hour items means the mail room isn't being worked to zero daily.",
    actionSteps: [
      {
        label: "Walk the mail room end-of-day",
        description:
          "Last 15 minutes of each day, physically walk the mail room. Any item left unprocessed gets flagged: escalated, bulk-scanned, or manually routed before you leave.",
        expectedOutcome: "No item ever ages past 24 hours",
        timeframe: "Daily habit",
      },
      {
        label: "Set a physical 'oldest item' visible tracker",
        description:
          "Post the oldest item in the mail room on a whiteboard with its received date. Creates social pressure to clear it.",
        expectedOutcome: "Oldest item never drifts past 24 hours",
        timeframe: "Today",
      },
      {
        label: "Escalate any item at 48 hours immediately",
        description:
          "If any item hits 48 hours without being processed, escalate to supervisor — it almost always means the item is genuinely unroutable.",
        expectedOutcome: "No item ever hits 72 hours",
        timeframe: "Start today",
      },
    ],
    coachingTalkingPoints: [
      "Oldest item aging is [actual] hours, target is under 24. Patterns of aging items signal a process gap, not a volume gap.",
      "The end-of-day walk is the mechanical fix — commit to it during the session.",
    ],
    trainingResources: ["Mail Room Playbook § 3 — Zero-Age Discipline"],
    commonRootCauses: [
      "No end-of-day walkthrough — aged items hide overnight",
      "Unroutable items absorbed silently instead of escalated",
      "Queue worked reactively instead of to-zero daily",
    ],
  },
];

/**
 * Look up a recipe by role + metric. Returns null if no recipe exists
 * for that combination — caller is responsible for a graceful fallback.
 */
export function getRecipe(
  role: string,
  metricKey: string,
): CoachingRecipe | null {
  return (
    COACHING_LIBRARY.find(
      (r) => r.role === role && r.metricKey === metricKey,
    ) ?? null
  );
}

/**
 * Return every recipe for a given role. Useful for "team training" or
 * role-wide pages.
 */
export function getRecipesForRole(role: string): CoachingRecipe[] {
  return COACHING_LIBRARY.filter((r) => r.role === role);
}
