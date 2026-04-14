import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getMyNotificationPreferences } from "@/app/actions/notification-preferences";
import { NotificationPreferencesForm } from "./notification-preferences-form";

export const metadata: Metadata = {
  title: "Notification preferences",
};

/**
 * Supervisor event types users can mute from the preferences UI.
 * Kept in sync with `supervisorEventTypeEnum` in db/schema/enums.ts —
 * hardcoded here so the server-component can render without an enum
 * round-trip. If the enum grows, update this list.
 */
export const MUTABLE_EVENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "denial_received", label: "Denial received" },
  { value: "unfavorable_decision", label: "Unfavorable decision" },
  { value: "favorable_decision", label: "Favorable decision" },
  { value: "hearing_scheduled", label: "Hearing scheduled" },
  { value: "hearing_rescheduled", label: "Hearing rescheduled" },
  {
    value: "appeal_deadline_approaching",
    label: "Appeal deadline approaching",
  },
  { value: "appeal_window_opened", label: "Appeal window opened" },
  { value: "new_medical_evidence", label: "New medical evidence" },
  { value: "fee_awarded", label: "Fee awarded" },
  { value: "rfc_received", label: "RFC received" },
  { value: "mr_complete", label: "Medical records complete" },
  { value: "missed_task_deadline", label: "Missed task deadline" },
  { value: "stagnant_case", label: "Stagnant case" },
  { value: "workload_imbalance", label: "Workload imbalance" },
  { value: "ssa_status_change", label: "SSA status change" },
  { value: "client_message_received", label: "Client message received" },
  { value: "client_sentiment_risk", label: "Client sentiment risk" },
  { value: "compliance_violation", label: "Compliance violation" },
];

export default async function NotificationSettingsPage() {
  const prefs = await getMyNotificationPreferences();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification preferences"
        description="Choose how and when Favorble pings you."
      />

      <Card>
        <CardContent className="p-6">
          <NotificationPreferencesForm
            initial={prefs}
            mutableEventTypes={MUTABLE_EVENT_TYPES}
          />
        </CardContent>
      </Card>
    </div>
  );
}
