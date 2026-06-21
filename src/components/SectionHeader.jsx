import { cn } from "../utils/cn";

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
  titleClassName,
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="ui-label font-semibold uppercase text-[color:var(--muted)]">
            {eyebrow}
          </div>
        ) : null}
        {title ? (
          <h2 className={cn("text-base font-semibold leading-tight text-[color:var(--text)]", titleClassName)}>
            {title}
          </h2>
        ) : null}
        {subtitle ? <p className="ui-help mt-1 max-w-2xl">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
