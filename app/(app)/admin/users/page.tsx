import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "User Management",
};

export default function UsersPage() {
	return (
		<div>
			<h1 className="text-2xl font-semibold tracking-tight">Users & Teams</h1>
			<p className="text-muted-foreground mt-1">Manage user accounts, roles, and team assignments.</p>
		</div>
	);
}
