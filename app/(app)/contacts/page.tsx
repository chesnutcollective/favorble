import type { Metadata } from "next";
import {
  getContacts,
  getPortalStatusForContacts,
} from "@/app/actions/contacts";
import { PageHeader } from "@/components/shared/page-header";
import { ContactsListClient } from "./client";

export const metadata: Metadata = {
  title: "Contacts",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const search = params.search ?? "";
  const contactType = params.type ?? "";

  let contactsResult: Awaited<ReturnType<typeof getContacts>> = {
    contacts: [],
    total: 0,
    page,
    pageSize: 50,
  };

  try {
    contactsResult = await getContacts(
      {
        search: search || undefined,
        contactType: contactType || undefined,
      },
      { page, pageSize: 50 },
    );
  } catch {
    // DB unavailable
  }

  // Portal status map for the visible claimants. Non-claimant rows can
  // request it but we only render the column meaningfully for claimants
  // (invites are case-scoped).
  const claimantIds = contactsResult.contacts
    .filter((c) => c.contactType === "claimant")
    .map((c) => c.id);
  let portalStatusMap: Record<string, string> = {};
  try {
    portalStatusMap = await getPortalStatusForContacts(claimantIds);
  } catch {
    portalStatusMap = {};
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contacts"
        description="Contact directory for claimants and related parties."
      />
      <ContactsListClient
        contacts={contactsResult.contacts.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          portalStatus:
            (portalStatusMap[c.id] as
              | "never"
              | "invited"
              | "active"
              | "suspended"
              | undefined) ?? "never",
        }))}
        total={contactsResult.total}
        page={contactsResult.page}
        pageSize={contactsResult.pageSize}
        initialSearch={search}
        initialType={contactType}
      />
    </div>
  );
}
