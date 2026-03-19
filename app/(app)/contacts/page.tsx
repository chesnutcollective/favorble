import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Contacts",
};

export default function ContactsPage() {
	return (
		<div>
			<h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
			<p className="text-muted-foreground mt-1">Contact directory for claimants and related parties.</p>
		</div>
	);
}
