// src/components/ModalShell.jsx
// Shared modal shell component used across legacy views.

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

/**
 * ModalShell
 * @param {string} title
 * @param {string} [description]
 * @param {React.ReactNode} children
 * @param {function} onClose
 * @param {boolean} [isOpen]
 * @param {string} [maxWidth]
 * @param {number} [zIndex]
 * @param {string} [maxHeight]
 * @param {boolean} [noScroll]
 * @param {string} [panelClassName]
 * @param {string} [bodyClassName]
 */
export default function ModalShell({
  title,
  description,
  children,
  onClose,
  isOpen = true,
  maxWidth = "sm:max-w-md",
  zIndex = 100,
  maxHeight = "max-h-[90dvh]",
  noScroll = false,
  panelClassName = "",
  bodyClassName = "",
}) {
  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center animate-fade-in-up overscroll-none"
      style={{
        zIndex,
        paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom) + var(--keyboard-inset, 0px))",
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className={`w-full ${maxWidth} glass-card rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 ${maxHeight} overflow-hidden relative flex flex-col ${panelClassName}`.trim()}
        style={{
          touchAction: "pan-y",
          maxHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1.5rem - var(--keyboard-inset, 0px))",
        }}
      >
        <div className="mb-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              {description ? (
                <div className="mt-1 text-xs font-semibold leading-relaxed text-gray-800/65">
                  {description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center shrink-0"
              aria-label="close"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col min-w-0 ${noScroll ? "" : "overflow-y-auto"} ${bodyClassName}`.trim()}>
          {children}
        </div>

        {noScroll ? null : <div className="h-3 pb-safe shrink-0" />}
      </div>
    </div>,
    document.body
  );
}
