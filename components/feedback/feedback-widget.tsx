"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MessageAdd01Icon,
  Camera01Icon,
  Mic01Icon,
  MicOff01Icon,
  Target02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { submitFeedbackAction } from "@/lib/feedback/actions";
import {
  FEEDBACK_CATEGORIES,
  CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/lib/feedback/constants";
import { useScreenshot } from "@/hooks/use-screenshot";
import { useVoiceRecording } from "@/hooks/use-voice-recording";
import {
  AnnotationOverlay,
  type PinnedElement,
} from "./annotation-overlay";

type Screenshot = { base64: string; width: number; height: number };

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [pin, setPin] = useState<PinnedElement | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { captureScreenshot, isCapturing } = useScreenshot();
  const {
    isSupported: voiceSupported,
    isRecording,
    transcript,
    startRecording,
    stopRecording,
    clearTranscript,
  } = useVoiceRecording();

  function resetForm() {
    setCategory("bug");
    setMessage("");
    setScreenshot(null);
    setPin(null);
    clearTranscript();
  }

  async function handleCaptureClick() {
    // Close the dialog first so the widget doesn't end up in the screenshot,
    // capture, then reopen.
    setOpen(false);
    await new Promise((r) => setTimeout(r, 300));
    const result = await captureScreenshot();
    setOpen(true);
    if (result) {
      setScreenshot(result);
    } else {
      toast.error("Could not capture screenshot.");
    }
  }

  function handleAnnotateClick() {
    setOpen(false);
    setIsAnnotating(true);
  }

  function handlePinSelected(selected: PinnedElement) {
    setPin(selected);
    setIsAnnotating(false);
    setOpen(true);
  }

  function handleAnnotateCancel() {
    setIsAnnotating(false);
    setOpen(true);
  }

  function handleVoiceToggle() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  async function submit() {
    const trimmed = message.trim();
    const finalMessage = transcript.trim()
      ? trimmed
        ? `${trimmed}\n\n[Voice note]: ${transcript.trim()}`
        : `[Voice note]: ${transcript.trim()}`
      : trimmed;

    if (!finalMessage) {
      toast.error("Please describe your feedback.");
      return;
    }

    // Auto-capture if no manual screenshot exists
    let finalScreenshot = screenshot;
    if (!finalScreenshot) {
      setOpen(false);
      await new Promise((r) => setTimeout(r, 300));
      finalScreenshot = await captureScreenshot();
      // Don't reopen — we're about to submit
    }

    const context: Record<string, unknown> = {};
    if (finalScreenshot) context.screenshot = finalScreenshot;
    if (transcript.trim()) context.voiceTranscript = transcript.trim();
    if (pin) context.pin = pin;
    if (typeof window !== "undefined") {
      context.browser = {
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      };
      const params = new URL(window.location.href).searchParams;
      const tab = params.get("tab");
      if (tab) context.activeTab = tab;
    }

    startTransition(async () => {
      const result = await submitFeedbackAction({
        message: finalMessage,
        category,
        pageUrl:
          typeof window !== "undefined" ? window.location.href : undefined,
        pageTitle:
          typeof document !== "undefined" ? document.title : undefined,
        context,
      });
      if (result.success) {
        toast.success("Feedback submitted. Thank you!");
        resetForm();
        setOpen(false);
      } else {
        toast.error(result.error ?? "Could not submit feedback");
        setOpen(true); // keep form open on error
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  const busy = isPending || isCapturing;

  return (
    <>
      {isAnnotating && (
        <AnnotationOverlay
          onSelect={handlePinSelected}
          onCancel={handleAnnotateCancel}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        data-feedback-widget="true"
        aria-label="Send feedback"
        title="Send feedback"
        className="fixed bottom-16 right-3 z-[999999] flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
        style={{ backgroundColor: "#263c94" }}
      >
        <HugeiconsIcon icon={MessageAdd01Icon} size={22} />
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent data-feedback-widget="true" className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                Help improve Favorble — report a bug, request a feature, or share
                an idea.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="fb-category">Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as FeedbackCategory)}
                >
                  <SelectTrigger id="fb-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fb-message">
                  Describe your feedback{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="fb-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What happened, what should happen, any steps to reproduce..."
                  rows={4}
                />
                {transcript && (
                  <div className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-[11px]">
                    <span className="font-semibold">Voice note: </span>
                    <span>{transcript}</span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  ⌘+Enter to submit · Sent from{" "}
                  <span className="font-mono">{pathname}</span>
                </p>
              </div>

              {/* Context chips */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCaptureClick}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  title="Capture screenshot of current page"
                >
                  <HugeiconsIcon icon={Camera01Icon} size={14} />
                  {screenshot ? "Re-capture" : "Screenshot"}
                </button>
                <button
                  type="button"
                  onClick={handleAnnotateClick}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  title="Click an element on the page to pin it to this feedback"
                >
                  <HugeiconsIcon icon={Target02Icon} size={14} />
                  {pin ? "Re-pin" : "Pin element"}
                </button>
                {voiceSupported && (
                  <button
                    type="button"
                    onClick={handleVoiceToggle}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    title={isRecording ? "Stop recording" : "Start voice note"}
                    style={
                      isRecording
                        ? { borderColor: "#d1453b", color: "#d1453b" }
                        : undefined
                    }
                  >
                    <HugeiconsIcon
                      icon={isRecording ? MicOff01Icon : Mic01Icon}
                      size={14}
                    />
                    {isRecording ? "Recording…" : "Voice note"}
                  </button>
                )}
              </div>

              {/* Screenshot preview */}
              {screenshot && (
                <div className="relative overflow-hidden rounded-md border">
                  <Image
                    src={`data:image/jpeg;base64,${screenshot.base64}`}
                    alt="Screenshot preview"
                    width={480}
                    height={300}
                    className="h-auto max-h-40 w-full object-contain"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                    aria-label="Remove screenshot"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              )}

              {/* Pin preview */}
              {pin && (
                <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
                  <HugeiconsIcon
                    icon={Target02Icon}
                    size={14}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">
                      {pin.text || "(no visible text)"}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {pin.selector}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPin(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Remove pin"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {isCapturing
                  ? "Capturing..."
                  : isPending
                    ? "Sending..."
                    : "Send feedback"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
