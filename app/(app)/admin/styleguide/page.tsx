import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design System",
};

export default function StyleguidePage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <iframe
        src="/api/styleguide"
        className="w-full h-full border-0"
        title="CaseFlow Design System"
      />
    </div>
  );
}
