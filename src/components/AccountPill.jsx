// src/components/AccountPill.jsx
import React, { useMemo } from "react";
import { ACCOUNT_ICONS } from "../constants/presets.jsx";
import { cn } from "../utils/cn";
import { choosePrimaryDigits, getAccountDigitCandidates } from "../utils/accountMatch";

function isLikelyImageUrl(s) {
  const v = String(s || "").trim();
  if (!v) return false;
  if (v.startsWith("data:image/")) return true;
  if (v.startsWith("http://") || v.startsWith("https://")) return true;
  return false;
}

function resolvePresetIcon(iconId) {
  const id = String(iconId || "").trim();
  if (!id) return null;
  const found = (ACCOUNT_ICONS || []).find((x) => String(x?.id || "") === id);
  return found?.icon || null;
}

/**
 * AccountPill
 * - Small, consistent account visual (icon + name + optional last digits)
 * - Safe against long names (truncate) and small screens (no overflow)
 */
export default function AccountPill({
  account,
  fallbackName,
  size = "sm", // sm | md
  showHint = true,
  className,
}) {
  const acc = account && typeof account === "object" ? account : null;

  const name = String(acc?.name || fallbackName || "").trim() || "—";
  const color = String(acc?.color || "#111827");

  const hint = useMemo(() => {
    if (!showHint) return "";
    const digits = getAccountDigitCandidates(acc);
    const primary = choosePrimaryDigits(digits);
    if (!primary) return "";
    const short = String(primary).slice(-6);
    return short ? `•••• ${short}` : "";
  }, [acc, showHint]);

  const iconNode = useMemo(() => {
    if (!acc) return <span className="leading-none">💳</span>;

    const img = acc?.image || (isLikelyImageUrl(acc?.icon) ? acc?.icon : "");
    if (isLikelyImageUrl(img)) {
      return (
        <img
          src={String(img)}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      );
    }

    const preset = resolvePresetIcon(acc?.iconId);
    if (preset) return preset;

    const raw = String(acc?.icon || "").trim();
    if (raw) return <span className="leading-none">{raw}</span>;
    return <span className="leading-none">💳</span>;
  }, [acc]);

  const dim = size === "md" ? "w-7 h-7 rounded-2xl" : "w-6 h-6 rounded-xl";
  const titleCls = size === "md" ? "text-[13px]" : "text-[12px]";
  const hintCls = size === "md" ? "text-[11px]" : "text-[10px]";

  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0 max-w-full", className)} title={name}>
      <span
        className={cn(
          "shrink-0 overflow-hidden border border-white/15 shadow-sm",
          dim,
          "flex items-center justify-center text-white"
        )}
        style={{ background: color }}
        aria-hidden="true"
      >
        <span className={cn("flex items-center justify-center", size === "md" ? "text-[14px]" : "text-[13px]")}
        >
          {iconNode}
        </span>
      </span>

      <span className="min-w-0">
        <span className={cn("block font-extrabold text-gray-900 truncate", titleCls)}>{name}</span>
        {hint ? <span className={cn("block font-bold text-gray-700/55 truncate", hintCls)}>{hint}</span> : null}
      </span>
    </span>
  );
}
