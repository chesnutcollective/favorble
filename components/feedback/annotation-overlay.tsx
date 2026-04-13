"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type PinnedElement = {
  selector: string;
  text: string;
  clickX: number;
  clickY: number;
};

function getCssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && parts.length < 8) {
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const tag = node.tagName.toLowerCase();
    const classes = Array.from(node.classList).slice(0, 2).join(".");
    parts.unshift(classes ? `${tag}.${classes}` : tag);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function isWidgetDescendant(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.getAttribute?.("data-feedback-widget") === "true") return true;
    node = node.parentElement;
  }
  return false;
}

export function AnnotationOverlay({
  onSelect,
  onCancel,
}: {
  onSelect: (pin: PinnedElement) => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  function handleMove(e: React.MouseEvent) {
    const overlay = e.currentTarget as HTMLElement;
    overlay.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "auto";
    if (!el || isWidgetDescendant(el)) {
      setHoverRect(null);
      return;
    }
    setHoverRect(el.getBoundingClientRect());
  }

  function handleClick(e: React.MouseEvent) {
    const overlay = e.currentTarget as HTMLElement;
    overlay.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "auto";
    if (!el || isWidgetDescendant(el)) return;

    const text = (el.textContent ?? "").trim().slice(0, 200);
    onSelect({
      selector: getCssPath(el),
      text,
      clickX: Math.round(e.clientX),
      clickY: Math.round(e.clientY),
    });
  }

  if (!mounted) return null;

  return createPortal(
    <div
      data-feedback-widget="true"
      onMouseMove={handleMove}
      onClick={handleClick}
      className="fixed inset-0 z-[99999] cursor-crosshair"
      style={{ background: "rgba(38,60,148,0.05)" }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
      >
        Click any element to pin it · ESC to cancel
      </div>
      {hoverRect && (
        <div
          className="pointer-events-none absolute rounded-sm"
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
            outline: "2px dashed #263c94",
            background: "rgba(38,60,148,0.1)",
          }}
        />
      )}
    </div>,
    document.body,
  );
}
