import Link from "next/link";
import { getCaseById } from "@/app/actions/cases";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { notFound } from "next/navigation";
import { CaseTabNav } from "./tab-nav";
import { CaseStageSelector } from "@/components/cases/case-stage-selector";
import { CaseCloseDialog } from "@/components/cases/case-close-dialog";
import { CaseHoldDialog } from "@/components/cases/case-hold-dialog";
import { SSNDisplay } from "@/components/cases/ssn-display";
import { StageSegmentBar } from "@/components/stages/stage-segment-bar";
import { decrypt, maskSSN } from "@/lib/encryption";

export default async function CaseDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let caseData: Awaited<ReturnType<typeof getCaseById>> = null;

  try {
    caseData = await getCaseById(id);
  } catch {
    // Retry once on failure
    try {
      caseData = await getCaseById(id);
    } catch {
      // DB unavailable
    }
  }

  if (!caseData) {
    // One more attempt with a fresh connection
    try {
      caseData = await getCaseById(id);
    } catch {
      notFound();
    }
    if (!caseData) notFound();
  }

  // Compute masked SSN if available
  let maskedSSN: string | null = null;
  if (caseData.ssnEncrypted) {
    try {
      const rawSSN = decrypt(caseData.ssnEncrypted);
      maskedSSN = maskSSN(rawSSN);
    } catch {
      maskedSSN = "***-**-****";
    }
  }

  // Find current stage group index for progress bar
  const currentGroupId = caseData.stageGroupId;
  const currentGroupIndex = caseData.stageGroups.findIndex(
    (g) => g.id === currentGroupId,
  );

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/cases"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Cases
      </Link>

      {/* Case Header */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">
                {caseData.claimant
                  ? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
                  : "Unknown Claimant"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {caseData.caseNumber}
                {caseData.dateOfBirth && (
                  <>
                    {" "}
                    &middot; DOB: {caseData.dateOfBirth.toLocaleDateString()}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CaseStageSelector
                caseId={caseData.id}
                currentStageId={caseData.currentStageId}
                currentStageName={caseData.stageName}
                currentStageGroupColor={caseData.stageGroupColor}
              />
              <CaseHoldDialog caseId={caseData.id} />
              <CaseCloseDialog caseId={caseData.id} />
            </div>
          </div>

          {/* D5 — Per-stage Progress Bar.
              Group label stays above so users still get group context, then a
              segment bar shows every INDIVIDUAL stage within the group. */}
          <div className="space-y-1.5">
            {caseData.stageGroupName && (
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{
                    color: caseData.stageGroupColor ?? undefined,
                  }}
                >
                  {caseData.stageGroupName}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  (Group {currentGroupIndex + 1} of {caseData.stageGroups.length})
                </span>
              </div>
            )}
            <StageSegmentBar
              stages={caseData.stagesInCurrentGroup}
              currentStageId={caseData.currentStageId}
            />
          </div>
        </div>

        {/* Quick Info Sidebar */}
        <Card className="lg:w-64 shrink-0">
          <CardContent className="p-4 space-y-3">
            {caseData.assignedStaff.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Assigned Staff
                </p>
                <div className="space-y-1">
                  {caseData.assignedStaff.map((staff) => (
                    <div key={staff.id} className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">
                          {staff.firstName[0]}
                          {staff.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-foreground">
                        {staff.firstName} {staff.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {staff.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {maskedSSN && (
              <SSNDisplay caseId={caseData.id} maskedSSN={maskedSSN} />
            )}
            {caseData.ssaOffice && (
              <InfoItem label="SSA Office" value={caseData.ssaOffice} />
            )}
            {caseData.createdAt && (
              <InfoItem
                label="Opened"
                value={caseData.createdAt.toLocaleDateString()}
              />
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Case Status
              </p>
              {caseData.caseStatusExternalId ? (
                <a
                  href={`https://app.casestatus.com/cases/${caseData.caseStatusExternalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in Case Status
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">Not linked</p>
              )}
            </div>
            {caseData.chronicleUrl && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Chronicle
                </p>
                <a
                  href={caseData.chronicleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open in Chronicle
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <CaseTabNav caseId={id} />

      {/* Tab Content */}
      <div>{children}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
