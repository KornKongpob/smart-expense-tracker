import { cn } from "../utils/cn";

const toneClasses = {
  default: "bg-[color:var(--accent)]",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export default function ProgressBar({ value, tone = "default", className, label }) {
  const percent = clampPercent(value);
  const normalizedTone = toneClasses[tone] ? tone : "default";

  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div className={cn("h-full rounded-full transition-[width]", toneClasses[normalizedTone])} style={{ width: `${percent}%` }} />
    </div>
  );
}
