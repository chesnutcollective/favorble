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

export default async function SettingsPage() {
  const user = await requireSession();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.organizationId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Organization-wide settings and configuration."
      />

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">Organization</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-500">Name</p>
              <p className="mt-0.5 text-sm text-gray-900">{org?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Slug</p>
              <p className="mt-0.5 text-sm text-gray-900 font-mono">
                {org?.slug ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Created</p>
              <p className="mt-0.5 text-sm text-gray-900">
                {org?.createdAt.toLocaleDateString() ?? "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">Your Account</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-500">Name</p>
              <p className="mt-0.5 text-sm text-gray-900">
                {user.firstName} {user.lastName}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Email</p>
              <p className="mt-0.5 text-sm text-gray-900">{user.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Role</p>
              <Badge variant="outline" className="mt-0.5">
                {user.role}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Team</p>
              <Badge variant="outline" className="mt-0.5">
                {user.team ?? "None"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-gray-900 mb-2">System Information</h3>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <span className="text-gray-500">Framework:</span>{" "}
              <span className="text-gray-900">Next.js 15</span>
            </div>
            <div>
              <span className="text-gray-500">Database:</span>{" "}
              <span className="text-gray-900">PostgreSQL (Supabase)</span>
            </div>
            <div>
              <span className="text-gray-500">ORM:</span>{" "}
              <span className="text-gray-900">Drizzle</span>
            </div>
            <div>
              <span className="text-gray-500">Storage:</span>{" "}
              <span className="text-gray-900">Supabase Storage</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
