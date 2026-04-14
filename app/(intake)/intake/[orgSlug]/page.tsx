import { notFound } from "next/navigation";
import { db } from "@/db/drizzle";
import { organizations } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { resolveLocale } from "@/lib/i18n/getTranslation";
import { IntakeFormClient } from "./client";

type PageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function PublicIntakePage({
  params,
  searchParams,
}: PageProps) {
  const { orgSlug } = await params;
  const { lang } = await searchParams;

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(
      and(eq(organizations.slug, orgSlug), isNull(organizations.deletedAt)),
    )
    .limit(1);

  if (!org) notFound();

  const initialLocale = resolveLocale(lang);

  return (
    <IntakeFormClient
      orgSlug={org.slug}
      orgName={org.name}
      initialLocale={initialLocale}
    />
  );
}
