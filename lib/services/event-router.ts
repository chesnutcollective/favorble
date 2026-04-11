import "server-only";
import { db } from "@/db/drizzle";
import { supervisorEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  advanceSupervisorEvent,
  linkArtifactToEvent,
} from "@/lib/services/supervisor-events";
import {
  draftAppealReconsideration,
  draftAppealsCouncilBrief,
  draftPreHearingBrief,
  draftFeePetition,
  draftClientDenialNotification,
  draftHearingNotification,
  draftClientFavorableNotification,
} from "@/lib/services/event-drafts";

/**
 * Event router (SA-2).
 *
 * Given a supervisor event id, look up the event, determine what
 * responsive artifacts the firm needs, spin up the AI drafts, link the
 * drafts back to the event, and advance the lifecycle status.
 *
 * Mapping:
 *   denial_received       → reconsideration request + client denial letter
 *   unfavorable_decision  → appeals council brief + client denial letter
 *   hearing_scheduled     → pre-hearing brief + client hearing letter
 *   favorable_decision    → fee petition + favorable client letter
 *
 * Callers are expected to invoke this via `after()` from webhooks so
 * drafting latency doesn't block the inbound response.
 */
export async function handleSupervisorEvent(
  eventId: string,
): Promise<{ draftIds: string[] } | null> {
  const [event] = await db
    .select()
    .from(supervisorEvents)
    .where(eq(supervisorEvents.id, eventId))
    .limit(1);

  if (!event) {
    logger.warn("handleSupervisorEvent: event not found", { eventId });
    return null;
  }
  if (!event.caseId) {
    logger.warn("handleSupervisorEvent: event has no caseId", { eventId });
    return null;
  }

  const draftIds: string[] = [];
  const caseId = event.caseId;

  try {
    switch (event.eventType) {
      case "denial_received": {
        const [appealId, clientId] = await Promise.all([
          draftAppealReconsideration({ caseId, eventId }),
          draftClientDenialNotification({ caseId, eventId }),
        ]);
        if (appealId) draftIds.push(appealId);
        if (clientId) draftIds.push(clientId);
        break;
      }
      case "unfavorable_decision": {
        const [acId, clientId] = await Promise.all([
          draftAppealsCouncilBrief({ caseId, eventId }),
          draftClientDenialNotification({ caseId, eventId }),
        ]);
        if (acId) draftIds.push(acId);
        if (clientId) draftIds.push(clientId);
        break;
      }
      case "hearing_scheduled": {
        const [briefId, clientId] = await Promise.all([
          draftPreHearingBrief({ caseId, eventId }),
          draftHearingNotification({ caseId, eventId }),
        ]);
        if (briefId) draftIds.push(briefId);
        if (clientId) draftIds.push(clientId);
        break;
      }
      case "favorable_decision":
      case "fee_awarded": {
        const [feeId, clientId] = await Promise.all([
          draftFeePetition({ caseId, eventId }),
          draftClientFavorableNotification({ caseId, eventId }),
        ]);
        if (feeId) draftIds.push(feeId);
        if (clientId) draftIds.push(clientId);
        break;
      }
      default: {
        logger.info("handleSupervisorEvent: no drafts configured for type", {
          eventId,
          eventType: event.eventType,
        });
        return { draftIds: [] };
      }
    }

    for (const id of draftIds) {
      await linkArtifactToEvent(eventId, "draft", id);
    }

    await advanceSupervisorEvent(eventId, "draft_created", {
      at: new Date().toISOString(),
      status: "draft_created",
      by: "system",
      note: `Auto-drafted ${draftIds.length} artifact(s) in response to ${event.eventType}`,
    });

    logger.info("handleSupervisorEvent drafts created", {
      eventId,
      eventType: event.eventType,
      draftCount: draftIds.length,
    });
    return { draftIds };
  } catch (err) {
    logger.error("handleSupervisorEvent failed", {
      eventId,
      eventType: event.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
    return { draftIds };
  }
}
