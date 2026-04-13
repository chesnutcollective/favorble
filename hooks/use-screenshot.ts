"use client";

import { useState, useCallback } from "react";
import { toJpeg } from "html-to-image";

type CaptureResult = {
  base64: string; // no "data:image/jpeg;base64," prefix
  width: number;
  height: number;
} | null;

export function useScreenshot() {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureScreenshot = useCallback(async (): Promise<CaptureResult> => {
    if (typeof document === "undefined") return null;
    setIsCapturing(true);
    try {
      const target =
        (document.querySelector("main") as HTMLElement | null) ||
        document.body;

      const dataUrl = await toJpeg(target, {
        quality: 0.8,
        pixelRatio: 1,
        cacheBust: true,
        skipFonts: true,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return node.getAttribute("data-feedback-widget") !== "true";
        },
      });

      const prefix = "data:image/jpeg;base64,";
      const base64 = dataUrl.startsWith(prefix)
        ? dataUrl.slice(prefix.length)
        : dataUrl;

      return {
        base64,
        width: target.clientWidth,
        height: target.clientHeight,
      };
    } catch {
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return { captureScreenshot, isCapturing };
}
