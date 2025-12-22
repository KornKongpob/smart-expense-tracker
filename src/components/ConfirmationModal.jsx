// src/components/ConfirmationModal.jsx
import { useEffect, useId, useRef } from "react";
import { AlertCircle, X } from "lucide-react";

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

  // ✅ UX: focus primary action when opened + allow ESC to close
  useEffect(() => {
    if (!isOpen) return;

    const t = window.setTimeout(() => confirmBtnRef.current?.focus?.(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
      // basic "Enter to confirm" UX (optional)
      if (e.key === "Enter") onConfirm?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onCancel, onConfirm]);

  // ✅ prevent background scroll while modal open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const tone = isDestructive
    ? {
        pill: "bg-red-500/10 border-red-500/15 text-red-700",
        confirm: "bg-red-600/90 shadow-red-200/40 focus-visible:ring-red-300/40",
      }
    : {
        pill: "bg-indigo-500/10 border-indigo-500/15 text-indigo-700",
        confirm:
          "bg-indigo-600/90 shadow-indigo-200/40 focus-visible:ring-indigo-300/40",
      };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      {/* Backdrop (glass) */}
      <button
        type="button"
        aria-label="close modal backdrop"
        onClick={onCancel}
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
      />

      {/* Card */}
      <div className="relative w-full max-w-sm pointer-events-auto">
        <div className="glass-card rounded-3xl p-5 shadow-2xl">
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
                    "text-lg font-extrabold tracking-tight",
                    isDestructive ? "text-red-700" : "text-gray-900",
                  ].join(" ")}
                >
                  {title}
                </h3>
                <p
                  id={descId}
                  className="text-sm text-gray-900/60 mt-1 break-words whitespace-pre-wrap"
                >
                  {message}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="w-10 h-10 rounded-full bg-white/25 border border-white/20 text-gray-800/70 flex items-center justify-center active:scale-95 focus-visible:ring-4 focus-visible:ring-gray-300/40"
              aria-label="close"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={onCancel}
              className="
                flex-1 py-3 rounded-2xl font-extrabold text-gray-900/70
                bg-white/25 border border-white/20
                hover:bg-white/30 active:scale-[0.98]
                focus-visible:ring-4 focus-visible:ring-gray-300/40
              "
            >
              {cancelText}
            </button>

            <button
              ref={confirmBtnRef}
              type="button"
              onClick={onConfirm}
              className={[
                "flex-1 py-3 rounded-2xl font-extrabold text-white active:scale-[0.98] shadow-lg",
                "focus-visible:ring-4",
                tone.confirm,
              ].join(" ")}
            >
              {confirmText}
            </button>
          </div>

          {/* Hint */}
          <div className="mt-3 text-[11px] text-gray-900/45">
            กด <span className="font-extrabold">Esc</span> เพื่อปิด • กด{" "}
            <span className="font-extrabold">Enter</span> เพื่อยืนยัน
          </div>
        </div>
      </div>
    </div>
  );
}
