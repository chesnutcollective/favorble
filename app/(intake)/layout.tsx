import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Client Intake — Hogan Smith",
  description:
    "Secure intake form for prospective Social Security Disability clients.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function IntakeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${dmSans.variable} min-h-screen bg-[#f7f7f9] text-foreground`}
      style={{ fontFamily: "var(--font-dm-sans)" }}
    >
      {children}
    </div>
  );
}
