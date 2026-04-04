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
let savedScrollRootState = null;

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
      const scrollRoot = document.querySelector('[data-app-scroll-root="true"]');

      if (scrollRoot instanceof HTMLElement) {
        savedScrollRootState = {
          node: scrollRoot,
          scrollTop: scrollRoot.scrollTop,
          overflow: scrollRoot.style.overflow,
          overscrollBehavior: scrollRoot.style.overscrollBehavior,
          touchAction: scrollRoot.style.touchAction,
        };
        savedStyles = {
          overflow: body.style.overflow,
          position: body.style.position,
          top: body.style.top,
          left: body.style.left,
          right: body.style.right,
          paddingRight: body.style.paddingRight,
          width: body.style.width,
        };
        body.style.overflow = "hidden";
        scrollRoot.style.overflow = "hidden";
        scrollRoot.style.overscrollBehavior = "contain";
        scrollRoot.style.touchAction = "none";
      } else {
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

      body.setAttribute("data-modal-open", "true");
    }

    return () => {
      if (typeof document === "undefined") return;
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && savedStyles) {
        const body = document.body;
        const restoreBody = savedStyles;
        const restoreScrollRoot = savedScrollRootState;
        if (restoreScrollRoot?.node instanceof HTMLElement) {
          restoreScrollRoot.node.style.overflow = restoreScrollRoot.overflow;
          restoreScrollRoot.node.style.overscrollBehavior = restoreScrollRoot.overscrollBehavior;
          restoreScrollRoot.node.style.touchAction = restoreScrollRoot.touchAction;
          restoreScrollRoot.node.scrollTop = restoreScrollRoot.scrollTop;
        }
        body.style.overflow = restoreBody.overflow;
        body.style.position = restoreBody.position;
        body.style.top = restoreBody.top;
        body.style.left = restoreBody.left;
        body.style.right = restoreBody.right;
        body.style.width = restoreBody.width;
        body.style.paddingRight = restoreBody.paddingRight;
        body.removeAttribute("data-modal-open");
        savedStyles = null;
        savedScrollRootState = null;
        if (!(restoreScrollRoot?.node instanceof HTMLElement)) {
          window.scrollTo(0, savedScrollY);
        }
      }
    };
  }, [locked]);
}
