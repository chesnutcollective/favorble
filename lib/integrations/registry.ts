/**
 * Static integration registry — the single source of truth for every
 * external service Favorble connects to. Config is version-controlled;
 * secrets stay in env vars; health checks + usage metrics live in the
 * `integration_events` DB table.
 *
 * To add a new integration:
 * 1. Add an entry here
 * 2. Drop the logo SVG/PNG in /public/integrations/
 * 3. Deploy — the cockpit and detail pages pick it up automatically
 */

export type IntegrationCategory =
  | "data_pipeline"
  | "communication"
  | "infrastructure"
  | "auth"
  | "ai";

export type IntegrationStatus = "active" | "configured" | "pending" | "disabled";

export type IntegrationDependency = {
  /** ID of the integration this depends on */
  integrationId: string;
  /** What this integration uses the dependency for */
  purpose: string;
};

export type IntegrationEnvVar = {
  key: string;
  label: string;
  required: boolean;
  /** If true, the value is a secret (API key, token) and should be masked in the UI */
  secret: boolean;
};

export type IntegrationConfig = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  /** One-liner for the cockpit card subtitle */
  tagline: string;
  category: IntegrationCategory;
  /** Path to logo file relative to /public/ (e.g. "integrations/railway.svg") */
  logoPath: string;
  /** Fallback icon character or emoji when logo fails to load */
  fallbackIcon: string;
  /** The URL to ping for health checks (null = not health-checkable) */
  healthCheckUrl: string | null;
  /** Env var that contains the health check URL (resolved at runtime) */
  healthCheckEnvVar?: string;
  /** HTTP method for health check (default GET) */
  healthCheckMethod?: "GET" | "POST";
  /** Expected response status for healthy (default 200) */
  healthCheckExpectedStatus?: number;
  /** Environment variables this integration needs */
  envVars: IntegrationEnvVar[];
  /** What Favorble features depend on this integration */
  poweredFeatures: string[];
  /** Other integrations this one depends on */
  dependencies: IntegrationDependency[];
  /** External documentation URL */
  docsUrl?: string;
  /** The webhook path this integration sends events to (if any) */
  webhookPath?: string;
  /** Tags for filtering */
  tags: string[];
};

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  data_pipeline: "Data Pipeline",
  communication: "Communication",
  infrastructure: "Infrastructure",
  auth: "Auth & Identity",
  ai: "AI & ML",
};

export const CATEGORY_DESCRIPTIONS: Record<IntegrationCategory, string> = {
  data_pipeline:
    "Services that pull case data from SSA, medical providers, and legal databases into Favorble.",
  communication:
    "Email, SMS, phone, and messaging channels connecting the firm to clients and providers.",
  infrastructure:
    "Platform services — hosting, databases, job orchestration, and background processing.",
  auth: "Authentication, user management, and access control.",
  ai: "Machine learning services for document extraction, transcription, and intelligence.",
};

