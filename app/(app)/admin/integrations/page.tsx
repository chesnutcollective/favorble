import type { Metadata } from "next";
import { getIntegrationsStatus } from "@/lib/services/integrations-status";
import { IntegrationsCockpit } from "./cockpit";

export const metadata: Metadata = {
	title: "Integrations & Systems",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function IntegrationsPage() {
	const status = await getIntegrationsStatus();
	return <IntegrationsCockpit status={status} />;
}
