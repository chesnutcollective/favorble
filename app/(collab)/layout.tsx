import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "External access — Hogan Smith Law",
  description: "Scoped, read-only case view for authorized collaborators.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CollabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${dmSans.variable} min-h-screen bg-[#f7f7f9] text-foreground`}
      style={{ fontFamily: "var(--font-dm-sans)" }}
    >
      <header className="border-b border-[#EAEAEA] bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Hogan Smith Law</p>
            <p className="text-xs text-muted-foreground">External access</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
