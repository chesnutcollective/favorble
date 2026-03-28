import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default async function SettingsPage() {
  const user = await requireSession();

  let org: Awaited<ReturnType<typeof fetchOrganization>> | undefined;

  try {
    org = await fetchOrganization(user.organizationId);
  } catch {
    // DB unavailable
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Organization-wide settings and configuration."
      />

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">Organization</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="mt-0.5 text-sm text-foreground">{org?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Slug</p>
              <p className="mt-0.5 text-sm text-foreground font-mono">
                {org?.slug ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Created</p>
              <p className="mt-0.5 text-sm text-foreground">
                {org?.createdAt.toLocaleDateString() ?? "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">Your Account</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="mt-0.5 text-sm text-foreground">
                {user.firstName} {user.lastName}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Email</p>
              <p className="mt-0.5 text-sm text-foreground">{user.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Role</p>
              <Badge variant="outline" className="mt-0.5">
                {user.role}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Team</p>
              <Badge variant="outline" className="mt-0.5">
                {user.team ?? "None"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-2">System Information</h3>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <span className="text-muted-foreground">Framework:</span>{" "}
              <span className="text-foreground">Next.js 15</span>
            </div>
            <div>
              <span className="text-muted-foreground">Database:</span>{" "}
              <span className="text-foreground">PostgreSQL (Supabase)</span>
            </div>
            <div>
              <span className="text-muted-foreground">ORM:</span>{" "}
              <span className="text-foreground">Drizzle</span>
            </div>
            <div>
              <span className="text-muted-foreground">Storage:</span>{" "}
              <span className="text-foreground">Supabase Storage</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
