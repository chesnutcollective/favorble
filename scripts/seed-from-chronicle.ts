/**
 * Seed the Favorble database from a scrape of Hogan Smith's Chronicle
 * tenant captured via the Chrome DevTools MCP.
 *
 * PHI WARNING — this script uploads REAL client eFolder PDFs pulled
 * from Chronicle. Top-level case/contact rows are sanitized with
 * Faker-generated identities, but the underlying PDFs are untouched
 * so the AI extraction pipeline can be exercised end-to-end. When the
 * extraction pipeline runs, it will pull real PHI back out of those
 * PDFs into medical_chronology / extracted_text columns. Make sure
 * your DATABASE_URL and RAILWAY_BUCKET_* target an environment that is
 * cleared for PHI under your BAA before you approve the run.
 *
 * Required env vars (loaded from .env.local):
 *   DATABASE_URL
 *   RAILWAY_BUCKET_ENDPOINT
 *   RAILWAY_BUCKET_NAME
 *   RAILWAY_BUCKET_ACCESS_KEY_ID
 *   RAILWAY_BUCKET_SECRET_ACCESS_KEY
 *
 * Inputs (all under .local-seed/chronicle/, git-ignored):
 *   raw/lists.json           — structured per-segment client lists
 *   raw/clients-full.json    — full per-client bundles (detail + documents
 *                              + timeline + signed PDF URLs)
 *   pdfs/*.pdf               — 30 real OCR'd SSA documents
 *
 * What it writes:
 *   leads            × 10
 *   cases            × 10   (Chronicle segment → Favorble stage)
 *   contacts         × 10
 *   case_contacts    × 10
 *   documents        × ~200 (up to 20 per case, 3/case with real PDFs
 *                            uploaded to the Railway bucket)
 *   calendar_events  × 10   (scheduled hearings only)
 *
 * Refuses to run without an explicit --yes-staging flag AND
 * CONFIRM_PHI_STAGING=yes environment variable — both required so
 * you can't trip this accidentally.
 *
 * Run:
 *   CONFIRM_PHI_STAGING=yes pnpm tsx scripts/seed-from-chronicle.ts --yes-staging
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "node:fs";
import * as path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { faker } from "@faker-js/faker";
import * as schema from "../db/schema";
import {
  buildRailwayDocumentKey,
  buildRailwayStoragePath,
  railwayBucketConfigured,
} from "../lib/storage/railway-bucket-shared";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

// ---------- Guardrails ----------

const argv = new Set(process.argv.slice(2));
if (!argv.has("--yes-staging")) {
  console.error(
    "Refusing to run without --yes-staging flag (prevents accidental execution).",
  );
  process.exit(1);
}
if (process.env.CONFIRM_PHI_STAGING !== "yes") {
  console.error(
    "Refusing to run: CONFIRM_PHI_STAGING=yes must be set. This script uploads real PHI-bearing PDFs to the configured DATABASE_URL / Railway bucket.",
  );
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (!railwayBucketConfigured()) {
  console.error(
    "RAILWAY_BUCKET_* env vars are not fully set. Cannot upload PDFs.",
  );
  process.exit(1);
}

// S3 client — reuse the same credentials the app will use at runtime
const s3 = new S3Client({
  endpoint: process.env.RAILWAY_BUCKET_ENDPOINT,
  region: process.env.RAILWAY_BUCKET_REGION ?? "auto",
  credentials: {
    accessKeyId: process.env.RAILWAY_BUCKET_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY as string,
  },
});
const BUCKET_NAME = process.env.RAILWAY_BUCKET_NAME as string;

// ---------- Paths ----------

const ROOT = path.resolve(__dirname, "..");
const SEED_DIR = path.join(ROOT, ".local-seed", "chronicle");
const LISTS_PATH = path.join(SEED_DIR, "raw", "lists.json");
const CLIENTS_PATH = path.join(SEED_DIR, "raw", "clients-full.json");
const PDF_DIR = path.join(SEED_DIR, "pdfs");

for (const p of [LISTS_PATH, CLIENTS_PATH, PDF_DIR]) {
  if (!fs.existsSync(p)) {
    console.error(`Missing input: ${p}`);
    console.error(
      "Run the Chronicle scrape first (see docs in .local-seed/chronicle).",
    );
    process.exit(1);
  }
}

// ---------- Sanitization helpers ----------

/** Deterministic fake identity per Chronicle client id. */
function fakeIdentity(chronicleId: number) {
  faker.seed(chronicleId);
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: faker.internet
      .email({ firstName, lastName, provider: "example.com" })
      .toLowerCase(),
    phone: faker.phone.number({ style: "national" }),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode(),
  };
}

