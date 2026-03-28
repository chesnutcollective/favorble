import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getDocumentTemplates } from "@/app/actions/templates";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon } from "@hugeicons/core-free-icons";
import { TemplatesClient } from "./client";

export const metadata: Metadata = {
	title: "Document Templates",
};

export default async function TemplatesPage() {
	const session = await requireSession();

	let templates: Awaited<ReturnType<typeof getDocumentTemplates>> = [];

	try {
		templates = await getDocumentTemplates();
	} catch {
		// DB unavailable
	}

	return (
		<div className="space-y-6">
			<TemplatesClient
				templates={templates.map((t) => ({
					id: t.id,
					name: t.name,
					description: t.description,
					category: t.category,
					mergeFields: t.mergeFields,
					requiresSignature: t.requiresSignature,
					createdAt: t.createdAt.toISOString(),
					updatedAt: t.updatedAt.toISOString(),
				}))}
			/>
		</div>
	);
}
