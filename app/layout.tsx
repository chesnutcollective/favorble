import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "hogansmith",
    template: "%s | hogansmith",
  },
  description: "hogansmith - Built with Hatch",
  keywords: ["hogansmith", "web app"],
  authors: [{ name: "hogansmith" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "hogansmith",
    title: "hogansmith",
    description: "hogansmith - Built with Hatch",
  },
  twitter: {
    card: "summary_large_image",
    title: "hogansmith",
    description: "hogansmith - Built with Hatch",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="fixed top-0 left-0 p-4">
          <Image
            src="/gloo-logo.png"
            alt="Logo"
            width={48}
            height={48}
            priority
          />
        </header>
        {children}
      </body>
    </html>
  );
}
