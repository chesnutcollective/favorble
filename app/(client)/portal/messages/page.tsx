import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { db } from "@/db/drizzle";
import { organizations } from "@/db/schema";
import {
  loadPortalMessages,
  markPortalMessagesRead,
  sendPortalMessage,
} from "@/app/actions/portal-messages";
import { PORTAL_IMPERSONATE_COOKIE } from "../../layout";
import { PortalThreadView } from "./thread-view";

/**
 * B1 — Portal messaging page.
 *
 * Renders the single ongoing conversation between the claimant and the firm.
 * Inbound-from-firm messages are marked read on mount so the bell / nav
 * badge can clear. The composer is a client component so it can stick to
 * the viewport and disable itself while impersonating.
 */
export default async function PortalMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<{ caseId?: string }>;
}) {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });

  const params = (await searchParams) ?? {};
  const sessionCaseIds = session.cases.map((c) => c.id);
  const selectedCaseId =
    params.caseId && sessionCaseIds.includes(params.caseId)
      ? params.caseId
      : (sessionCaseIds[0] ?? null);

  // Log the view, mark unread firm messages as read, load history — in
  // parallel where possible. markPortalMessagesRead is suppressed for
  // staff impersonation (handled inside the action).
  const [, , messages] = await Promise.all([
    logPortalActivity("view_messages", "case", selectedCaseId),
    markPortalMessagesRead(),
    loadPortalMessages({ caseId: selectedCaseId }),
  ]);

  // Firm display name — use the claimant's organization name so the header
  // reads like "Favorble Law" rather than a generic "your firm".
  let firmName = "Your legal team";
  try {
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, session.portalUser.organizationId))
      .limit(1);
    if (org?.name) firmName = org.name;
  } catch {
    // non-fatal — fall back to default label
  }

  const casePicker = session.cases.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
  }));

  return (
    <div className="space-y-4">
      <PortalThreadView
        firmName={firmName}
        claimantName={
          `${session.contact.firstName} ${session.contact.lastName}`.trim() ||
          "You"
        }
        messages={messages}
        cases={casePicker}
        selectedCaseId={selectedCaseId}
        sendAction={sendPortalMessage}
      />
    </div>
  );
}
