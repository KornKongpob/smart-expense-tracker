import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "../../utils/format";

function Row({ label, value, tone = "default" }) {
  const toneClass = tone === "subtract" ? "text-emerald-700" : tone === "add" ? "text-rose-700" : "text-slate-800";
  return (
    <div className="flex items-center justify-between gap-3 text-xs font-semibold">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

export default function ReceiptReconcileSummary({ reconciliation, onAddRounding }) {
  if (!reconciliation) return null;
  const difference = Number(reconciliation.differenceSatang || 0);
  const balanced = reconciliation.balanced === true;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase text-slate-500">Reconcile</div>
        <div
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
            balanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {balanced ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {balanced ? "Balanced" : "Needs attention"}
        </div>
      </div>

      <div className="space-y-2">
        <Row label="Items subtotal" value={formatCurrency(reconciliation.itemSubtotalSatang || 0)} />
        <Row label="Discount" value={`-${formatCurrency(reconciliation.discountSatang || 0)}`} tone="subtract" />
        <Row label="Tax / service / fee" value={`+${formatCurrency(reconciliation.surchargeSatang || 0)}`} tone="add" />
        <Row label="Paid total" value={formatCurrency(reconciliation.paidTotalSatang || 0)} />
        <Row
          label="Difference"
          value={`${difference > 0 ? "+" : difference < 0 ? "-" : ""}${formatCurrency(Math.abs(difference))}`}
          tone={difference ? "add" : "default"}
        />
      </div>

      {!balanced && onAddRounding ? (
        <button
          type="button"
          onClick={onAddRounding}
          className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white active:scale-[0.98]"
        >
          Add rounding adjustment
        </button>
      ) : null}
    </div>
  );
}
