import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { cases, documents, ereCredentials, ereJobs } from "@/db/schema";
import { documentProcessingResults } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, GlobeIcon } from "@hugeicons/core-free-icons";
import { EreScrapingCard } from "@/components/ere/ere-scraping-card";
import { EreDocumentsFeed } from "@/components/ere/ere-documents-feed";

async function fetchCaseSsaData(caseId: string) {
  const result = await db
    .select({
      chronicleClaimantId: cases.chronicleClaimantId,
      chronicleUrl: cases.chronicleUrl,
      chronicleLastSyncAt: cases.chronicleLastSyncAt,
      ssaClaimNumber: cases.ssaClaimNumber,
      ssaOffice: cases.ssaOffice,
      applicationTypePrimary: cases.applicationTypePrimary,
      applicationTypeSecondary: cases.applicationTypeSecondary,
      allegedOnsetDate: cases.allegedOnsetDate,
      dateLastInsured: cases.dateLastInsured,
      hearingOffice: cases.hearingOffice,
      adminLawJudge: cases.adminLawJudge,
      organizationId: cases.organizationId,
    })
    .from(cases)
    .where(eq(cases.id, caseId));
  return result[0];
}

async function fetchEreData(caseId: string, organizationId: string) {
  // Get the first active credential for this org (for the Sync Now button)
  const creds = await db
    .select({ id: ereCredentials.id })
    .from(ereCredentials)
    .where(
      and(
        eq(ereCredentials.organizationId, organizationId),
        eq(ereCredentials.isActive, true),
      ),
    )
    .limit(1);

  const credentialId = creds[0]?.id ?? null;

  // Get ERE jobs for this case
  const jobs = await db
    .select({
      id: ereJobs.id,
      jobType: ereJobs.jobType,
      status: ereJobs.status,
      documentsFound: ereJobs.documentsFound,
      documentsDownloaded: ereJobs.documentsDownloaded,
      errorMessage: ereJobs.errorMessage,
      startedAt: ereJobs.startedAt,
      completedAt: ereJobs.completedAt,
      createdAt: ereJobs.createdAt,
    })
    .from(ereJobs)
    .where(eq(ereJobs.caseId, caseId))
    .orderBy(desc(ereJobs.createdAt))
    .limit(10);

  // Get ERE documents for this case
  const ereDocs = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      category: documents.category,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documents.source, "ere"),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt));

  // Get processing status for each ERE document
  const docsWithProcessing = await Promise.all(
    ereDocs.map(async (doc) => {
      const [procResult] = await db
        .select({ status: documentProcessingResults.status })
        .from(documentProcessingResults)
        .where(eq(documentProcessingResults.documentId, doc.id))
        .limit(1);

      return {
        id: doc.id,
        fileName: doc.fileName,
        category: doc.category,
        processingStatus: procResult?.status ?? null,
        createdAt: doc.createdAt.toISOString(),
      };
    }),
  );

  return {
    credentialId,
    jobs: jobs.map((j) => ({
      id: j.id,
      jobType: j.jobType,
      status: j.status,
      documentsFound: j.documentsFound,
      documentsDownloaded: j.documentsDownloaded,
      errorMessage: j.errorMessage,
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
    })),
    documents: docsWithProcessing,
  };
}

export default async function CaseSsaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  await requireSession();

  let caseData: Awaited<ReturnType<typeof fetchCaseSsaData>> | undefined;

  try {
    caseData = await fetchCaseSsaData(caseId);
  } catch {
    // DB unavailable
  }

  if (!caseData) {
    return <div>Case not found</div>;
  }

  let ereData: Awaited<ReturnType<typeof fetchEreData>> | null = null;
  try {
    ereData = await fetchEreData(caseId, caseData.organizationId);
  } catch {
    // ERE data unavailable
  }

  const hasChronicle = caseData.chronicleUrl || caseData.chronicleClaimantId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="SSA Data"
        description="Social Security Administration data and Chronicle integration."
      />

      {/* Chronicle Integration */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <HugeiconsIcon
                  icon={GlobeIcon}
                  size={20}
                  color="rgb(147 51 234)"
                />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Chronicle</h3>
                <p className="text-sm text-muted-foreground">
                  SSA document sync and ERE access
                </p>
              </div>
            </div>
            {hasChronicle ? (
              <Badge
                variant="outline"
                className="text-green-700 border-green-300 bg-green-50 dark:bg-green-950/20"
              >
                Connected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/20"
              >
                Not linked
              </Badge>
            )}
          </div>

          {hasChronicle ? (
            <div className="mt-4 space-y-3">
              {caseData.chronicleUrl && (
                <Button asChild>
                  <a
                    href={caseData.chronicleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <HugeiconsIcon
                      icon={LinkSquare02Icon}
                      size={16}
                      className="mr-2"
                    />
                    Open in Chronicle
                  </a>
                </Button>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {caseData.chronicleClaimantId && (
                  <InfoItem
                    label="Claimant ID"
                    value={caseData.chronicleClaimantId}
                  />
                )}
                {caseData.chronicleLastSyncAt && (
                  <InfoItem
                    label="Last Sync"
                    value={caseData.chronicleLastSyncAt.toLocaleString()}
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Link this case to Chronicle to enable SSA document sync and ERE
              access.{" "}
              <a
                href={`/cases/${caseId}/fields`}
                className="text-primary hover:underline"
              >
                Add Chronicle URL in Fields
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      {/* SSA Case Information */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">
            SSA Case Information
          </h3>
          <div className="grid gap-x-6 gap-y-0 sm:grid-cols-2 lg:grid-cols-3 [&>*]:border-b [&>*]:border-border/40 [&>*:nth-last-child(-n+3)]:border-b-0 sm:[&>*:nth-last-child(-n+2)]:border-b-0 lg:[&>*:nth-last-child(-n+3)]:border-b-0">
            <InfoItem
              label="SSA Claim Number"
              value={caseData.ssaClaimNumber}
            />
            <InfoItem label="SSA Office" value={caseData.ssaOffice} />
            <InfoItem
              label="Primary Application"
              value={caseData.applicationTypePrimary}
            />
            <InfoItem
              label="Secondary Application"
              value={caseData.applicationTypeSecondary}
            />
            <InfoItem
              label="Alleged Onset Date"
              value={
                caseData.allegedOnsetDate
                  ? caseData.allegedOnsetDate.toLocaleDateString()
                  : null
              }
            />
            <InfoItem
              label="Date Last Insured"
              value={
                caseData.dateLastInsured
                  ? caseData.dateLastInsured.toLocaleDateString()
                  : null
              }
            />
            <InfoItem label="Hearing Office" value={caseData.hearingOffice} />
            <InfoItem
              label="Administrative Law Judge"
              value={caseData.adminLawJudge}
            />
          </div>
        </CardContent>
      </Card>

      {/* ERE Monitoring */}
      <EreScrapingCard
        caseId={caseId}
        credentialId={ereData?.credentialId ?? null}
        jobs={ereData?.jobs ?? []}
      />

      {/* ERE Documents */}
      <EreDocumentsFeed documents={ereData?.documents ?? []} />
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value ?? "—"}</p>
    </div>
  );
}
