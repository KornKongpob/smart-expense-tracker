// src/utils/useLockBodyScroll.js
import { useEffect } from "react";

/**
 * useLockBodyScroll
 * - Prevent background scroll when a modal/bottom-sheet is open.
 * - Handles nested modals safely.
 * - Adds right padding to avoid layout shift when the scrollbar disappears (desktop).
 */

let lockCount = 0;
let originalOverflow = null;
let originalPaddingRight = null;

function getScrollbarWidth() {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const docEl = document.documentElement;
  const w = window.innerWidth || 0;
  const cw = docEl?.clientWidth || 0;
  return Math.max(0, w - cw);
}

export function useLockBodyScroll(locked) {
  useEffect(() => {
    if (!locked) return;
    if (typeof document === "undefined") return;

    lockCount += 1;
    if (lockCount === 1) {
      const body = document.body;
      // Store original styles once (for nested locks).
      originalOverflow = body.style.overflow;
      originalPaddingRight = body.style.paddingRight;

      const sw = getScrollbarWidth();
      if (sw > 0) body.style.paddingRight = `${sw}px`;
      body.style.overflow = "hidden";
    }

    return () => {
      if (typeof document === "undefined") return;
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        const body = document.body;
        body.style.overflow = originalOverflow ?? "";
        body.style.paddingRight = originalPaddingRight ?? "";
        originalOverflow = null;
        originalPaddingRight = null;
      }
    };
  }, [locked]);
}
