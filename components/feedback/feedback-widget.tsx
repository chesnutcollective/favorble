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

/**
 * Inline screenshot preview shown inside the feedback dialog. Click to
 * zoom; if a pin was set, overlays a red marker at the pinned coords
 * (positioned by % of intrinsic dimensions so it scales correctly).
 */
function ScreenshotPreview({
  screenshot,
  pin,
  onZoom,
  onRemove,
}: {
  screenshot: Screenshot;
  pin: PinnedElement | null;
  onZoom: () => void;
  onRemove: () => void;
}) {
  const overlays = computePinOverlays(pin, screenshot);

  return (
    <div className="relative flex justify-center overflow-hidden rounded-md border">
      <button
        type="button"
        onClick={onZoom}
        className="relative inline-block"
        aria-label="View screenshot at full size"
      >
        <Image
          src={`data:image/jpeg;base64,${screenshot.base64}`}
          alt="Screenshot preview — click to zoom"
          width={screenshot.width}
          height={screenshot.height}
          className="block h-auto max-h-40 w-auto cursor-zoom-in"
          style={{ maxWidth: "100%" }}
          unoptimized
        />
        {overlays.outline && (
          <span
            className="pointer-events-none absolute"
            style={{
              ...overlays.outline,
              outline: "2px solid #d1453b",
              outlineOffset: "-1px",
              borderRadius: "2px",
              background: "rgba(209,69,59,0.10)",
            }}
          />
        )}
        {overlays.dot && (
          <span
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
            style={{ ...overlays.dot, background: "#d1453b" }}
          />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
        aria-label="Remove screenshot"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} />
      </button>
    </div>
  );
}

function computePinOverlays(
  pin: PinnedElement | null,
  screenshot: Screenshot,
): {
  dot: { left: string; top: string } | null;
  outline: { left: string; top: string; width: string; height: string } | null;
} {
  if (!pin || screenshot.width <= 0 || screenshot.height <= 0) {
    return { dot: null, outline: null };
  }
  const dot = {
    left: `${(pin.clickX / screenshot.width) * 100}%`,
    top: `${(pin.clickY / screenshot.height) * 100}%`,
  };
  const outline = pin.rect
    ? {
        left: `${(pin.rect.left / screenshot.width) * 100}%`,
        top: `${(pin.rect.top / screenshot.height) * 100}%`,
        width: `${(pin.rect.width / screenshot.width) * 100}%`,
        height: `${(pin.rect.height / screenshot.height) * 100}%`,
      }
    : null;
  return { dot, outline };
}

/**
 * Centered loading card shown while a pixel-perfect screenshot is being
 * captured server-side. Lives at z-index above the FAB; tagged
 * `data-feedback-widget="true"` so the snapshot serializer hides it during
 * the brief DOM-serialization phase. Visible to the user during the slow
 * (1-10s) headless-Chromium render phase.
 */
function CaptureProgressOverlay() {
  return (
    <div
      data-feedback-widget="true"
      className="fixed inset-0 z-[9999999] flex items-center justify-center"
      style={{ background: "rgba(15,15,20,0.45)", backdropFilter: "blur(2px)" }}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex w-[320px] max-w-[90vw] flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 text-center shadow-2xl"
      >
        <span
          className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: "#263c94", borderTopColor: "transparent" }}
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: "#18181a" }}>
            Capturing pixel-perfect screenshot
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "#8b8b97" }}>
            Rendering your page in headless Chromium so Claude sees exactly
            what you see. The first one can take 5-10 seconds.
          </p>
        </div>
      </div>
    </div>
  );
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [pin, setPin] = useState<PinnedElement | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [captureRequested, setCaptureRequested] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const { captureScreenshot, isCapturing, error: captureError, clearError } =
    useScreenshot();
  const showCaptureOverlay = captureRequested || isCapturing;
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
    clearError();
    setCaptureRequested(true);
    // Close the dialog first so the widget doesn't end up in the screenshot,
    // capture, then reopen.
    setOpen(false);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const result = await captureScreenshot();
      setOpen(true);
      if (result) {
        setScreenshot(result);
      }
      // On failure, error stays in `captureError` and the widget renders a
      // visible retry banner — no toast needed.
    } finally {
      setCaptureRequested(false);
    }
  }

  function handleAnnotateClick() {
    setOpen(false);
    setIsAnnotating(true);
  }

  async function handlePinSelected(selected: PinnedElement) {
    setPin(selected);
    setIsAnnotating(false);
    clearError();
    setCaptureRequested(true);
    try {
      // Also capture a screenshot of the page they were just looking at —
      // gives Claude visual context for the pinned element. Loading overlay
      // shows while this runs.
      const result = await captureScreenshot();
      setOpen(true);
      if (result) {
        setScreenshot(result);
      }
      // On failure, the retry banner inside the reopened dialog surfaces it.
    } finally {
      setCaptureRequested(false);
    }
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

    // Pixel-perfect server-side screenshot is required for submit. If none
    // has been captured yet, capture now (blocking). On failure, abort the
    // submit — the user sees the inline error/retry banner and can decide
    // what to do.
    let finalScreenshot = screenshot;
    if (!finalScreenshot) {
      setCaptureRequested(true);
      setOpen(false);
      await new Promise((r) => setTimeout(r, 300));
      try {
        finalScreenshot = await captureScreenshot();
      } finally {
        setCaptureRequested(false);
      }
      setOpen(true);
      if (!finalScreenshot) {
        // Error is already surfaced via the retry banner.
        return;
      }
      setScreenshot(finalScreenshot);
    }

    const context: Record<string, unknown> = {};
    if (finalScreenshot) context.screenshot = finalScreenshot;
    if (transcript.trim()) context.voiceTranscript = transcript.trim();
    if (pin) context.pin = pin;
    if (typeof window !== "undefined") {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
      context.browser = {
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        devicePixelRatio: window.devicePixelRatio || 1,
        theme: isDark ? "dark" : "light",
        locale: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

      {showCaptureOverlay && <CaptureProgressOverlay />}

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
        <DialogContent
          data-feedback-widget="true"
          className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md"
        >
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                Help improve Favorble — report a bug, request a feature, or share
                an idea.
              </DialogDescription>
            </DialogHeader>
            <div className="min-w-0 flex-1 space-y-4 overflow-y-auto py-4">
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

              {/* Capture progress / error / preview */}
              {isCapturing && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>
                    Capturing pixel-perfect screenshot… (this can take a few seconds)
                  </span>
                </div>
              )}
              {!isCapturing && captureError && (
                <div
                  className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
                  style={{
                    borderColor: "#d1453b",
                    background: "rgba(209,69,59,0.08)",
                    color: "#d1453b",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Screenshot failed</p>
                    <p className="mt-0.5 break-words text-[11px]">
                      {captureError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureClick}
                    className="shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold"
                    style={{ borderColor: "#d1453b" }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!isCapturing && !captureError && screenshot && (
                <ScreenshotPreview
                  screenshot={screenshot}
                  pin={pin}
                  onZoom={() => setZoomOpen(true)}
                  onRemove={() => setScreenshot(null)}
                />
              )}

              {/* Pin preview */}
              {pin && (
                <div className="flex min-w-0 items-start gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
                  <HugeiconsIcon
                    icon={Target02Icon}
                    size={14}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="line-clamp-2 break-words font-medium">
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

      {/* Full-size screenshot zoom */}
      {screenshot && (
        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent
            data-feedback-widget="true"
            className="max-w-5xl"
          >
            <DialogHeader>
              <DialogTitle className="text-sm">Screenshot preview</DialogTitle>
              <DialogDescription className="text-xs">
                Captured at {screenshot.width}×{screenshot.height}
                {pin ? " · pin marker shown in red" : ""}.
              </DialogDescription>
            </DialogHeader>
            <ZoomedScreenshot screenshot={screenshot} pin={pin} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function ZoomedScreenshot({
  screenshot,
  pin,
}: {
  screenshot: Screenshot;
  pin: PinnedElement | null;
}) {
  const overlays = computePinOverlays(pin, screenshot);

  return (
    <div className="relative">
      <Image
        src={`data:image/jpeg;base64,${screenshot.base64}`}
        alt="Submitted screenshot at full size"
        width={screenshot.width}
        height={screenshot.height}
        className="h-auto w-full object-contain"
        unoptimized
      />
      {overlays.outline && (
        <span
          className="pointer-events-none absolute"
          style={{
            ...overlays.outline,
            outline: "2px solid #d1453b",
            outlineOffset: "-1px",
            borderRadius: "2px",
            background: "rgba(209,69,59,0.10)",
          }}
        />
      )}
      {overlays.dot && (
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
          style={{ ...overlays.dot, background: "#d1453b" }}
        />
      )}
    </div>
  );
}
