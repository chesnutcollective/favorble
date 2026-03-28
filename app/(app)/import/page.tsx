import { ImportWizard } from "./client";

export default function ImportPage() {
	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Import Cases
				</h1>
				<p className="text-muted-foreground mt-1">
					Upload a CSV file to bulk-create cases and contacts.
				</p>
			</div>
			<ImportWizard />
		</div>
	);
}
