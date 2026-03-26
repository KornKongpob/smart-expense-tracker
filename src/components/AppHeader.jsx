// src/components/AppHeader.jsx
import React, { useLayoutEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "../utils/cn";

/**
 * AppHeader
 * - Fixed (locked) + safe-area aware
 * - Consistent spacing + typography
 * - Optional back button OR custom left slot (for close/FAB flows)
 * - Optional right actions slot
 */
export default function AppHeader({
  title,
  subtitle,
  onBack,
  left,
  right,
  className,
}) {
  const headerRef = useRef(null);

  // "Lock" the header across all pages (always visible while scrolling).
  // We use `position: fixed` for maximum reliability (sticky can break inside
  // certain overflow/scroll containers on mobile browsers).
  // A dynamic spacer is inserted so content never overlaps under the header.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const setHeightVar = () => {
      const h = Math.ceil(el.getBoundingClientRect().height || 0);
      if (h > 0) document.documentElement.style.setProperty("--app-header-h", `${h}px`);
    };

    setHeightVar();

    let ro;
    try {
      ro = new ResizeObserver(() => setHeightVar());
      ro.observe(el);
    } catch {
      // older browsers: ignore
    }

    window.addEventListener("resize", setHeightVar);
    return () => {
      window.removeEventListener("resize", setHeightVar);
      ro?.disconnect?.();
    };
  }, [title, subtitle]);

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          "fixed inset-x-0 top-0 z-40 bg-white border-b",
          "pt-safe",
          className
        )}
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mx-auto max-w-[1180px] px-4 py-2.5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {left ? (
                <div className="shrink-0">{left}</div>
              ) : onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back"
                  className="ui-icon-btn shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
                >
                  <ChevronLeft size={18} />
                </button>
              ) : null}

              <div className="min-w-0">
                <h1 className="truncate text-lg leading-tight font-semibold" style={{ color: "var(--text)" }}>
                  {title || ""}
                </h1>
                {subtitle ? (
                  <div className="truncate text-[13px] font-normal" style={{ color: "var(--muted)" }}>
                    {subtitle}
                  </div>
                ) : null}
              </div>
            </div>

            {right ? <div className="shrink-0 flex items-center gap-2">{right}</div> : null}
          </div>
        </div>
      </header>

      {/* Spacer: prevents content from being hidden behind the fixed header */}
      <div aria-hidden style={{ height: "var(--app-header-h, 76px)" }} />
    </>
  );
}
