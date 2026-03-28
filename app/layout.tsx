import type { Metadata } from "next";
import { dmSans, dmMono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
	),
	title: {
		default: "Favorble — by Hogan Smith",
		template: "%s | Favorble",
	},
	description: "Social Security Disability Legal Practice Platform",
	openGraph: {
		title: "Favorble — by Hogan Smith",
		description: "Social Security Disability Legal Practice Platform",
		siteName: "Favorble",
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
		<html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
			<body className="font-sans antialiased">{children}</body>
		</html>
	);
}
