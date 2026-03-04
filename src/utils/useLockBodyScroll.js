// src/utils/useLockBodyScroll.js
import { useEffect } from "react";

/**
 * useLockBodyScroll
 * - Prevent background scroll when a modal/bottom-sheet is open.
 * - Handles nested modals safely.
 * - Uses position:fixed trick for iOS Safari (overflow:hidden alone doesn't work on iOS).
 * - Preserves scroll position across lock/unlock.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedStyles = null;

function getScrollbarWidth() {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const w = window.innerWidth || 0;
  const cw = document.documentElement?.clientWidth || 0;
  return Math.max(0, w - cw);
}

export function useLockBodyScroll(locked) {
  useEffect(() => {
    if (!locked) return;
    if (typeof document === "undefined") return;

    lockCount += 1;
    if (lockCount === 1) {
      const body = document.body;
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      savedStyles = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        paddingRight: body.style.paddingRight,
        width: body.style.width,
      };

      const sw = getScrollbarWidth();
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      if (sw > 0) body.style.paddingRight = `${sw}px`;
    }

    return () => {
      if (typeof document === "undefined") return;
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && savedStyles) {
        const body = document.body;
        body.style.overflow = savedStyles.overflow;
        body.style.position = savedStyles.position;
        body.style.top = savedStyles.top;
        body.style.left = savedStyles.left;
        body.style.right = savedStyles.right;
        body.style.width = savedStyles.width;
        body.style.paddingRight = savedStyles.paddingRight;
        savedStyles = null;
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [locked]);
}
