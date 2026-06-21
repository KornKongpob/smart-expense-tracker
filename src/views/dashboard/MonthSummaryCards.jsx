import { CreditCard, Landmark, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import StatCard from "../../components/StatCard.jsx";
import { formatCurrency } from "../../utils/format";

function SummaryCard({ icon, label, value, tone = "neutral", hint }) {
  const toneMap = {
    income: "success",
    expense: "danger",
    liability: "warning",
    neutral: "neutral",
  };

  return (
    <StatCard icon={icon} label={label} value={value} hint={hint} tone={toneMap[tone] || "neutral"} />
  );
}

export default function MonthSummaryCards({ accountSummary, monthlySummary, budgetSummary }) {
  const net = Number(monthlySummary?.net || 0);
  const remaining = Number(budgetSummary?.remainingSatang || 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
