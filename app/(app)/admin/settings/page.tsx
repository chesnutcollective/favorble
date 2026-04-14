import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import {
  organizations,
  users,
  cases,
  contacts,
  documents,
  tasks,
} from "@/db/schema";
import { eq, count, and, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Settings",
};

async function fetchOrganization(organizationId: string) {
  const result = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return result[0];
}

async function fetchMemberCount(organizationId: string) {
  const result = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(eq(users.organizationId, organizationId), isNull(users.deletedAt)),
    );
  return result[0]?.count ?? 0;
}

async function fetchStats(organizationId: string) {
  const [casesResult, contactsResult, documentsResult, tasksResult] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(cases)
        .where(eq(cases.organizationId, organizationId)),
      db
        .select({ count: count() })
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, organizationId),
            isNull(contacts.deletedAt),
          ),
        ),
      db
        .select({ count: count() })
        .from(documents)
        .where(
          and(
            eq(documents.organizationId, organizationId),
            isNull(documents.deletedAt),
          ),
        ),
      db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.organizationId, organizationId)),
    ]);

  return {
    cases: casesResult[0]?.count ?? 0,
    contacts: contactsResult[0]?.count ?? 0,
    documents: documentsResult[0]?.count ?? 0,
    tasks: tasksResult[0]?.count ?? 0,
  };
}

async function fetchLastLogin(userId: string) {
  const result = await db
    .select({ lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.id, userId));
  return result[0]?.lastLoginAt ?? null;
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

export default async function SettingsPage() {
  const user = await requireSession();

  let org: Awaited<ReturnType<typeof fetchOrganization>> | undefined;
  let memberCount = 0;
  let stats = { cases: 0, contacts: 0, documents: 0, tasks: 0 };
  let lastLogin: Date | null = null;

  try {
    [org, memberCount, stats, lastLogin] = await Promise.all([
      fetchOrganization(user.organizationId),
      fetchMemberCount(user.organizationId),
      fetchStats(user.organizationId),
      fetchLastLogin(user.id),
    ]);
  } catch {
    // DB unavailable
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Organization-wide settings and configuration."
      />

      {/* Organization */}
      <Card>
        <CardContent className="p-6">
          <div className="text-[12px] font-medium text-[#666] uppercase tracking-[0.05em] mb-5">
            Organization
          </div>

          <div className="flex items-start gap-4">
            {/* Org avatar placeholder */}
            <div className="w-12 h-12 rounded-lg bg-[#F5F5F5] border border-[#EAEAEA] flex items-center justify-center shrink-0">
              <span className="text-[18px] font-semibold text-[#999]">
                {org?.name?.charAt(0)?.toUpperCase() ?? "O"}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-[15px] font-semibold text-[#171717]">
                  {org?.name ?? "—"}
                </h3>
                <Button variant="link" className="text-[11px] font-medium text-[#0070F3] hover:text-[#005BB5] h-auto p-0">
                  Edit
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                    Slug
                  </p>
                  <p className="text-[13px] text-[#171717] font-mono">
                    {org?.slug ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                    Members
                  </p>
                  <p className="text-[13px] text-[#171717]">
                    {formatNumber(memberCount)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                    Created
                  </p>
                  <p className="text-[13px] text-[#171717]">
                    {org?.createdAt
                      ? org.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Your Account */}
      <Card>
        <CardContent className="p-6">
          <div className="text-[12px] font-medium text-[#666] uppercase tracking-[0.05em] mb-5">
            Your Account
          </div>

          <div className="flex items-start gap-4">
            {/* Avatar initials */}
            <div className="w-12 h-12 rounded-full bg-[#171717] flex items-center justify-center shrink-0">
              <span className="text-[14px] font-semibold text-white tracking-[0.02em]">
                {getInitials(user.firstName, user.lastName)}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-semibold text-[#171717] mb-4">
                {user.firstName} {user.lastName}
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                    Email
                  </p>
                  <p className="text-[13px] text-[#171717]">{user.email}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1.5">
                    Role
                  </p>
                  <span className="inline-flex items-center rounded-full border border-[#EAEAEA] bg-[#FAFAFA] px-2 py-[2px] text-[11px] font-medium text-[#171717] capitalize">
                    {user.role}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1.5">
                    Team
                  </p>
                  <span className="inline-flex items-center rounded-full border border-[#EAEAEA] bg-[#FAFAFA] px-2 py-[2px] text-[11px] font-medium text-[#171717] capitalize">
                    {user.team ?? "None"}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                    Last Login
                  </p>
                  <p className="text-[13px] text-[#171717]">
                    {lastLogin
                      ? lastLogin.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardContent className="p-6">
          <div className="text-[12px] font-medium text-[#666] uppercase tracking-[0.05em] mb-5">
            Quick Stats
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1.5">
                Cases
              </p>
              <p className="text-[24px] font-semibold text-[#171717] tracking-[-0.5px]">
                {formatNumber(stats.cases)}
              </p>
            </div>
            <div className="rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1.5">
                Contacts
              </p>
              <p className="text-[24px] font-semibold text-[#171717] tracking-[-0.5px]">
                {formatNumber(stats.contacts)}
              </p>
            </div>
            <div className="rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1.5">
                Documents
              </p>
              <p className="text-[24px] font-semibold text-[#171717] tracking-[-0.5px]">
                {formatNumber(stats.documents)}
              </p>
            </div>
            <div className="rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1.5">
                Tasks
              </p>
              <p className="text-[24px] font-semibold text-[#171717] tracking-[-0.5px]">
                {formatNumber(stats.tasks)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardContent className="p-6">
          <div className="text-[12px] font-medium text-[#666] uppercase tracking-[0.05em] mb-5">
            System Information
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                Framework
              </p>
              <p className="text-[13px] text-[#171717]">Next.js 15</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                Database
              </p>
              <p className="text-[13px] text-[#171717]">
                PostgreSQL (Supabase)
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                ORM
              </p>
              <p className="text-[13px] text-[#171717]">Drizzle</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] mb-1">
                Storage
              </p>
              <p className="text-[13px] text-[#171717]">Supabase Storage</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-[#FECACA] bg-[#FEE2E2]/30 hover:border-[#FCA5A5] transition-colors duration-200">
        <CardContent className="p-6">
          <div className="text-[12px] font-medium text-[#991B1B] uppercase tracking-[0.05em] mb-1">
            Danger Zone
          </div>
          <p className="text-[13px] text-[#991B1B]/60 mb-5">
            Irreversible and destructive actions.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-white p-4">
              <div>
                <p className="text-[13px] font-medium text-[#171717]">
                  Export all data
                </p>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Download a complete archive of your organization data.
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 text-[12px] font-medium">
                Export
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-white p-4">
              <div>
                <p className="text-[13px] font-medium text-[#171717]">
                  Delete organization
                </p>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Permanently delete this organization and all of its data.
                </p>
              </div>
              <Button variant="destructive" size="sm" className="shrink-0 text-[12px] font-medium">
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
