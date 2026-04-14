import Link from "next/link";
import { getCaseById } from "@/app/actions/cases";
import { getCaseDocuments } from "@/app/actions/documents";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { notFound } from "next/navigation";
import { CaseTabNav } from "./tab-nav";
import { CaseStageSelector } from "@/components/cases/case-stage-selector";
import { SSNDisplay } from "@/components/cases/ssn-display";
import { InviteCollaboratorButton } from "@/components/collab-shares/invite-collaborator-button";
import { decrypt, maskSSN } from "@/lib/encryption";
import { requireSession } from "@/lib/auth/session";

const INVITE_ROLES = new Set([
  "admin",
  "attorney",
  "case_manager",
  "medical_records",
]);

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

  // Collab-invite affordance — shown only to roles that can manage shares.
  const session = await requireSession();
  const canInviteCollaborator = INVITE_ROLES.has(session.role);
  let collabDocOptions: Array<{
    id: string;
    fileName: string;
    category: string | null;
  }> = [];
  if (canInviteCollaborator) {
    try {
      const docs = await getCaseDocuments(id);
      collabDocOptions = docs.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        category: d.category,
      }));
    } catch {
      // Non-fatal; dialog will render with empty doc list.
    }
  }

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
              {canInviteCollaborator && (
                <InviteCollaboratorButton
                  caseId={caseData.id}
                  availableDocuments={collabDocOptions}
                />
              )}
              <CaseStageSelector
                caseId={caseData.id}
                currentStageId={caseData.currentStageId}
                currentStageName={caseData.stageName}
                currentStageGroupColor={caseData.stageGroupColor}
              />
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-1">
            {caseData.stageGroups.map((group, i) => {
              const isCompleted = i < currentGroupIndex;
              const isCurrent = i === currentGroupIndex;
              return (
                <div
                  key={group.id}
                  className="flex-1 h-2 rounded-full"
                  style={{
                    backgroundColor: isCompleted
                      ? "#000"
                      : isCurrent
                        ? "transparent"
                        : "#EAEAEA",
                    border: isCurrent ? "1.5px solid #000" : "none",
                  }}
                  title={group.name}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs text-muted-foreground">
            {caseData.stageGroups.map((group, i) => (
              <span
                key={group.id}
                className={
                  i === currentGroupIndex ? "font-medium text-foreground" : ""
                }
              >
                {group.name}
              </span>
            ))}
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
