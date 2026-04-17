import Link from "next/link";
import { findActiveInvitationByToken } from "@/app/actions/portal-invites";
import { InviteAcceptCard } from "./invite-accept-card";

type PageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Public accept-invite page. The /portal/invite/:token path is exempt from
 * Clerk auth in proxy.ts so a claimant without an account can land here
 * from their email.
 */
export default async function InviteAcceptPage({ params }: PageProps) {
  const { token } = await params;
  const invite = await findActiveInvitationByToken(token);

  if (!invite) {
    return <InvalidInviteCard />;
  }

  return (
    <PageShell>
      <InviteAcceptCard
        token={token}
        firstName={invite.firstName}
        email={invite.email ?? ""}
        expiresAt={invite.expiresAt.toISOString()}
      />
    </PageShell>
  );
}

function InvalidInviteCard() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          This link isn&apos;t valid anymore.
        </h1>
        <p className="mt-2 text-[16px] leading-relaxed text-foreground/70">
          Invitations expire after 7 days, and each link can only be used
          once. Contact your attorney for a new link and we&apos;ll get you
          back into the portal.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#104e60] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#0d3f4e]"
        >
          Go to login
        </Link>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F5F2] px-4 py-12">
      <div className="w-full">
        <div className="mx-auto mb-6 flex max-w-md items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#104e60] text-[12px] font-bold text-white">
            F
          </span>
          Favorble
        </div>
        {children}
      </div>
    </div>
  );
}
