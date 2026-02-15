// src/components/PinLockScreen.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Delete, Lock } from "lucide-react";

/**
 * Privacy PIN Lock Screen (6 digits)
 *
 * Notes:
 * - Only validates a PIN already stored (App.jsx decides storage key)
 * - UI-only component; no business logic side effects
 */
export default function PinLockScreen({
  savedPin,
  onUnlocked,
  title = "ปลดล็อกด้วย PIN",
}) {
  const PIN_LEN = 6;

  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const dots = useMemo(
    () => Array.from({ length: PIN_LEN }, (_, i) => i < input.length),
    [input]
  );

  const vibrate = (ms) => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
    } catch {
      // ignore
    }
  };

  const pressDigit = (d) => {
    if (!/^[0-9]$/.test(String(d))) return;
    setError("");
    setInput((prev) => {
      if (prev.length >= PIN_LEN) return prev;
      vibrate(10);
      return prev + String(d);
    });
  };

  const backspace = () => {
    setError("");
    setInput((prev) => {
      vibrate(8);
      return prev.slice(0, -1);
    });
  };

  const clear = () => {
    setError("");
    setInput("");
    vibrate(15);
  };

  useEffect(() => {
    if (input.length !== PIN_LEN) return;
    const ok = String(input) === String(savedPin || "");
    if (ok) {
      setError("");
      vibrate(20);
      window.setTimeout(() => onUnlocked?.(), 120);
      return;
    }

    setError("PIN ไม่ถูกต้อง");
    setShake(true);
    vibrate(120);
    const t = window.setTimeout(() => {
      setInput("");
      setShake(false);
    }, 520);
    return () => window.clearTimeout(t);
  }, [input, savedPin, onUnlocked]);

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  return (
    <div className="min-h-dvh relative">
      {/* Background (match app glass feel) */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/70 via-white/50 to-purple-50/70" />
        <div className="absolute -top-28 -right-28 w-80 h-80 rounded-full bg-indigo-300/18 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 w-80 h-80 rounded-full bg-purple-300/16 blur-3xl" />
        <div className="absolute inset-0 bg-white/20" />
      </div>

      <div className="mx-auto max-w-[520px] min-h-dvh flex flex-col items-center justify-center px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm ui-card-strong rounded-3xl p-6 shadow-[0_28px_78px_-44px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/70 border border-slate-900/10 flex items-center justify-center">
              <Lock size={20} className="text-gray-900" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-gray-900">{title}</div>
              <div className="text-sm text-gray-800/70">กรอกรหัส 6 หลักเพื่อเข้าใช้งาน</div>
            </div>
          </div>

          {/* Dots */}
          <div
            className={`mt-6 flex items-center justify-center gap-3 ${
              shake ? "animate-[shake_0.35s_ease-in-out_1]" : ""
            }`}
            aria-label="pin dots"
          >
            {dots.map((filled, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border ${
                  filled ? "bg-gray-900 border-gray-900" : "bg-transparent border-gray-500/40"
                }`}
              />
            ))}
          </div>

          {/* Error */}
          <div className="mt-3 text-center text-sm font-bold text-red-700 min-h-[1.25rem]">
            {error || ""}
          </div>

          {/* Keypad */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {KEYS.slice(0, 9).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pressDigit(k)}
                className="h-14 rounded-2xl ui-btn ui-btn-secondary text-lg font-black tabular-nums active:scale-95 focus-visible:ring-4 focus-visible:ring-indigo-300/35"
                aria-label={`digit ${k}`}
              >
                {k}
              </button>
            ))}

            {/* Clear */}
            <button
              type="button"
              onClick={clear}
              className="h-14 rounded-2xl ui-btn ui-btn-secondary text-sm font-extrabold active:scale-95 focus-visible:ring-4 focus-visible:ring-indigo-300/35"
            >
              ล้าง
            </button>

            {/* 0 */}
            <button
              type="button"
              onClick={() => pressDigit("0")}
              className="h-14 rounded-2xl ui-btn ui-btn-secondary text-lg font-black tabular-nums active:scale-95 focus-visible:ring-4 focus-visible:ring-indigo-300/35"
              aria-label="digit 0"
            >
              0
            </button>

            {/* Backspace */}
            <button
              type="button"
              onClick={backspace}
              className="h-14 rounded-2xl ui-btn ui-btn-secondary active:scale-95 focus-visible:ring-4 focus-visible:ring-indigo-300/35"
              aria-label="ลบตัวเลข"
            >
              <Delete size={18} />
            </button>
          </div>

          <div className="mt-5 text-center text-xs text-gray-800/65 leading-relaxed">
            หากลืม PIN: สามารถลบค่า PIN ใน LocalStorage ของเบราว์เซอร์เพื่อเข้าใช้งานใหม่
          </div>
        </div>
      </div>

      {/* local keyframes */}
      <style>{`
        @keyframes shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
