import { cn } from "../utils/cn";

const toneClasses = {
  default: "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)]",
  neutral: "border-slate-200/70 bg-white/80 text-slate-900",
  info: "border-blue-200/70 bg-blue-50/80 text-blue-950",
  success: "border-emerald-200/70 bg-emerald-50/80 text-emerald-950",
  warning: "border-amber-200/80 bg-amber-50/85 text-amber-950",
  danger: "border-rose-200/80 bg-rose-50/85 text-rose-950",
};

const iconToneClasses = {
  default: "bg-white/70 text-[color:var(--accent-ink)]",
  neutral: "bg-white/75 text-slate-700",
  info: "bg-white/75 text-blue-700",
  success: "bg-white/75 text-emerald-700",
  warning: "bg-white/75 text-amber-700",
  danger: "bg-white/75 text-rose-700",
};

export default function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
  onClick,
  className,
}) {
  const Component = onClick ? "button" : "article";
  const normalizedTone = toneClasses[tone] ? tone : "default";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "min-w-0 rounded-2xl border p-3 text-left shadow-sm transition",
        toneClasses[normalizedTone],
        onClick ? "cursor-pointer hover:border-[color:var(--border-strong)] hover:shadow-md active:scale-[0.99]" : "",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase leading-4 text-current/60">{label}</div>
          <div className="mt-2 truncate text-xl font-semibold leading-tight tabular-nums text-current">
            {value}
          </div>
        </div>
        {icon ? (
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-2xl",
              iconToneClasses[normalizedTone],
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
      {hint ? <div className="mt-2 truncate text-xs font-medium text-current/60">{hint}</div> : null}
    </Component>
  );
}
