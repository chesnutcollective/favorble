import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getScrollbarPreference } from "@/app/actions/preferences";
import { ScrollbarToggle } from "./scrollbar-toggle";

export const metadata: Metadata = {
  title: "Display preferences",
};

export default async function PreferencesPage() {
  const scrollbarsVisible = await getScrollbarPreference();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Display preferences"
        description="Customize how Favorble looks and feels."
      />

      <Card>
        <CardContent className="p-6">
          <div className="text-[12px] font-medium text-[#666] uppercase tracking-[0.05em] mb-4">
            Appearance
          </div>
          <ScrollbarToggle initialVisible={scrollbarsVisible} />
        </CardContent>
      </Card>
    </div>
  );
}
