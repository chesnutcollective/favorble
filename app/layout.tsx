import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
	),
	title: {
		default: "Hogan Smith Law — CaseFlow",
		template: "%s | Hogan Smith Law",
	},
	description: "Social Security Disability Case Management System",
	openGraph: {
		title: "Hogan Smith Law — CaseFlow",
		description: "Social Security Disability Case Management System",
		siteName: "Hogan Smith Law",
	},
	robots: {
		index: false,
		follow: false,
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body className="font-sans antialiased">{children}</body>
		</html>
	);
}
