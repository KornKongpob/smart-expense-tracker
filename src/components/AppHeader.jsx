// src/components/AppHeader.jsx
import React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "../utils/cn";

/**
 * AppHeader
 * - Sticky + safe-area aware
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
  return (
    <header
      className={cn(
        "sticky top-0 z-30",
        "pt-safe",
        "bg-white/55 backdrop-blur-2xl",
        "border-b border-white/30",
        className
      )}
    >
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {left ? (
              <div className="shrink-0 mt-0.5">{left}</div>
            ) : onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className={
                  "ui-icon-btn mt-0.5 shrink-0 " +
                  "focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/40"
                }
              >
                <ChevronLeft size={18} />
              </button>
            ) : null}

            <div className="min-w-0">
              <h1 className="text-[20px] leading-tight font-black text-gray-900 tracking-tight truncate">
                {title || ""}
              </h1>
              {subtitle ? (
                <div className="mt-0.5 text-[12px] font-bold text-gray-700/70 truncate">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>

          {right ? <div className="shrink-0 flex items-center gap-2">{right}</div> : null}
        </div>
      </div>
    </header>
  );
}
