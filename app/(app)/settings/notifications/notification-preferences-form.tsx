"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  updateMyNotificationPreferences,
  type NotificationPreferencesDTO,
} from "@/app/actions/notification-preferences";

type Props = {
  initial: NotificationPreferencesDTO;
  mutableEventTypes: Array<{ value: string; label: string }>;
};

export function NotificationPreferencesForm({
  initial,
  mutableEventTypes,
}: Props) {
  const [emailEnabled, setEmailEnabled] = React.useState(initial.emailEnabled);
  const [smsEnabled, setSmsEnabled] = React.useState(initial.smsEnabled);
  const [pushEnabled, setPushEnabled] = React.useState(initial.pushEnabled);
  const [mutedEventTypes, setMutedEventTypes] = React.useState<string[]>(
    initial.mutedEventTypes ?? [],
  );
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<null | {
    kind: "ok" | "err";
    message: string;
  }>(null);

  function toggleMuted(value: string) {
    setMutedEventTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const result = await updateMyNotificationPreferences({
        emailEnabled,
        smsEnabled,
        pushEnabled,
        mutedEventTypes,
      });
      if (result.ok) {
        setStatus({ kind: "ok", message: "Preferences saved." });
      } else {
        setStatus({
          kind: "err",
          message: result.error ?? "Failed to save preferences.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="text-[12px] font-medium text-[#666] uppercase tracking-[0.05em] mb-4">
          Channels
        </div>
        <div className="space-y-4">
          <ToggleRow
            label="Email"
            description="Receive email notifications via Resend."
            checked={emailEnabled}
            onChange={setEmailEnabled}
            id="pref-email"
          />
          <ToggleRow
            label="SMS"
            description="Receive text messages via Twilio for high-priority alerts."
            checked={smsEnabled}
            onChange={setSmsEnabled}
            id="pref-sms"
          />
          <ToggleRow
            label="Push"
            description="Receive push notifications on mobile devices (when available)."
            checked={pushEnabled}
            onChange={setPushEnabled}
            id="pref-push"
          />
        </div>
      </section>

      <section>
        <div className="text-[12px] font-medium text-[#666] uppercase tracking-[0.05em] mb-1">
          Muted event types
        </div>
        <p className="text-[13px] text-[#666] mb-4">
          In-app notifications always fire. Muting an event type suppresses
          email, SMS, and push for that event.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {mutableEventTypes.map((evt) => {
            const id = `mute-${evt.value}`;
            const checked = mutedEventTypes.includes(evt.value);
            return (
              <label
                key={evt.value}
                htmlFor={id}
                className="flex items-center gap-2 rounded-md border border-[#EAEAEA] bg-white px-3 py-2 cursor-pointer hover:bg-[#FAFAFA] transition-colors"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={() => toggleMuted(evt.value)}
                />
                <span className="text-[13px] text-[#171717]">{evt.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2 border-t border-[#EAEAEA]">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save preferences"}
        </Button>
        {status && (
          <span
            className="text-[12px]"
            style={{ color: status.kind === "ok" ? "#0d8f5c" : "#d4183d" }}
          >
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  id,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-[#EAEAEA] bg-white p-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-[14px] font-medium text-[#171717]">
          {label}
        </Label>
        <p className="mt-0.5 text-[12px] text-[#666]">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
