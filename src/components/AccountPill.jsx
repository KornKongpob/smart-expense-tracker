// src/components/AccountPill.jsx
import React, { useMemo } from "react";
import { cn } from "../utils/cn";
import { choosePrimaryDigits, getAccountDigitCandidates } from "../utils/accountMatch";
import AccountAvatar from "./AccountAvatar.jsx";

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

  const name = String(acc?.name || fallbackName || "").trim() || "â€”";
  const color = String(acc?.color || "#111827");

  const hint = useMemo(() => {
    if (!showHint) return "";
    const digits = getAccountDigitCandidates(acc);
    const primary = choosePrimaryDigits(digits);
    if (!primary) return "";
    const short = String(primary).slice(-6);
    return short ? `â€¢â€¢â€¢â€¢ ${short}` : "";
  }, [acc, showHint]);

  const dim = size === "md" ? "w-7 h-7 rounded-2xl" : "w-6 h-6 rounded-xl";
  const titleCls = size === "md" ? "text-[13px]" : "text-[12px]";
  const hintCls = size === "md" ? "text-[11px]" : "text-[10px]";

  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0 max-w-full", className)} title={name}>
      <AccountAvatar
        account={acc}
        name={name}
        type={acc?.type || "bank"}
        color={color}
        className={cn("shrink-0", dim)}
        contentClassName="h-full w-full"
        textClassName={size === "md" ? "text-[14px]" : "text-[13px]"}
      />

      <span className="min-w-0">
        <span className={cn("block font-semibold text-gray-900 truncate", titleCls)}>{name}</span>
        {hint ? <span className={cn("block font-bold text-gray-700/55 truncate", hintCls)}>{hint}</span> : null}
      </span>
    </span>
  );
}
