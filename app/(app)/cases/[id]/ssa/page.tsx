import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { cases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Globe } from "lucide-react";

export default async function CaseSsaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  await requireSession();

  const [caseData] = await db
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
    })
    .from(cases)
    .where(eq(cases.id, caseId));

  if (!caseData) {
    return <div>Case not found</div>;
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
                <Globe className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Chronicle</h3>
                <p className="text-sm text-muted-foreground">
                  SSA document sync and ERE access
                </p>
              </div>
            </div>
            {hasChronicle ? (
              <Badge variant="outline" className="text-green-700 border-green-300">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
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
                    <ExternalLink className="mr-2 h-4 w-4" />
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
              Add a Chronicle URL to this case to enable quick access.
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <InfoItem
              label="Hearing Office"
              value={caseData.hearingOffice}
            />
            <InfoItem
              label="Administrative Law Judge"
              value={caseData.adminLawJudge}
            />
          </div>
        </CardContent>
      </Card>
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
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}
