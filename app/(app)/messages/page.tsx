import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { communications, cases } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import * as caseStatusIntegration from "@/lib/integrations/case-status";

export const metadata: Metadata = {
  title: "Messages",
};

export default async function MessagesPage() {
  const user = await requireSession();
  const isConfigured = caseStatusIntegration.isConfigured();

  // Get recent communications
  const recentMessages = await db
    .select({
      id: communications.id,
      type: communications.type,
      subject: communications.subject,
      body: communications.body,
      fromAddress: communications.fromAddress,
      sourceSystem: communications.sourceSystem,
      createdAt: communications.createdAt,
      caseId: communications.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(communications)
    .leftJoin(cases, eq(communications.caseId, cases.id))
    .where(eq(communications.organizationId, user.organizationId))
    .orderBy(desc(communications.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Client messages from Case Status across all cases."
      />

      {!isConfigured && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Case Status not configured
                </p>
                <p className="text-sm text-gray-500">
                  Set CASE_STATUS_API_KEY in your environment to enable
                  bidirectional messaging.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {recentMessages.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No messages yet"
          description="Messages from clients via Case Status will appear here."
        />
      ) : (
        <div className="space-y-2">
          {recentMessages.map((msg) => (
            <Card key={msg.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          msg.type === "message_inbound"
                            ? "border-green-300 text-green-700"
                            : "border-blue-300 text-blue-700"
                        }
                      >
                        {msg.type === "message_inbound"
                          ? "Inbound"
                          : "Outbound"}
                      </Badge>
                      {msg.caseId && msg.caseNumber && (
                        <Link
                          href={`/cases/${msg.caseId}/messages`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Case #{msg.caseNumber}
                        </Link>
                      )}
                    </div>
                    {msg.subject && (
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {msg.subject}
                      </p>
                    )}
                    {msg.body && (
                      <p className="mt-0.5 text-sm text-gray-600 line-clamp-2">
                        {msg.body}
                      </p>
                    )}
                    {msg.fromAddress && (
                      <p className="mt-1 text-xs text-gray-500">
                        From: {msg.fromAddress}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">
                    {msg.createdAt.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
