import React from "react";
import { getInstitutionPresetById } from "../constants/institutions";
import { cn } from "../utils/cn";

export default function InstitutionLogo({
  institutionId,
  alt = "",
  className,
  imgClassName,
  labelClassName,
  fallbackLabel = "",
}) {
  const preset = getInstitutionPresetById(institutionId);
  const label = String(
    fallbackLabel || preset?.shortName || preset?.displayName || alt || "?"
  ).trim();

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-[inherit] bg-white/95",
        className
      )}
      style={
        preset
          ? {
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${preset.brandColor} 28%, white 72%)`,
            }
          : undefined
      }
    >
      {preset?.logoSrc ? (
        <img
          src={preset.logoSrc}
          alt={alt || preset.displayName || preset.shortName || "Institution"}
          className={cn("h-full w-full object-contain", imgClassName)}
          draggable={false}
        />
      ) : (
        <span
          className={cn(
            "font-extrabold tracking-[-0.02em] text-slate-900",
            labelClassName || "text-[11px]"
          )}
        >
          {label.slice(0, 6)}
        </span>
      )}
    </span>
  );
}
