import type { Metadata } from "next";
import { getAllEreCredentials } from "@/app/actions/ere";
import { EreCredentialsClient } from "./client";

export const metadata: Metadata = {
  title: "ERE Credentials",
};

export default async function EreCredentialsPage() {
  let credentials: Awaited<ReturnType<typeof getAllEreCredentials>> = [];

  try {
    credentials = await getAllEreCredentials();
  } catch {
    // DB unavailable
  }

  return (
    <EreCredentialsClient
      credentials={credentials.map((c) => ({
        ...c,
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
