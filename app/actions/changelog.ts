"use server";

import { unstable_cache } from "next/cache";

export type CommitType =
  | "feat"
  | "fix"
  | "chore"
  | "docs"
  | "refactor"
  | "perf"
  | "ci"
  | "test"
  | "other";

export interface CommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  body: string | null;
  type: CommitType;
  author: string;
  date: string; // ISO
  url: string;
}

interface GitHubCommitResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

const KNOWN_TYPES = new Set([
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "perf",
  "ci",
  "test",
]);

function parseCommitType(message: string): CommitType {
  const match = message.match(
    /^(feat|fix|chore|docs|refactor|test|ci|style|perf)(\(.+?\))?:/,
  );
  if (match && KNOWN_TYPES.has(match[1])) return match[1] as CommitType;
  return "other";
}

function stripPrefix(message: string): string {
  return message.replace(
    /^(feat|fix|chore|docs|refactor|test|ci|style|perf)(\(.+?\))?:\s*/,
    "",
  );
}

async function fetchCommitsPage(
  page: number,
  perPage: number,
): Promise<{ commits: CommitEntry[]; hasMore: boolean }> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/chesnutcollective/favorble/commits?per_page=${perPage}&page=${page}&sha=staging`,
      { headers },
    );

    if (!res.ok) {
      return { commits: [], hasMore: false };
    }

    const data: GitHubCommitResponse[] = await res.json();

    const commits: CommitEntry[] = data.map((c) => {
      const fullMessage = c.commit.message;
      const [firstLine, ...bodyLines] = fullMessage.split("\n");
      const body =
        bodyLines.filter((l: string) => l.trim()).join("\n") || null;

      return {
        hash: c.sha,
        shortHash: c.sha.substring(0, 7),
        subject: stripPrefix(firstLine),
        body,
        type: parseCommitType(firstLine),
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      };
    });

    return { commits, hasMore: commits.length === perPage };
  } catch {
    return { commits: [], hasMore: false };
  }
}

const getCachedCommits = unstable_cache(
  fetchCommitsPage,
  ["changelog-commits"],
  { revalidate: 300, tags: ["changelog"] },
);

export async function getChangelogCommits(
  page = 1,
  perPage = 50,
): Promise<{ commits: CommitEntry[]; hasMore: boolean }> {
  return getCachedCommits(page, perPage);
}
