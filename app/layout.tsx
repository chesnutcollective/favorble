import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { geist, geistMono } from "@/lib/fonts";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const scrollbarPref = cookieStore.get("favorble_scrollbars")?.value;
  const hideScrollbars = scrollbarPref !== "visible";

  const tree = (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable}${hideScrollbars ? " scrollbars-hidden" : ""}`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );

  // In demo mode we skip ClerkProvider entirely so its client runtime
  // doesn't try to redirect unauthenticated visitors to Clerk's hosted
  // Account Portal (close-calf-26.clerk.accounts.dev), which breaks the
  // Claude preview panel and any localhost-only browser.
  if (!AUTH_ENABLED) {
    return tree;
  }

  return <ClerkProvider>{tree}</ClerkProvider>;
}
