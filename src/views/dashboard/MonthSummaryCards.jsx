import { CreditCard, Landmark, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { formatCurrency } from "../../utils/format";

function SummaryCard({ icon, label, value, tone = "neutral", hint }) {
  const toneClass =
    tone === "income"
      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
      : tone === "expense"
        ? "text-rose-700 bg-rose-50 border-rose-100"
        : tone === "liability"
          ? "text-amber-700 bg-amber-50 border-amber-100"
          : "text-slate-700 bg-white border-slate-200";

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase text-current/70">{label}</div>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/70">{icon}</span>
      </div>
      <div className="mt-2 text-lg font-semibold tabular-nums text-current">{value}</div>
      {hint ? <div className="mt-1 text-[11px] font-medium text-current/65">{hint}</div> : null}
    </div>
  );
}

export default function MonthSummaryCards({ accountSummary, monthlySummary, budgetSummary }) {
  const net = Number(monthlySummary?.net || 0);
  const remaining = Number(budgetSummary?.remainingSatang || 0);

  return (
    <div className="grid grid-cols-2 gap-3">
      <SummaryCard
        icon={<Wallet size={16} />}
        label="Assets"
        value={formatCurrency(accountSummary?.totalAssetsSatang || 0)}
        hint="Cash, bank, wallet"
      />
      <SummaryCard
        icon={<CreditCard size={16} />}
        label="Liabilities"
        value={formatCurrency(accountSummary?.totalLiabilitiesSatang || 0)}
        tone="liability"
        hint="Credit outstanding"
      />
      <SummaryCard
        icon={<TrendingUp size={16} />}
        label="Income"
        value={formatCurrency(monthlySummary?.income || 0)}
        tone="income"
      />
      <SummaryCard
        icon={<TrendingDown size={16} />}
        label="Expense"
        value={formatCurrency(monthlySummary?.expense || 0)}
        tone="expense"
      />
      <SummaryCard
        icon={<Landmark size={16} />}
        label="Net Worth"
        value={formatCurrency(accountSummary?.netWorthSatang || 0)}
        hint="Assets minus liabilities"
      />
      <SummaryCard
        icon={<PiggyBank size={16} />}
        label={remaining >= 0 ? "Budget Left" : "Over Budget"}
        value={formatCurrency(Math.abs(remaining))}
        tone={remaining < 0 ? "expense" : "income"}
        hint={`Month net ${net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(net))}`}
      />
    </div>
  );
}
