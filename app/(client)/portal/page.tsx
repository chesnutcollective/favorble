import Link from "next/link";
import {
  MessageSquare,
  FileText,
  CalendarDays,
  User,
} from "lucide-react";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { cookies } from "next/headers";
import { PORTAL_IMPERSONATE_COOKIE } from "../layout";

/**
 * Welcome/landing page for the portal. Wave 2 will replace this with the
 * real stage view; for now it's a stub with the 4 CTA tiles so the shell
 * and links can be exercised end-to-end.
 */
export default async function PortalHomePage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });
  await logPortalActivity("view_home");

  const firstName = session.contact.firstName || "there";
  const caseNumber = session.cases[0]?.caseNumber ?? "HS-XXXXX";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-8">
        <p className="text-[13px] font-medium uppercase tracking-wide text-[#104e60]/80">
          Welcome
        </p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px]">
          Hi {firstName}, your case{" "}
          <span className="font-mono text-foreground/80">#{caseNumber}</span>{" "}
          is in progress.
        </h1>
        <p className="mt-2 text-[17px] leading-relaxed text-foreground/70">
          We&apos;ll keep this page up to date so you always know what&apos;s
          happening next. You can message your team, upload documents, and
          see your appointments using the tiles below.
        </p>
      </section>

      <section
        aria-label="Quick actions"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <PortalTile
          href="/portal/messages"
          icon={MessageSquare}
          title="Messages"
          description="Send and receive messages with your team."
        />
        <PortalTile
          href="/portal/documents"
          icon={FileText}
          title="Documents"
          description="Upload and view case documents."
        />
        <PortalTile
          href="/portal/appointments"
          icon={CalendarDays}
          title="Appointments"
          description="Upcoming calls, hearings, and deadlines."
        />
        <PortalTile
          href="/portal/profile"
          icon={User}
          title="Profile"
          description="Update your contact info and preferences."
        />
      </section>
    </div>
  );
}

function PortalTile({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] transition-colors hover:ring-[#104e60]/30"
    >
      <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-[#104e60]/10 text-[#104e60]">
        <Icon className="size-5" />
      </span>
      <div>
        <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-foreground/70">
          {description}
        </p>
      </div>
    </Link>
  );
}
