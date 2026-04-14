import { PageHeader } from "@/components/shared/page-header";
import { getChangelogCommits } from "@/app/actions/changelog";
import { ChangelogClient } from "./client";

export const metadata = { title: "Changelog | Favorble" };

export default async function ChangelogPage() {
  const { commits, hasMore } = await getChangelogCommits(1, 50);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Changelog"
        description="Track every improvement to Favorble."
      />
      <ChangelogClient initialCommits={commits} initialHasMore={hasMore} />
    </div>
  );
}
