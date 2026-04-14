"use server";

import { requireSession } from "@/lib/auth/session";
import { advanceSupervisorEvent } from "@/lib/services/supervisor-events";
import { revalidatePath } from "next/cache";

export async function resolveEventAction(formData: FormData) {
  const session = await requireSession();
  const eventId = String(formData.get("eventId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!eventId || !caseId) return;
  await advanceSupervisorEvent(eventId, "resolved", {
    at: new Date().toISOString(),
    status: "resolved",
    by: session.id,
    note: "Marked resolved from timeline",
  });
  revalidatePath(`/cases/${caseId}/supervisor-timeline`);
}

export async function dismissEventAction(formData: FormData) {
  const session = await requireSession();
  const eventId = String(formData.get("eventId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!eventId || !caseId) return;
  await advanceSupervisorEvent(eventId, "dismissed", {
    at: new Date().toISOString(),
    status: "dismissed",
    by: session.id,
    note: "Dismissed from timeline",
  });
  revalidatePath(`/cases/${caseId}/supervisor-timeline`);
}