export const INTEGRATION_REGISTRY: IntegrationConfig[] = [
  // ─────────────────────────────────────────────────────────────
  // DATA PIPELINE
  // ─────────────────────────────────────────────────────────────
  {
    id: "ere-orchestrator",
    name: "ERE Scraper Orchestrator",
    shortName: "ERE",
    description:
      "Coordinates Playwright-based scraping of SSA's Electronic Records Express portal. Manages browser sessions, job queuing, and document downloads from the Social Security Administration.",
    tagline: "SSA case data extraction via Login.gov",
    category: "data_pipeline",
    logoPath: "integrations/ssa.svg",
    fallbackIcon: "🏛",
    healthCheckUrl: null,
    healthCheckEnvVar: "ERE_SCRAPER_URL",
    envVars: [
      { key: "ERE_SCRAPER_URL", label: "Orchestrator URL", required: true, secret: false },
      { key: "ERE_SCRAPER_API_KEY", label: "API Key", required: true, secret: true },
      { key: "ERE_WEBHOOK_SECRET", label: "Webhook Secret", required: true, secret: true },
    ],
    poweredFeatures: [
      "SSA tab on case detail",
      "Automatic document downloads",
      "Hearing date detection",
      "Decision outcome tracking",
      "Case status reconciliation",
    ],
    dependencies: [
      { integrationId: "ere-browser", purpose: "Headless browser for SSA navigation" },
      { integrationId: "ere-cron", purpose: "Scheduled scrape triggers" },
    ],
    docsUrl: "https://www.ssa.gov/ere/",
    webhookPath: "/api/webhooks/ere",
    tags: ["railway", "scraper", "ssa", "critical"],
  },
  {
    id: "ere-browser",
    name: "ERE Browser Service",
    shortName: "ERE Browser",
    description:
      "Headless Playwright instance on Railway that handles Login.gov authentication, TOTP 2FA, and SSA portal navigation. Managed by the ERE Orchestrator.",
    tagline: "Headless browser for SSA portal automation",
    category: "data_pipeline",
    logoPath: "integrations/playwright.svg",
    fallbackIcon: "🎭",
    healthCheckUrl: null,
    envVars: [],
    poweredFeatures: ["ERE scraping sessions"],
    dependencies: [],
    tags: ["railway", "browser", "ssa"],
  },
  {
    id: "ere-cron",
    name: "ERE Cron Scheduler",
    shortName: "ERE Cron",
    description:
      "Scheduled trigger service that initiates ERE scrapes every 2 hours for cases with upcoming hearings. Runs on Railway alongside the orchestrator.",
    tagline: "Recurring SSA scrape scheduler",
    category: "data_pipeline",
    logoPath: "integrations/cron.svg",
    fallbackIcon: "⏰",
    healthCheckUrl: null,
    envVars: [],
    poweredFeatures: ["Automated hearing date monitoring", "Incremental case syncs"],
    dependencies: [
      { integrationId: "ere-orchestrator", purpose: "Sends scrape jobs to orchestrator" },
    ],
    tags: ["railway", "scheduler", "ssa"],
  },
  {
    id: "chronicle",
    name: "Chronicle Legal",
    shortName: "Chronicle",
    description:
      "SSA data portal with deep-linked case views. Future API integration for real-time case data sync. Currently used for seeded case data and document imports.",
    tagline: "SSA case data portal & document archive",
    category: "data_pipeline",
    logoPath: "integrations/chronicle.svg",
    fallbackIcon: "📜",
    healthCheckUrl: null,
    envVars: [
      { key: "CHRONICLE_WEBHOOK_SECRET", label: "Webhook Secret", required: false, secret: true },
    ],
    poweredFeatures: [
      "Chronicle case deep links",
      "Seeded case data (10 cases, 205 documents)",
      "Medical chronology entries",
    ],
    dependencies: [],
    docsUrl: "https://chroniclelegal.com",
    webhookPath: "/api/webhooks/chronicle",
    tags: ["ssa", "documents"],
  },
  {
    id: "case-status",
    name: "CaseStatus",
    shortName: "CaseStatus",
    description:
      "Client-facing portal (the 'Pizza Tracker' for cases). Handles bidirectional messaging between the firm and claimants, document uploads from clients, and case status notifications.",
    tagline: "Client messaging & status portal",
    category: "data_pipeline",
    logoPath: "integrations/casestatus.svg",
    fallbackIcon: "📱",
    healthCheckUrl: null,
    envVars: [
      { key: "CASE_STATUS_API_KEY", label: "API Key", required: true, secret: true },
      { key: "CASE_STATUS_API_URL", label: "API URL", required: true, secret: false },
      { key: "CASE_STATUS_WEBHOOK_SECRET", label: "Webhook Secret", required: true, secret: true },
    ],
    poweredFeatures: [
      "Client inbound messaging",
      "Outbound message delivery",
      "Client document uploads",
      "Case stage sync",
      "Sentiment analysis pipeline",
    ],
    dependencies: [],
    webhookPath: "/api/webhooks/case-status",
    tags: ["client-facing", "messaging", "critical"],
  },
  {
    id: "mycase",
    name: "MyCase",
    shortName: "MyCase",
    description:
      "Legacy case management system being replaced by Favorble. Full bidirectional sync of cases, contacts, leads, tasks, and documents via REST API with rate limiting.",
    tagline: "Legacy CMS — full data sync",
    category: "data_pipeline",
    logoPath: "integrations/mycase.svg",
    fallbackIcon: "📋",
    healthCheckUrl: null,
    envVars: [
      { key: "MYCASE_API_KEY", label: "API Key", required: true, secret: true },
    ],
    poweredFeatures: [
      "Case/contact/lead/task/document sync",
      "Historical data migration",
      "n8n workflow: mycase-sync",
    ],
    dependencies: [
      { integrationId: "n8n", purpose: "Orchestrates the sync workflow" },
    ],
    tags: ["legacy", "sync", "critical"],
  },

  // ─────────────────────────────────────────────────────────────
  // COMMUNICATION
  // ─────────────────────────────────────────────────────────────
  {
    id: "outlook",
    name: "Microsoft Outlook",
    shortName: "Outlook",
    description:
      "Azure AD OAuth2 integration for Microsoft Graph. Fetches inbound emails, auto-associates them with cases via sender matching, and syncs calendar events for hearing dates.",
    tagline: "Email & calendar sync via Microsoft Graph",
    category: "communication",
    logoPath: "integrations/outlook.svg",
    fallbackIcon: "📧",
    healthCheckUrl: null,
    envVars: [
      { key: "MICROSOFT_CLIENT_ID", label: "Azure Client ID", required: true, secret: false },
      { key: "MICROSOFT_CLIENT_SECRET", label: "Client Secret", required: true, secret: true },
      { key: "MICROSOFT_TENANT_ID", label: "Tenant ID", required: true, secret: false },
    ],
    poweredFeatures: [
      "Email workspace (/email)",
      "Auto-association of emails to cases",
      "Calendar hearing sync",
    ],
    dependencies: [],
    tags: ["email", "calendar", "microsoft"],
  },
  {
    id: "resend",
    name: "Resend",
    shortName: "Resend",
    description:
      "Transactional email delivery for notification alerts, escalation emails, and system messages. Activated by setting RESEND_API_KEY — no code change needed.",
    tagline: "Transactional email delivery",
    category: "communication",
    logoPath: "integrations/resend.svg",
    fallbackIcon: "✉️",
    healthCheckUrl: null,
    envVars: [
      { key: "RESEND_API_KEY", label: "API Key", required: false, secret: true },
      { key: "RESEND_FROM_EMAIL", label: "From Email", required: false, secret: false },
    ],
    poweredFeatures: [
      "Email notification delivery",
      "Escalation alerts to supervisors",
      "Coaching flag notifications",
    ],
    dependencies: [],
    docsUrl: "https://resend.com/docs",
    tags: ["email", "notifications"],
  },
  {
    id: "twilio",
    name: "Twilio",
    shortName: "Twilio",
    description:
      "SMS delivery for urgent notifications when team members are away from the app. Activated by setting TWILIO_* env vars — no code change needed.",
    tagline: "SMS notification delivery",
    category: "communication",
    logoPath: "integrations/twilio.svg",
    fallbackIcon: "💬",
    healthCheckUrl: null,
    envVars: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID", required: false, secret: false },
      { key: "TWILIO_AUTH_TOKEN", label: "Auth Token", required: false, secret: true },
      { key: "TWILIO_FROM_NUMBER", label: "From Phone Number", required: false, secret: false },
    ],
    poweredFeatures: [
      "SMS notification delivery",
      "Urgent escalation alerts",
    ],
    dependencies: [],
    docsUrl: "https://www.twilio.com/docs",
    tags: ["sms", "notifications"],
  },
  {
    id: "calltools",
    name: "CallTools",
    shortName: "CallTools",
    description:
      "Call recording service. Sends webhook events when recordings complete. Audio files are transcribed by Deepgram and reviewed by the AI QC pipeline.",
    tagline: "Call recording & webhook delivery",
    category: "communication",
    logoPath: "integrations/calltools.svg",
    fallbackIcon: "📞",
    healthCheckUrl: null,
    envVars: [
      { key: "CALLTOOLS_WEBHOOK_SECRET", label: "Webhook HMAC Secret", required: false, secret: true },
    ],
    poweredFeatures: [
      "Call recording ingestion",
      "QA call transcript pipeline",
      "Per-team-member call quality scoring",
    ],
    dependencies: [
      { integrationId: "deepgram", purpose: "Transcribes call recordings" },
    ],
    webhookPath: "/api/webhooks/calltools",
    tags: ["phone", "recordings", "qa"],
  },

  // ─────────────────────────────────────────────────────────────
  // AI & ML
  // ─────────────────────────────────────────────────────────────
  {
    id: "langextract",
    name: "LangExtract Worker",
    shortName: "LangExtract",
    description:
      "Python FastAPI service powered by Gemini 2.5 Flash. Extracts structured data from medical records, SSA decision letters, status reports, PHI sheets, and appeal briefs. Produces medical chronology entries.",
    tagline: "AI document extraction (Gemini 2.5 Flash)",
    category: "ai",
    logoPath: "integrations/gemini.svg",
    fallbackIcon: "🤖",
    healthCheckUrl: null,
    healthCheckEnvVar: "LANGEXTRACT_URL",
    envVars: [
      { key: "LANGEXTRACT_URL", label: "Worker URL", required: true, secret: false },
    ],
    poweredFeatures: [
      "Medical record extraction",
      "Decision letter parsing",
      "Medical chronology generation",
      "Auto document classification",
      "PHI sheet drafting",
    ],
    dependencies: [],
    tags: ["railway", "ai", "extraction", "critical"],
  },
  {
    id: "deepgram",
    name: "Deepgram",
    shortName: "Deepgram",
    description:
      "Speech-to-text API (nova-2 model) for call recording transcription with speaker diarization. Activated by DEEPGRAM_API_KEY — without it, the pipeline uses a stub transcript.",
    tagline: "Speech-to-text transcription (nova-2)",
    category: "ai",
    logoPath: "integrations/deepgram.svg",
    fallbackIcon: "🎙",
    healthCheckUrl: null,
    envVars: [
      { key: "DEEPGRAM_API_KEY", label: "API Key", required: false, secret: true },
    ],
    poweredFeatures: [
      "Call transcript generation",
      "Speaker diarization",
      "QA call quality pipeline",
    ],
    dependencies: [],
    docsUrl: "https://developers.deepgram.com/docs",
    tags: ["ai", "transcription", "speech"],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    shortName: "Claude",
    description:
      "Claude Sonnet powers all AI drafting: client message responses, call scripts, coaching conversations, pre-hearing briefs, appeal forms, risk narratives, sentiment analysis, and message QA review.",
    tagline: "AI drafting & analysis engine",
    category: "ai",
    logoPath: "integrations/anthropic.svg",
    fallbackIcon: "🧠",
    healthCheckUrl: null,
    envVars: [
      { key: "ANTHROPIC_API_KEY", label: "API Key", required: true, secret: true },
    ],
    poweredFeatures: [
      "AI client message drafting (CM-2)",
      "Call script generation (SA-4)",
      "Coaching conversation drafting (CC-2/CC-4)",
      "Pre-hearing brief drafting (SA-2)",
      "Case risk narrative (PR-1)",
      "Sentiment analysis (QA-3)",
      "Outbound message QA (QA-2)",
      "Pattern analysis narratives (RP-3)",
      "Stagnant case next-action suggestions (SM-3)",
    ],
    dependencies: [],
    docsUrl: "https://docs.anthropic.com",
    tags: ["ai", "llm", "critical"],
  },

  // ─────────────────────────────────────────────────────────────
  // INFRASTRUCTURE
  // ─────────────────────────────────────────────────────────────
  {
    id: "railway-postgres",
    name: "Railway PostgreSQL",
    shortName: "PostgreSQL",
    description:
      "Primary database on Railway with pgvector extension. Hosts all case data, user accounts, documents metadata, communications, tasks, medical chronology, AI drafts, compliance findings, and performance snapshots.",
    tagline: "Primary database (pgvector enabled)",
    category: "infrastructure",
    logoPath: "integrations/postgresql.svg",
    fallbackIcon: "🐘",
    healthCheckUrl: null,
    envVars: [
      { key: "DATABASE_URL", label: "Connection String", required: true, secret: true },
    ],
    poweredFeatures: ["Everything — this is the core database"],
    dependencies: [],
    tags: ["railway", "database", "critical"],
  },
  {
    id: "railway-redis",
    name: "Railway Redis",
    shortName: "Redis",
    description:
      "Redis 7 on Railway for BullMQ job queues, session caching, and rate limiting. Powers background processing and the real-time activity feed.",
    tagline: "Job queues & caching (BullMQ)",
    category: "infrastructure",
    logoPath: "integrations/redis.svg",
    fallbackIcon: "🔴",
    healthCheckUrl: null,
    envVars: [
      { key: "REDIS_URL", label: "Redis Connection", required: false, secret: true },
    ],
    poweredFeatures: ["BullMQ job processing", "Activity feed", "Rate limiting"],
    dependencies: [],
    tags: ["railway", "cache", "queue"],
  },
  {
    id: "railway-bucket",
    name: "Railway Object Storage",
    shortName: "Storage",
    description:
      "S3-compatible object storage on Railway for durable document file storage. All webhook-ingested documents are persisted here at deterministic keys. Signed URLs for secure preview/download.",
    tagline: "Durable document blob storage (S3-compatible)",
    category: "infrastructure",
    logoPath: "integrations/s3.svg",
    fallbackIcon: "📦",
    healthCheckUrl: null,
    envVars: [
      { key: "RAILWAY_BUCKET_ENDPOINT", label: "S3 Endpoint", required: true, secret: false },
      { key: "RAILWAY_BUCKET_NAME", label: "Bucket Name", required: true, secret: false },
      { key: "RAILWAY_BUCKET_ACCESS_KEY_ID", label: "Access Key ID", required: true, secret: true },
      { key: "RAILWAY_BUCKET_SECRET_ACCESS_KEY", label: "Secret Access Key", required: true, secret: true },
      { key: "RAILWAY_BUCKET_REGION", label: "Region", required: false, secret: false },
    ],
    poweredFeatures: [
      "Document preview & download",
      "Webhook document ingest (durable storage)",
      "Chronicle PDF imports",
    ],
    dependencies: [],
    tags: ["railway", "storage", "documents"],
  },
  {
    id: "n8n",
    name: "n8n Workflow Engine",
    shortName: "n8n",
    description:
      "Self-hosted n8n on Railway running 20 workflows (5 active webhook listeners + 15 scheduled/manual). Handles MyCase sync, lead intake, daily digests, ERE scheduling, HIPAA audit, and third-party CRM sync.",
    tagline: "Workflow orchestration (20 workflows)",
    category: "infrastructure",
    logoPath: "integrations/n8n.svg",
    fallbackIcon: "⚡",
    healthCheckUrl: null,
    healthCheckEnvVar: "N8N_BASE_URL",
    envVars: [
      { key: "N8N_BASE_URL", label: "n8n Base URL", required: true, secret: false },
      { key: "N8N_API_KEY", label: "API Key (JWT)", required: true, secret: true },
    ],
    poweredFeatures: [
      "MyCase full sync",
      "Lead intake automation",
      "Daily digest emails",
      "ERE scrape scheduling",
      "HIPAA compliance audit",
      "Mailchimp/Bitrix24 sync",
    ],
    dependencies: [
      { integrationId: "mycase", purpose: "Sync source" },
      { integrationId: "railway-postgres", purpose: "Data target" },
    ],
    tags: ["railway", "workflows", "automation"],
  },
  {
    id: "vercel",
    name: "Vercel",
    shortName: "Vercel",
    description:
      "Hosts the Next.js 16 frontend with 9 scheduled cron jobs for background processing: document ingest retry, transcription retry, deadline scanning, risk scoring, stagnant case detection, performance rollup, compliance scanning, coaching detection, and task escalation.",
    tagline: "Frontend hosting + 9 background cron jobs",
    category: "infrastructure",
    logoPath: "integrations/vercel.svg",
    fallbackIcon: "▲",
    healthCheckUrl: null,
    envVars: [
      { key: "CRON_SECRET", label: "Cron Auth Secret", required: true, secret: true },
    ],
    poweredFeatures: [
      "Web application hosting",
      "9 background cron jobs",
      "Preview deployments for staging",
      "Edge network CDN",
    ],
    dependencies: [
      { integrationId: "railway-postgres", purpose: "Database" },
      { integrationId: "railway-redis", purpose: "Job queue" },
    ],
    tags: ["hosting", "cron", "critical"],
  },
  {
    id: "clerk",
    name: "Clerk",
    shortName: "Clerk",
    description:
      "Authentication and user management. Currently in test mode with a demo-user fallback when ENABLE_CLERK_AUTH is not set. Supports impersonation via actor tokens for the View-As feature.",
    tagline: "Authentication & user management",
    category: "auth",
    logoPath: "integrations/clerk.svg",
    fallbackIcon: "🔐",
    healthCheckUrl: null,
    envVars: [
      { key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", label: "Publishable Key", required: true, secret: false },
      { key: "CLERK_SECRET_KEY", label: "Secret Key", required: true, secret: true },
      { key: "ENABLE_CLERK_AUTH", label: "Enable Auth (true/false)", required: false, secret: false },
    ],
    poweredFeatures: [
      "User authentication",
      "Session management",
      "View-As impersonation (actor tokens)",
      "User provisioning sync",
    ],
    dependencies: [],
    docsUrl: "https://clerk.com/docs",
    tags: ["auth", "identity"],
  },
];

