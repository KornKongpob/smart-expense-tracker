import React from "react";
import { ACCOUNT_ICONS } from "../constants/presets.jsx";
import { cn } from "../utils/cn";
import InstitutionLogo from "./InstitutionLogo.jsx";

function isLikelyImageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.startsWith("data:image/")) return true;
  return text.startsWith("http://") || text.startsWith("https://");
}

function resolvePresetIcon(iconId) {
  const key = String(iconId || "").trim();
  if (!key) return null;
  const match = (ACCOUNT_ICONS || []).find((item) => String(item?.id || "") === key);
  return match?.icon || null;
}

export default function AccountAvatar({
  account,
  name,
  type = "bank",
  color = "#111827",
  className,
  contentClassName,
  textClassName,
}) {
  const item = account && typeof account === "object" ? account : {};
  const title = String(item?.name || name || "").trim();

  if (item?.institutionId) {
    return (
      <InstitutionLogo
        institutionId={item.institutionId}
        alt={title}
        className={cn("border border-white/20 shadow-lg", className)}
        imgClassName={cn("object-contain", contentClassName)}
        labelClassName={textClassName}
      />
    );
  }

  const imageSrc = item?.image || (isLikelyImageUrl(item?.icon) ? item?.icon : "");
  if (isLikelyImageUrl(imageSrc)) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-[inherit] border border-white/20 shadow-lg bg-white/90",
          className
        )}
      >
        <img src={String(imageSrc)} alt={title} className={cn("h-full w-full object-cover", contentClassName)} draggable={false} />
      </span>
    );
  }

  const presetIcon = resolvePresetIcon(item?.iconId);
  const fallbackEmoji = String(item?.icon || "").trim() || (type === "cash" ? "💵" : type === "credit" ? "💳" : "🏦");

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-[inherit] border border-white/20 shadow-lg text-white",
        className
      )}
      style={{ background: color }}
      title={title}
    >
      <span className={cn("flex items-center justify-center", contentClassName, textClassName)}>
        {presetIcon || <span className="leading-none">{fallbackEmoji}</span>}
      </span>
    </span>
  );
}
