"use client";

import { useState, useTransition, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getOldestIntakeLead, logIntakeCall } from "@/app/actions/leads";

type LeadContext = Awaited<ReturnType<typeof getOldestIntakeLead>>;

const SCRIPT_SECTIONS = [
  {
    title: "Intro",
    body: "Hi, this is [your name] calling from Hogan Smith Law about your recent inquiry. Is now still a good time to talk?",
  },
  {
    title: "Needs",
    body: "I have a few quick questions so we can figure out how we can help: what condition is keeping you from working, and when did it start affecting your job?",
  },
  {
    title: "Next steps",
    body: "Great — I'll get a retainer over to you today. You can sign it electronically. If you have any questions before it arrives, just call this line back.",
  },
] as const;

/**
 * Intake Floor · Welcome-call quick action.
 *
 * Picks the oldest actionable intake lead on open, shows a read-only call
 * script, and lets the intake rep log the call outcome via `logIntakeCall`
 * (audit-log entry + lead `lastContactedAt` bump).
 */
export function IntakeWelcomeCallDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<LeadContext>(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  // Ref mirror for the timer so logged duration reflects the moment "End
  // call" was clicked, not whatever the transition closure captured.
  const startedAtRef = useRef<number | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLoadingLead(true);
      try {
        const top = await getOldestIntakeLead();
        setLead(top);
      } catch {
        setLead(null);
      } finally {
        setLoadingLead(false);
      }
    } else {
      setLead(null);
      setCallStartedAt(null);
      startedAtRef.current = null;
    }
  }

  function handleStartCall() {
    const now = Date.now();
    setCallStartedAt(now);
    startedAtRef.current = now;
  }

  function handleEndCall(outcome: "successful" | "no_answer") {
    if (!lead) return;
    const started = startedAtRef.current;
    const durationSeconds = started
      ? Math.max(0, Math.round((Date.now() - started) / 1000))
      : 0;
    startTransition(async () => {
      try {
        const result = await logIntakeCall(lead.id, outcome, durationSeconds);
        if (result.success) {
          toast.success(result.message ?? "Call logged");
          router.refresh();
          setOpen(false);
        } else {
          toast.error(result.message ?? "Could not log call");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not log call");
      }
    });
  }

  const callInProgress = callStartedAt !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome call</DialogTitle>
          <DialogDescription>
            {loadingLead
              ? "Finding the oldest actionable lead…"
              : lead
                ? `Calling ${lead.firstName} ${lead.lastName}${lead.phone ? ` · ${lead.phone}` : ""}`
                : "No actionable intake leads right now — nothing to call."}
          </DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="grid gap-3 py-2">
            {SCRIPT_SECTIONS.map((section) => (
              <div
                key={section.title}
                className="rounded-md border border-border bg-[#FAFAFB] p-3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {section.title}
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {lead && !callInProgress && (
            <Button onClick={handleStartCall} disabled={pending}>
              Start call
            </Button>
          )}
          {lead && callInProgress && (
            <>
              <Button
                variant="outline"
                onClick={() => handleEndCall("no_answer")}
                disabled={pending}
              >
                End call — no answer
              </Button>
              <Button
                onClick={() => handleEndCall("successful")}
                disabled={pending}
              >
                End call — successful
              </Button>
            </>
          )}
          {!lead && (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
