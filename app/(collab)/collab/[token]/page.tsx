import { notFound } from "next/navigation";
import {
  resolveCollabTokenPublic,
  stampCollabFirstView,
} from "@/app/actions/collab-shares";
import { CollabShareClient } from "./client";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function CollabSharePage({ params }: PageProps) {
  const { token } = await params;

  const result = await resolveCollabTokenPublic(token);

  if (!result.ok && result.reason === "not_found") {
    notFound();
  }

  if (!result.ok && result.reason === "gone") {
    return (
      <div className="space-y-3 rounded-lg border border-[#EAEAEA] bg-background p-6">
        <h1 className="text-lg font-semibold">This link is no longer active</h1>
        <p className="text-sm text-muted-foreground">
          The share you followed has either expired or been revoked. If you
          still need access, please reach out to the firm directly.
        </p>
      </div>
    );
  }

  const view = result.ok ? result.view : null;
  if (!view) notFound();

  // Stamp first view (best-effort, don't break page on failure).
  try {
    await stampCollabFirstView(token);
  } catch {
    // ignore
  }

  return (
    <CollabShareClient
      token={token}
      share={{
        ...view.share,
        expiresAt: view.share.expiresAt.toISOString(),
      }}
      caseInfo={view.case}
      documents={view.documents.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))}
      messages={view.messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
