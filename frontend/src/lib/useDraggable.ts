"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DragPosition {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  initial?: DragPosition;
  storageKey?: string;
  disabled?: boolean;
  width: number;
  height: number;
}

interface UseDraggableResult {
  position: DragPosition | null;
  setPosition: (p: DragPosition | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  dragging: boolean;
  reset: () => void;
}

function loadStored(key: string): DragPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DragPosition;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function storePosition(key: string | undefined, pos: DragPosition): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function clampToViewport(p: DragPosition, w: number): DragPosition {
  if (typeof window === "undefined") return p;
  const margin = 16;
  const minVisible = 80;
  const maxX = window.innerWidth - minVisible;
  const maxY = window.innerHeight - minVisible;
  return {
    x: Math.max(margin - (w - minVisible), Math.min(maxX, p.x)),
    y: Math.max(margin, Math.min(maxY, p.y)),
  };
}

export function useDraggable({
  initial,
  storageKey,
  disabled,
  width,
  height,
}: UseDraggableOptions): UseDraggableResult {
  const [position, setPosition] = useState<DragPosition | null>(() => {
    if (storageKey) {
      const stored = loadStored(storageKey);
      if (stored) return stored;
    }
    return initial ?? null;
  });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ pointerX: number; pointerY: number; origX: number; origY: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      // Snapshot the popup's actual top-left so the first frame doesn't jump
      // when the user starts dragging from a CSS-positioned (right/bottom) origin.
      const parentRect = (target.closest("[data-drag-root]") as HTMLElement | null)?.getBoundingClientRect();
      const origX = parentRect?.left ?? rect.left;
      const origY = parentRect?.top ?? rect.top;
      startRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        origX,
        origY,
      };
      setPosition({ x: origX, y: origY });
      setDragging(true);
      target.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [disabled],
  );

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.pointerX;
      const dy = e.clientY - startRef.current.pointerY;
      const next = clampToViewport(
        { x: startRef.current.origX + dx, y: startRef.current.origY + dy },
        width,
      );
      setPosition(next);
    }
    function onUp() {
      setDragging(false);
      startRef.current = null;
      if (storageKey) {
        setPosition((cur) => {
          if (cur) storePosition(storageKey, cur);
          return cur;
        });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, storageKey, width, height]);

  const reset = useCallback(() => {
    setPosition(null);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return { position, setPosition, onPointerDown, dragging, reset };
}
