import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Document Templates",
};

export default function TemplatesPage() {
	return (
		<div>
			<h1 className="text-2xl font-semibold tracking-tight">Document Templates</h1>
			<p className="text-muted-foreground mt-1">Manage document templates with merge fields.</p>
		</div>
	);
}
