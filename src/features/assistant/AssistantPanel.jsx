import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import BentoCard from "../../components/bento/BentoCard.jsx";

const ACTION_VIEW_ALIASES = Object.freeze({
  planner: "budgets",
});

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function actionViewFor(item, aliases = ACTION_VIEW_ALIASES) {
  const view = String(item?.actionView || "").trim();
  return aliases?.[view] || view;
}

function severityMeta(severity) {
  const key = String(severity || "info").trim().toLowerCase();
  if (key === "critical") {
    return {
      icon: <ShieldAlert size={16} />,
      className: "border-rose-200 bg-rose-50 text-rose-900",
      iconClassName: "bg-rose-100 text-rose-700",
    };
  }
  if (key === "warning") {
    return {
      icon: <AlertTriangle size={16} />,
      className: "border-amber-200 bg-amber-50 text-amber-900",
      iconClassName: "bg-amber-100 text-amber-700",
    };
  }
  if (key === "success") {
    return {
      icon: <CheckCircle2 size={16} />,
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
      iconClassName: "bg-emerald-100 text-emerald-700",
    };
  }
  return {
    icon: <Info size={16} />,
    className: "border-slate-200 bg-slate-50 text-slate-900",
    iconClassName: "bg-slate-100 text-slate-600",
  };
}

function AssistantItem({ item, onNavigate, actionViewAliases }) {
  const meta = severityMeta(item?.severity);
  const targetView = actionViewFor(item, actionViewAliases);
  const canNavigate = !!targetView && typeof onNavigate === "function";

  return (
    <article className={`rounded-2xl border px-3 py-3 ${meta.className}`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${meta.iconClassName}`}>
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-snug">{item?.title || "คำแนะนำ"}</div>
          {item?.body ? <div className="mt-1 text-xs font-semibold leading-5 opacity-75">{item.body}</div> : null}
          {canNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate(targetView, item.actionPayload)}
              className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-white/80 px-3 text-xs font-bold text-slate-900 shadow-sm ring-1 ring-black/5 active:scale-[0.98]"
            >
              {item.actionLabel || "เปิด"}
              <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function AssistantPanel({
  recommendations,
  onNavigate,
  actionViewAliases = ACTION_VIEW_ALIASES,
  title = "ผู้ช่วยการเงินส่วนตัว",
  subtitle = "คำแนะนำจากเงินสด งบ เป้าหมาย หนี้ และบิลประจำ",
}) {
  const items = listOf(recommendations).slice(0, 5);

  return (
    <BentoCard
      title={title}
      subtitle={subtitle}
      icon={<Sparkles size={19} className="text-indigo-700" />}
      className="rounded-3xl border-slate-200 bg-white shadow-sm"
    >
      {items.length ? (
        <div className="space-y-2" data-testid="assistant-panel">
          {items.map((item) => (
            <AssistantItem
              key={item.id}
              item={item}
              onNavigate={onNavigate}
              actionViewAliases={actionViewAliases}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-semibold leading-6 text-slate-600">
          เพิ่มรายการ/ตั้งงบ/ตั้ง recurring เพื่อให้ผู้ช่วยแนะนำได้แม่นขึ้น
        </div>
      )}
    </BentoCard>
  );
}
