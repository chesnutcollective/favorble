import Link from "next/link";
import { cookies } from "next/headers";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { PORTAL_IMPERSONATE_COOKIE } from "../../layout";
import { ProfileLocalePicker } from "./locale-picker";

export default async function PortalProfilePage() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  const session = await ensurePortalSession({ impersonateContactId });
  await logPortalActivity("view_profile");

  const contact = session.contact;
  const displayName = `${contact.firstName} ${contact.lastName}`.trim() || "—";

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Your profile
        </h1>
        <p className="mt-1 text-[15px] text-foreground/70">
          This is the information we have on file. Contact your attorney to
          change anything you can&apos;t edit below.
        </p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <h2 className="text-[14px] font-semibold uppercase tracking-wide text-foreground/70">
          Claimant info
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ProfileField label="Name" value={displayName} />
          <ProfileField label="Email" value={contact.email ?? "—"} />
          <ProfileField label="Phone" value={contact.phone ?? "—"} />
          <ProfileField label="Status" value={session.portalUser.status} />
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <h2 className="text-[14px] font-semibold uppercase tracking-wide text-foreground/70">
          Language
        </h2>
        <p className="mt-2 text-[15px] text-foreground/70">
          Pick the language you&apos;d like to read the portal in. We&apos;ll
          remember your choice.
        </p>
        <div className="mt-4">
          <ProfileLocalePicker current={contact.preferredLocale || "en"} />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
        <h2 className="text-[14px] font-semibold uppercase tracking-wide text-foreground/70">
          Session
        </h2>
        <LogoutRow />
      </section>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium uppercase tracking-wide text-foreground/60">
        {label}
      </dt>
      <dd className="mt-1 text-[16px] text-foreground">{value}</dd>
    </div>
  );
}

// Client sub-component so we can check impersonation state.
function LogoutRow() {
  return (
    <div className="mt-2 flex flex-col items-start gap-3">
      <p className="text-[15px] text-foreground/70">
        Signing out will return you to the login page.
      </p>
      <Link
        href="/logout"
        className="inline-flex items-center gap-2 rounded-full bg-[#104e60] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#0d3f4e]"
      >
        Log out
      </Link>
    </div>
  );
}

