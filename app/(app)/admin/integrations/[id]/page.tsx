import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getIntegrationDetail,
  getCustomLogoUrl,
} from "@/app/actions/integration-management";
import { IntegrationDetailClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getIntegrationDetail(id);
  return {
    title: detail ? `${detail.config.name} — Integrations` : "Integration",
  };
}

export default async function IntegrationDetailPage({ params }: Props) {
  const { id } = await params;
  const [detail, customLogoUrl] = await Promise.all([
    getIntegrationDetail(id),
    getCustomLogoUrl(id),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <IntegrationDetailClient detail={detail} customLogoUrl={customLogoUrl} />
  );
}
