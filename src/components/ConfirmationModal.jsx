// src/components/ConfirmationModal.jsx
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, X } from "lucide-react";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

export default function ConfirmationModal({
  isOpen,
  title = "ยืนยัน",
  message = "",
  onConfirm,
  onCancel,
  isDestructive = false,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
}) {
  const titleId = useId();
  const descId = useId();
  const confirmBtnRef = useRef(null);

  useLockBodyScroll(isOpen);

  // ✅ UX: focus primary action when opened + allow ESC to close
  useEffect(() => {
    if (!isOpen) return;

    const t = window.setTimeout(() => confirmBtnRef.current?.focus?.(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onConfirm?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  const tone = isDestructive
    ? {
        pill: "bg-red-500/10 border-red-500/15 text-red-700",
        confirm:
          "bg-red-600/90 hover:bg-red-600 text-white border border-white/35 shadow-[0_18px_36px_rgba(220,38,38,0.20)] focus-visible:ring-red-300/40",
      }
    : {
        pill: "bg-indigo-500/10 border-indigo-500/15 text-indigo-700",
        confirm:
          "bg-gradient-to-tr from-indigo-600/95 to-purple-600/95 text-white border border-white/35 shadow-[0_18px_36px_rgba(99,102,241,0.28)] focus-visible:ring-indigo-300/40",
      };

  const modal = (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="close modal backdrop"
        onClick={onCancel}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
      />

      {/* Card */}
      <div className="relative w-full max-w-sm pointer-events-auto">
        <div className="ui-card-strong rounded-3xl p-5 shadow-[0_28px_70px_-40px_rgba(0,0,0,0.65)]">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={[
                  "w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0",
                  tone.pill,
                ].join(" ")}
              >
                <AlertCircle size={22} />
              </div>

              <div className="min-w-0">
                <h3
                  id={titleId}
                  className={[
                    "text-lg font-semibold tracking-tight",
                    isDestructive ? "text-red-700" : "text-gray-900",
                  ].join(" ")}
                >
                  {title}
                </h3>
                <p
                  id={descId}
                  className="text-sm text-gray-900/65 mt-1 break-words whitespace-pre-wrap"
                >
                  {message}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="ui-icon-btn"
              aria-label="close"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            <button type="button" onClick={onCancel} data-testid="confirm-cancel" className="ui-btn ui-btn-secondary flex-1">
              {cancelText}
            </button>

            <button
              ref={confirmBtnRef}
              type="button"
              onClick={onConfirm}
              data-testid="confirm-accept"
              className={[
                "ui-btn flex-1",
                "focus-visible:ring-4",
                tone.confirm,
              ].join(" ")}
            >
              {confirmText}
            </button>
          </div>

          <div className="mt-3 text-[11px] text-gray-900/45">
            กด <span className="font-semibold">Esc</span> เพื่อปิด • กด{" "}
            <span className="font-semibold">Enter</span> เพื่อยืนยัน
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
