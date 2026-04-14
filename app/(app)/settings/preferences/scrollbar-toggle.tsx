"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setScrollbarPreference } from "@/app/actions/preferences";

type Props = {
  initialVisible: boolean;
};

export function ScrollbarToggle({ initialVisible }: Props) {
  const [visible, setVisible] = React.useState(initialVisible);
  const [saving, setSaving] = React.useState(false);
  const router = useRouter();

  async function handleChange(checked: boolean) {
    setVisible(checked);
    setSaving(true);
    try {
      await setScrollbarPreference(checked);
      // Apply the class immediately so the user sees the change without a full reload
      if (checked) {
        document.documentElement.classList.remove("scrollbars-hidden");
      } else {
        document.documentElement.classList.add("scrollbars-hidden");
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-[#EAEAEA] bg-white p-4">
      <div className="min-w-0">
        <Label
          htmlFor="pref-scrollbars"
          className="text-[14px] font-medium text-[#171717]"
        >
          Show scrollbars
        </Label>
        <p className="mt-0.5 text-[12px] text-[#666]">
          When disabled, scrollbars are hidden across the app while keeping
          scroll functionality intact. Enable to restore visible scrollbars.
        </p>
      </div>
      <Switch
        id="pref-scrollbars"
        checked={visible}
        onCheckedChange={handleChange}
        disabled={saving}
      />
    </div>
  );
}
