// src/components/ModalShell.jsx
// Shared modal shell component used across BudgetsView, RecurringView, RulesView, CategoriesView, StatsView.
// Centralizes the glass-card bottom-sheet pattern to eliminate duplication.
// Uses createPortal to render at <body> level so CSS transforms on parent views
// (e.g. animate-view-enter) don't trap the fixed-position modal in a stacking context.

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

/**
 * ModalShell
 * @param {string}  title       - Modal header title
 * @param {React.ReactNode} children - Modal body content
 * @param {function} onClose    - Close callback
 * @param {boolean}  [isOpen]   - Optional open state (for useLockBodyScroll). Default true.
 * @param {string}   [maxWidth] - Tailwind max-width class. Default "sm:max-w-md"
 * @param {number}   [zIndex]   - z-index level. Default 60
 * @param {string}   [maxHeight]- Tailwind max-height. Default "max-h-[90dvh]"
 * @param {boolean}  [noScroll] - If true, children wrapper won't scroll (for modals managing own scroll)
 */
export default function ModalShell({
  title,
  children,
  onClose,
  isOpen = true,
  maxWidth = "sm:max-w-md",
  zIndex = 60,
  maxHeight = "max-h-[90dvh]",
  noScroll = false,
}) {
  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center animate-fade-in-up"
      style={{ zIndex }}
    >
      <div
        className={`w-full ${maxWidth} glass-card rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 ${maxHeight} overflow-hidden relative flex flex-col`}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
            aria-label="close"
            title="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col min-w-0 ${noScroll ? "" : "overflow-y-auto"}`}>
          {children}
        </div>

        {noScroll ? null : <div className="h-3 pb-safe shrink-0" />}
      </div>
    </div>,
    document.body
  );
}
