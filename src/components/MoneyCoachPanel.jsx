import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

const INSIGHT_TONES = {
  danger: {
    icon: ShieldAlert,
    row: "border-rose-200 bg-rose-50/80 text-rose-950",
    iconWrap: "bg-rose-100 text-rose-700",
    metric: "text-rose-700",
    action: "text-rose-700 hover:text-rose-900",
  },
  warning: {
    icon: AlertTriangle,
    row: "border-amber-200 bg-amber-50/80 text-amber-950",
    iconWrap: "bg-amber-100 text-amber-700",
    metric: "text-amber-700",
    action: "text-amber-700 hover:text-amber-900",
  },
  positive: {
    icon: CheckCircle2,
    row: "border-emerald-200 bg-emerald-50/80 text-emerald-950",
    iconWrap: "bg-emerald-100 text-emerald-700",
    metric: "text-emerald-700",
    action: "text-emerald-700 hover:text-emerald-900",
  },
  info: {
    icon: Info,
    row: "border-sky-200 bg-sky-50/80 text-sky-950",
    iconWrap: "bg-sky-100 text-sky-700",
    metric: "text-sky-700",
    action: "text-sky-700 hover:text-sky-900",
  },
};

function getTone(severity) {
  return INSIGHT_TONES[severity] || INSIGHT_TONES.info;
}

export default function MoneyCoachPanel({ insights = [], onAction }) {
  const visibleInsights = Array.isArray(insights) ? insights.slice(0, 8) : [];
  if (!visibleInsights.length) return null;

  return (
    <section className="ui-card finance-panel rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="finance-panel-head flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="finance-panel-title text-sm font-semibold text-slate-900">โค้ชการเงิน</div>
          <div className="finance-panel-copy mt-1 text-xs font-medium text-slate-500">
            วันนี้ควรโฟกัสรายการไหนก่อน
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
          {visibleInsights.length}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {visibleInsights.map((insight) => {
          const tone = getTone(insight.severity);
          const Icon = tone.icon;
          const canAct = Boolean(insight.actionTarget && onAction);

          return (
            <article
              key={insight.id}
              className={`flex min-w-0 gap-3 rounded-2xl border p-3 ${tone.row}`}
              data-testid={`money-coach-${insight.id}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone.iconWrap}`}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 text-sm font-bold leading-snug">{insight.title}</h3>
                  {insight.metric ? (
                    <span className={`shrink-0 text-xs font-bold tabular-nums ${tone.metric}`}>{insight.metric}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs font-medium leading-relaxed text-current/70">{insight.message}</p>
                {insight.actionLabel ? (
                  canAct ? (
                    <button
                      type="button"
                      className={`mt-2 text-xs font-bold transition ${tone.action}`}
                      onClick={() => onAction(insight.actionTarget, insight)}
                    >
                      {insight.actionLabel}
                    </button>
                  ) : (
                    <div className={`mt-2 text-xs font-bold ${tone.metric}`}>{insight.actionLabel}</div>
                  )
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