// ─── Helpers ───

export function getIntegration(id: string): IntegrationConfig | undefined {
  return INTEGRATION_REGISTRY.find((i) => i.id === id);
}

export function getIntegrationsByCategory(
  category: IntegrationCategory,
): IntegrationConfig[] {
  return INTEGRATION_REGISTRY.filter((i) => i.category === category);
}

export function getAllCategories(): IntegrationCategory[] {
  const seen = new Set<IntegrationCategory>();
  for (const i of INTEGRATION_REGISTRY) seen.add(i.category);
  return Array.from(seen);
}

/**
 * Check which env vars are configured for an integration.
 * Returns { configured: string[], missing: string[] }.
 * Only checks for presence, not validity.
 */
export function checkEnvVarPresence(
  integration: IntegrationConfig,
): { configured: string[]; missing: string[]; allRequired: boolean } {
  const configured: string[] = [];
  const missing: string[] = [];
  for (const v of integration.envVars) {
    if (process.env[v.key]) {
      configured.push(v.key);
    } else {
      missing.push(v.key);
    }
  }
  const requiredMissing = integration.envVars
    .filter((v) => v.required)
    .some((v) => !process.env[v.key]);
  return { configured, missing, allRequired: !requiredMissing };
}

/**
 * Resolve the health check URL for an integration. Some integrations
 * store the base URL in an env var — this resolves it at runtime.
 */
export function resolveHealthCheckUrl(
  integration: IntegrationConfig,
): string | null {
  if (integration.healthCheckUrl) return integration.healthCheckUrl;
  if (integration.healthCheckEnvVar) {
    const base = process.env[integration.healthCheckEnvVar];
    if (base) return `${base.replace(/\/$/, "")}/health`;
  }
  return null;
}
