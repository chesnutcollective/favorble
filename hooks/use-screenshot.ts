"use client";

import { useState, useCallback } from "react";
import { snapshot } from "rrweb-snapshot";

export type CaptureResult = {
  base64: string;
  width: number;
  height: number;
};

export function useScreenshot() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureScreenshot = useCallback(async (): Promise<CaptureResult | null> => {
    if (typeof document === "undefined") return null;
    setIsCapturing(true);
    setError(null);

    // Hide widget elements during snapshot so they don't appear in the capture
    const widgets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-feedback-widget="true"]'),
    );
    const previousDisplay = widgets.map((w) => w.style.display);
    widgets.forEach((w) => {
      w.style.display = "none";
    });

    try {
      // Wait for fonts to settle so the serialized snapshot embeds them.
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // ignore — proceed with whatever's loaded
        }
      }

      const serialized = snapshot(document, {
        // Inline external stylesheets, images, and fonts so the server-side
        // render is fully self-contained — no network fetches needed.
        inlineStylesheet: true,
        inlineImages: true,
        recordCanvas: false,
        // Block selector lets rrweb mask elements; we already hid the widget
        // via display:none above, so this is belt-and-suspenders.
        blockSelector: '[data-feedback-widget="true"]',
      } as Parameters<typeof snapshot>[1]);

      if (!serialized) {
        setError("Failed to serialize page");
        return null;
      }

      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const dpr = window.devicePixelRatio || 1;
      const userAgent = navigator.userAgent;
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(userAgent);
      const scrollY = window.scrollY;

      const response = await fetch("/api/feedback/render-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: serialized,
          viewport,
          dpr,
          userAgent,
          isMobile,
          scrollY,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        const message =
          data.error ?? `Server returned ${response.status}`;
        setError(message);
        return null;
      }

      const data = (await response.json()) as CaptureResult;
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Capture failed unexpectedly";
      setError(message);
      return null;
    } finally {
      // Restore widget visibility
      widgets.forEach((w, i) => {
        w.style.display = previousDisplay[i];
      });
      setIsCapturing(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { captureScreenshot, isCapturing, error, clearError };
}
