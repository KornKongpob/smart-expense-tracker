import React from "react";
import { cn } from "../../utils/cn";

/**
 * BentoCard
 * - Apple-ish material + SaaS dashboard card structure
 * - Optional header (title/subtitle/icon/actions)
 */
export default function BentoCard({
  title,
  subtitle,
  icon,
  actions,
  variant = "default", // default | strong
  className,
  children,
  bodyClassName,
}) {
  const cardCls = variant === "strong" ? "ui-card-strong" : "ui-card";

  return (
    <section className={cn(cardCls, "p-4", className)}>
      {(title || subtitle || icon || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {icon ? (
              <div className="w-11 h-11 rounded-2xl bg-white/70 border border-slate-900/10 flex items-center justify-center shrink-0">
                {icon}
              </div>
            ) : null}

            <div className="min-w-0">
              {title ? (
                <div className="text-sm font-black text-gray-900 tracking-tight truncate">{title}</div>
              ) : null}
              {subtitle ? (
                <div className="mt-0.5 text-[12px] font-bold text-gray-800/60 leading-snug">{subtitle}</div>
              ) : null}
            </div>
          </div>

          {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
        </div>
      )}

      <div className={cn(title || subtitle || icon || actions ? "mt-4" : "", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
