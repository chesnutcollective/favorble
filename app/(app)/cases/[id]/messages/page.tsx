import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageSquare } from "lucide-react";
import * as caseStatusClient from "@/lib/integrations/case-status";

export default async function CaseMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  await requireSession();

  const isConfigured = caseStatusClient.isConfigured();

  // Get case messages
  const messages = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.caseId, caseId),
      ),
    )
    .orderBy(desc(communications.createdAt));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        description="Client messages via Case Status."
      />

      {!isConfigured && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-amber-600">
              <MessageSquare className="h-5 w-5" />
              <p className="text-sm">
                Case Status integration is not configured. Outbound messaging is
                disabled.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {messages.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No messages"
          description="Messages from the client via Case Status will appear here."
        />
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => {
            const isInbound = msg.type === "message_inbound";
            return (
              <div
                key={msg.id}
                className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    isInbound
                      ? "bg-muted text-foreground"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        isInbound
                          ? "border-border text-muted-foreground"
                          : "border-blue-300 text-blue-100"
                      }`}
                    >
                      {isInbound ? "Client" : "Staff"}
                    </Badge>
                    {msg.fromAddress && (
                      <span
                        className={`text-xs ${isInbound ? "text-muted-foreground" : "text-blue-200"}`}
                      >
                        {msg.fromAddress}
                      </span>
                    )}
                  </div>
                  {msg.body && (
                    <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                  )}
                  <p
                    className={`mt-1 text-xs ${isInbound ? "text-muted-foreground" : "text-blue-200"}`}
                  >
                    {msg.createdAt.toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
