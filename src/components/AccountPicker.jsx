// src/components/AccountPicker.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "../utils/cn";
import AccountPill from "./AccountPill";

function normalizeType(t) {
  const s = String(t || "").toLowerCase().trim();
  if (s === "cash") return "cash";
  if (s === "bank") return "bank";
  if (s === "credit") return "credit";
  return "other";
}

function typeLabel(t) {
  const s = normalizeType(t);
  if (s === "cash") return "เงินสด";
  if (s === "bank") return "ธนาคาร";
  if (s === "credit") return "บัตรเครดิต";
  return "อื่นๆ";
}

function currencyLabel(cur) {
  const c = String(cur || "THB").toUpperCase();
  if (c === "THB") return "THB";
  return c;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * AccountPicker
 * - Custom picker to avoid native <select> issues on mobile + prevent overlaps
 * - Desktop: anchored floating panel
 * - Mobile: bottom sheet
 */
export default function AccountPicker({
  accounts,
  value,
  onChange,
  title = "เลือกบัญชี",
  placeholder = "เลือกบัญชี",
  allowEmpty = false,
  emptyLabel = "(ไม่ระบุ)",
  disabled = false,
  className,
}) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const list = Array.isArray(accounts) ? accounts : [];
  const selected = useMemo(
    () => list.find((a) => String(a?.id || "") === String(value || "")) || null,
    [list, value]
  );

  const filtered = useMemo(() => {
    const query = String(q || "").trim().toLowerCase();
    const arr = list.slice();
    if (!query) return arr;
    return arr.filter((a) => {
      const name = String(a?.name || "").toLowerCase();
      const t = String(a?.type || "").toLowerCase();
      const cur = String(a?.currency || "").toLowerCase();
      const digits = String(a?.accountNumber || a?.digits || a?.matchDigits || "").toLowerCase();
      return name.includes(query) || t.includes(query) || cur.includes(query) || digits.includes(query);
    });
  }, [list, q]);

  const grouped = useMemo(() => {
    const out = { cash: [], bank: [], credit: [], other: [] };
    for (const a of filtered) out[normalizeType(a?.type)].push(a);
    // stable ordering
    for (const k of Object.keys(out)) {
      out[k] = out[k].slice().sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    }
    return out;
  }, [filtered]);

  // close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document?.body?.style?.overflow;
    if (document?.body) document.body.style.overflow = "hidden";
    return () => {
      if (document?.body) document.body.style.overflow = prev || "";
    };
  }, [open]);

  const panelStyle = useMemo(() => {
    const r = btnRef.current?.getBoundingClientRect?.();
    if (!r) return { left: 12, top: 80, width: 360 };
    const vw = window?.innerWidth || 390;
    const left = clamp(r.left, 12, vw - 12);
    const width = clamp(r.width, 240, 420);
    const maxLeft = vw - 12 - width;
    return {
      left: clamp(left, 12, maxLeft),
      top: Math.max(12, r.bottom + 8),
      width,
    };
  }, [open]);

  const clearAndClose = () => {
    onChange?.("");
    setOpen(false);
  };

  const pickAndClose = (id) => {
    onChange?.(id);
    setOpen(false);
  };

  const OptionRow = ({ a }) => {
    const active = String(a?.id || "") === String(value || "");
    return (
      <button
        type="button"
        onClick={() => pickAndClose(String(a?.id || ""))}
        className={cn(
          "w-full text-left rounded-2xl px-3 py-3",
          "hover:bg-white/40 active:scale-[0.99] transition",
          active ? "bg-white/45" : "bg-transparent"
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          <AccountPill account={a} size="md" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold text-gray-900 truncate">{String(a?.name || "—")}</div>
            <div className="text-[11px] font-bold text-gray-800/55 truncate">
              {typeLabel(a?.type)} • {currencyLabel(a?.currency)}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const Layer = open ? (
    <div
      className="fixed inset-0 z-[10000]"
      onMouseDown={() => setOpen(false)}
      onTouchStart={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      {/* Desktop floating panel */}
      <div
        className="hidden sm:block fixed rounded-3xl ui-card-strong border border-white/25 shadow-2xl overflow-hidden"
        style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-white/20 bg-white/35">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-black text-gray-900">{title}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/70 active:scale-[0.98]"
              aria-label="close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-2 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full ui-input pl-9"
              placeholder="ค้นหาบัญชี…"
              autoFocus
            />
          </div>
          {allowEmpty ? (
            <button
              type="button"
              onClick={clearAndClose}
              className="mt-2 w-full rounded-2xl bg-white/25 border border-white/20 px-3 py-2 text-xs font-extrabold text-gray-900/70 hover:bg-white/35"
            >
              {emptyLabel}
            </button>
          ) : null}
        </div>

        <div className="max-h-[360px] overflow-auto p-2 no-scrollbar">
          {Object.entries(grouped).every(([, arr]) => !arr.length) ? (
            <div className="p-4 text-sm font-extrabold text-gray-900/60">ไม่พบบัญชี</div>
          ) : (
            ["cash", "bank", "credit", "other"].map((k) => {
              const arr = grouped[k] || [];
              if (!arr.length) return null;
              return (
                <div key={k} className="mb-2">
                  <div className="px-3 py-2 text-[11px] font-black text-gray-900/55 uppercase tracking-wide">
                    {typeLabel(k)} ({arr.length})
                  </div>
                  <div className="space-y-1">
                    {arr.map((a) => (
                      <OptionRow key={a.id} a={a} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div
        className="sm:hidden fixed left-0 right-0 bottom-0 z-[10001] rounded-t-3xl ui-card-strong border border-white/25 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{ touchAction: "pan-y" }}
      >
        <div className="px-4 pt-3 pb-2 border-b border-white/15">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-sm font-black text-gray-900">{title}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-2xl bg-white/30 border border-white/20 text-gray-900/70 active:scale-[0.98]"
              aria-label="close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-2 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full ui-input pl-9"
              placeholder="ค้นหาบัญชี…"
              autoFocus
            />
          </div>
          {allowEmpty ? (
            <button
              type="button"
              onClick={clearAndClose}
              className="mt-2 w-full rounded-2xl bg-white/25 border border-white/20 px-3 py-2 text-xs font-extrabold text-gray-900/70"
            >
              {emptyLabel}
            </button>
          ) : null}
        </div>

        <div className="max-h-[65vh] overflow-auto p-2 no-scrollbar">
          {Object.entries(grouped).every(([, arr]) => !arr.length) ? (
            <div className="p-4 text-sm font-extrabold text-gray-900/60">ไม่พบบัญชี</div>
          ) : (
            ["cash", "bank", "credit", "other"].map((k) => {
              const arr = grouped[k] || [];
              if (!arr.length) return null;
              return (
                <div key={k} className="mb-2">
                  <div className="px-3 py-2 text-[11px] font-black text-gray-900/55 uppercase tracking-wide">
                    {typeLabel(k)} ({arr.length})
                  </div>
                  <div className="space-y-1">
                    {arr.map((a) => (
                      <OptionRow key={a.id} a={a} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "w-full rounded-2xl px-4 py-3 text-left",
          "border border-white/25 bg-white/35 backdrop-blur",
          "shadow-sm hover:bg-white/45",
          "flex items-center justify-between gap-3",
          "active:scale-[0.99]",
          disabled ? "opacity-60 cursor-not-allowed" : ""
        )}
      >
        <div className="min-w-0">
          {selected ? (
            <AccountPill account={selected} size="sm" />
          ) : (
            <div className="text-sm font-extrabold text-gray-900/70 truncate">{placeholder}</div>
          )}
        </div>
        <ChevronDown size={18} className="text-gray-900/45 shrink-0" aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined" ? createPortal(Layer, document.body) : null}
    </div>
  );
}