/** Shift a DOB by ±3 years so it's not identifying. */
function shiftDob(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const shiftYears = (faker.number.int({ min: -3, max: 3 }) || 0);
  d.setFullYear(d.getFullYear() + shiftYears);
  return d;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickStageCode(
  segment: string,
  isWin: boolean | null | undefined,
): string {
  switch (segment) {
    case "initial":
      return "2B"; // Application Filed - SSDI
    case "reconsideration":
      return "3C"; // Reconsideration Filed
    case "appeals":
      return "4C"; // Request for Hearing - Filed
    case "hearing":
      return "4D"; // Hearing Scheduled
    case "decisions":
      return isWin ? "5A" : "5B";
    default:
      return "2B";
  }
}

/** Map Chronicle claim type string to Favorble's application_type. */
function mapClaimType(chronicleClaim: string | null | undefined): {
  primary: string | null;
  secondary: string | null;
} {
  if (!chronicleClaim) return { primary: null, secondary: null };
  const upper = chronicleClaim.toUpperCase();
  const t2 = upper.includes("TITLE 2") || upper.includes("T2");
  const t16 = upper.includes("TITLE 16") || upper.includes("T16");
  if (t2 && t16) return { primary: "SSDI", secondary: "SSI" };
  if (t2) return { primary: "SSDI", secondary: null };
  if (t16) return { primary: "SSI", secondary: null };
  return { primary: null, secondary: null };
}

// ---------- Main ----------

type ChronicleDoc = {
  id: string;
  ocr_file_key?: string;
  original_file_key?: string;
  name?: string;
  section_name?: string;
  document_type_key?: string | null;
  document_type_data?: { title?: string; document_category?: string } | null;
  ef_received?: string | null;
  document_date?: string | null;
  pages?: number | null;
  ssa_file_name?: string | null;
  created_at?: string;
};

type ChronicleBundle = {
  detail: Record<string, unknown>;
  documents: ChronicleDoc[];
  timeline: unknown[];
  signedUrls: { doc_id: string }[];
};

async function main() {
  const pg = postgres(DATABASE_URL as string);
  const db = drizzle(pg, { schema });

  console.log("=== Chronicle → Favorble local seed ===\n");
  console.log("Source:", SEED_DIR);

  // ----- Load input -----
  const lists = JSON.parse(fs.readFileSync(LISTS_PATH, "utf8")) as Record<
    string,
    Array<Record<string, unknown>>
  >;
  const clientsRaw = JSON.parse(
    fs.readFileSync(CLIENTS_PATH, "utf8"),
  ) as Record<string, ChronicleBundle>;

  // Discover which PDFs we actually have on disk
  const pdfFiles = new Set(fs.readdirSync(PDF_DIR).filter((f) => f.endsWith(".pdf")));
  console.log(`Found ${pdfFiles.size} local PDFs`);

  // ----- Load org + users + stages -----
  const org = await db.query.organizations.findFirst();
  if (!org) {
    throw new Error(
      'No organization found. Run "pnpm tsx db/seed/index.ts" (base seed) first.',
    );
  }
  const organizationId = org.id;
  console.log(`Organization: ${org.name} (${organizationId})`);

  const users = await db.query.users.findMany({
    where: eq(schema.users.organizationId, organizationId),
  });
  if (users.length === 0) {
    throw new Error(
      'No users found. Run the base seed first.',
    );
  }
  const defaultUserId = users[0].id;

  const stages = await db.query.caseStages.findMany({
    where: eq(schema.caseStages.organizationId, organizationId),
  });
  const stageByCode = new Map(stages.map((s) => [s.code, s]));
  if (stages.length === 0) {
    throw new Error('No case_stages found. Run the base seed first.');
  }

  // ----- Build the 10-client plan -----
  const plan: Array<{ chronicleId: number; segment: string }> = [];
  for (const segment of ["hearing", "appeals", "reconsideration", "initial", "decisions"]) {
    const entries = lists[segment] ?? [];
    for (const entry of entries.slice(0, 2)) {
      if (typeof entry.id === "number") {
        plan.push({ chronicleId: entry.id, segment });
      }
    }
  }
  console.log(`Planning ${plan.length} cases across segments\n`);

  // ----- Idempotency -----
  const existing = await db.query.cases.findMany({
    where: eq(schema.cases.organizationId, organizationId),
  });
  const existingChronicleIds = new Set(
    existing.map((c) => c.chronicleClaimantId).filter(Boolean),
  );

  let casesCreated = 0;
  let docsCreated = 0;
  let eventsCreated = 0;

  for (const { chronicleId, segment } of plan) {
    const bundle = clientsRaw[String(chronicleId)];
    if (!bundle?.detail) {
      console.log(`  [skip] ${chronicleId} — no bundle`);
      continue;
    }
    if (existingChronicleIds.has(String(chronicleId))) {
      console.log(`  [skip] ${chronicleId} — already seeded`);
      continue;
    }

    const detail = bundle.detail as Record<string, unknown>;
    const statusReport = (detail.latest_status_report ??
      {}) as Record<string, unknown>;
    const clientStatus = (detail.latest_client_status ??
      {}) as Record<string, unknown>;
    const claimType = (statusReport.claim_type || clientStatus.claim_type) as
      | string
      | null;
    const chronicleDob = detail.dob as string | undefined;

    const identity = fakeIdentity(chronicleId);
    const dob = shiftDob(chronicleDob ?? null);
    const { primary, secondary } = mapClaimType(claimType);
    const stageCode = pickStageCode(
      segment,
      statusReport.is_win as boolean | null,
    );
    const stage = stageByCode.get(stageCode);
    if (!stage) {
      console.log(`  [skip] ${chronicleId} — no stage ${stageCode}`);
      continue;
    }

    const caseNumberSuffix = String(chronicleId).slice(-5).padStart(5, "0");
    const caseNumber = `HS-${caseNumberSuffix}`;

    // Insert lead (convenience — lots of case UIs expect a lead parent)
    const [lead] = await db
      .insert(schema.leads)
      .values({
        organizationId,
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        phone: identity.phone,
        source: "chronicle",
        status: "converted",
        pipelineStage: "converted_full_rep",
        pipelineStageGroup: "conversion",
        createdBy: defaultUserId,
        convertedAt: parseDate(detail.created_at as string) ?? new Date(),
        notes: `Seeded from Chronicle client ${chronicleId} (sanitized).`,
      })
      .returning();

    // Insert case
    const hearingDate = parseDate(
      statusReport.hearing_scheduled_datetime as string,
    );
    const [caseRow] = await db
      .insert(schema.cases)
      .values({
        organizationId,
        caseNumber,
        leadId: lead.id,
        status: "active",
        currentStageId: stage.id,
        dateOfBirth: dob,
        applicationTypePrimary: primary,
        applicationTypeSecondary: secondary,
        hearingOffice: (statusReport.office_with_jurisdiction as string) ?? null,
        adminLawJudge: (statusReport.alj_full_name as string) ?? null,
        hearingDate,
        allegedOnsetDate: parseDate(clientStatus.alleged_onset as string),
        dateLastInsured: parseDate(clientStatus.last_insured as string),
        chronicleClaimantId: String(chronicleId),
        chronicleUrl: `https://app.chroniclelegal.com/dashboard/clients/${chronicleId}`,
        chronicleLastSyncAt: new Date(),
        createdBy: defaultUserId,
      })
      .returning();
    casesCreated += 1;

    // Insert claimant contact + link
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        organizationId,
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        phone: identity.phone,
        address: identity.address,
        city: identity.city,
        state: identity.state,
        zip: identity.zip,
        contactType: "claimant",
        createdBy: defaultUserId,
      })
      .returning();
    await db.insert(schema.caseContacts).values({
      caseId: caseRow.id,
      contactId: contact.id,
      relationship: "claimant",
      isPrimary: true,
    });

    // Insert documents (cap at 20 per case). For the ones where we have a
    // real PDF on disk, upload it to the Railway bucket and store the
    // railway:// storage_path so the app can serve it. For the rest, we
    // still insert the metadata row but leave storage_path as a
    // chronicle:// placeholder so document clicks show a "not yet imported"
    // state rather than 404ing silently.
    const docsSlice = (bundle.documents ?? []).slice(0, 20);
    for (const doc of docsSlice) {
      const localFilename = `${chronicleId}_${doc.id}.pdf`;
      const haveLocalPdf = pdfFiles.has(localFilename);

      let storagePath: string;
      let fileSize: number | null = null;

      if (haveLocalPdf) {
        const localPath = path.join(PDF_DIR, localFilename);
        const buffer = fs.readFileSync(localPath);
        fileSize = buffer.length;
        const key = buildRailwayDocumentKey(
          organizationId,
          caseRow.id,
          doc.ssa_file_name ?? `${doc.name ?? "document"}.pdf`,
        );
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: "application/pdf",
            CacheControl: "private, max-age=3600",
          }),
        );
        storagePath = buildRailwayStoragePath(BUCKET_NAME, key);
      } else {
        storagePath = `chronicle://${doc.ocr_file_key ?? doc.original_file_key ?? doc.id}`;
      }

      await db.insert(schema.documents).values({
        organizationId,
        caseId: caseRow.id,
        fileName:
          doc.ssa_file_name ??
          `${doc.name ?? "document"}_${doc.id}.pdf`,
        fileType: "application/pdf",
        fileSizeBytes: fileSize,
        storagePath,
        category: doc.document_type_data?.document_category ?? doc.section_name,
        source: "chronicle",
        sourceExternalId: doc.id,
        description: doc.document_type_data?.title ?? doc.name,
        tags: [
          doc.section_name,
          doc.document_type_key,
        ].filter((t): t is string => !!t),
        metadata: {
          chronicle_doc_id: doc.id,
          chronicle_section: doc.section_name,
          pages: doc.pages ?? null,
          ef_received: doc.ef_received ?? null,
          document_date: doc.document_date ?? null,
          uploaded_to_bucket: haveLocalPdf,
        },
        createdBy: defaultUserId,
      });
      docsCreated += 1;
    }

    // Hearing calendar event if scheduled
    if (hearingDate) {
      await db.insert(schema.calendarEvents).values({
        organizationId,
        caseId: caseRow.id,
        title: `Hearing — ${identity.lastName}, ${identity.firstName}`,
        eventType: "hearing",
        startAt: hearingDate,
        endAt: new Date(hearingDate.getTime() + 60 * 60 * 1000),
        hearingOffice: (statusReport.office_with_jurisdiction as string) ?? null,
        adminLawJudge: (statusReport.alj_full_name as string) ?? null,
        location: (statusReport.claimant_location as string) ?? null,
        createdBy: defaultUserId,
      });
      eventsCreated += 1;
    }

    console.log(
      `  [ok]   ${chronicleId} → ${caseNumber}  (${segment} → ${stageCode})  ${docsSlice.length} docs`,
    );
  }

  console.log("\n=== Done ===");
  console.log(`  cases:     ${casesCreated}`);
  console.log(`  documents: ${docsCreated}`);
  console.log(`  events:    ${eventsCreated}`);
  console.log(
    `\nReal PDFs live at ${PDF_DIR} and are referenced by absolute path in the`,
  );
  console.log(
    "documents.storage_path column. Your extraction pipeline can read them directly.",
  );

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
