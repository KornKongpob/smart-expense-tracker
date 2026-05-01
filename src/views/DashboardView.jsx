import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Camera,
  CalendarDays,
  List,
  Plus,
  TrendingUp,
} from "lucide-react";

import AppHeader from "../components/AppHeader";
import { useAppStore } from "../store/store.jsx";
import { formatCurrency, toISODate } from "../utils/format";
import { compareTxNewestFirst } from "../utils/transaction";
import {
  addMonthsToKey,
  selectDashboardSnapshot,
  selectVisibleTransactions,
} from "../store/selectors/index.js";
import MonthSummaryCards from "./dashboard/MonthSummaryCards.jsx";
import PendingReceiptCard from "./dashboard/PendingReceiptCard.jsx";
import CalendarMonthView from "./dashboard/CalendarMonthView.jsx";
import RecentTransactionList from "./dashboard/RecentTransactionList.jsx";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function QuickAction({ icon, label, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-20 flex-col items-start justify-between rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.98] ${
        primary ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <span className={`grid h-9 w-9 place-items-center rounded-full ${primary ? "bg-white/20" : "bg-slate-100"}`}>
        {icon}
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

export default function DashboardView() {
  const store = useAppStore();
  const { state, navigate } = store;
  const [monthKey, setMonthKey] = useState(() => toISODate(new Date()).slice(0, 7));
  const [viewMode, setViewMode] = useState("list");
  const [selectedDate, setSelectedDate] = useState("");

  const accounts = useMemo(() => asList(state.accounts), [state.accounts]);
  const transactions = useMemo(() => asList(state.transactions), [state.transactions]);
  const categories = useMemo(
    () => (state.categories && typeof state.categories === "object" ? state.categories : { expense: [], income: [] }),
    [state.categories],
  );
  const budgets = useMemo(() => asList(state.budgets), [state.budgets]);
  const inbox = useMemo(() => asList(state.inbox), [state.inbox]);

  const categoryById = useMemo(() => {
    const all = [...asList(categories.expense), ...asList(categories.income)];
    return new Map(all.map((category) => [String(category?.id || ""), category]));
  }, [categories]);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [String(account?.id || ""), account])),
    [accounts],
  );

  const snapshot = useMemo(
    () =>
      selectDashboardSnapshot({
        accounts,
        transactions,
        budgets,
        categories: categories.expense || [],
        inbox,
        monthKey,
        recentLimit: 10,
      }),
    [accounts, transactions, budgets, categories.expense, inbox, monthKey],
  );

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDate) return [];
    return selectVisibleTransactions(transactions, { monthKey, date: selectedDate })
      .slice()
      .sort(compareTxNewestFirst);
  }, [transactions, monthKey, selectedDate]);

  const visibleTransactions =
    viewMode === "calendar" && selectedDate ? selectedDayTransactions : snapshot.recentTransactions;
  const budgetPercent = clampPercent(snapshot.budgetSummary?.percent || 0);
  const topOverCategory = snapshot.budgetSummary?.topOverBudget
    ? categoryById.get(String(snapshot.budgetSummary.topOverBudget.categoryId || ""))
    : null;

  const openManual = (txType) => store.startNewTransaction({ entryMode: "manual", txType });
  const openScan = () => store.startNewTransaction({ entryMode: "scan", scanUploadKind: "receipt" });
  const changeMonth = (delta) => {
    setSelectedDate("");
    setMonthKey((current) => addMonthsToKey(current, delta));
  };

  return (
    <div className="min-h-dvh bg-slate-50/60">
      <AppHeader
        title="Dashboard"
        subtitle={`Money view for ${monthKey}`}
        right={
          <button type="button" onClick={() => navigate("accounts")} className="ui-chip">
            Net {formatCurrency(snapshot.accountSummary.netWorthSatang || 0)}
          </button>
        }
      />

      <main className="ui-page pt-4 pb-nav view-flow">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => changeMonth(-1)} className="ui-icon-btn" aria-label="Previous month">
              <ArrowLeft size={16} />
            </button>
            <input
              type="month"
              value={monthKey}
              onChange={(event) => {
                setSelectedDate("");
                setMonthKey(event.target.value || monthKey);
              }}
              className="ui-input h-10 flex-1 text-center font-semibold"
            />
            <button type="button" onClick={() => changeMonth(1)} className="ui-icon-btn" aria-label="Next month">
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="mt-4">
            <MonthSummaryCards
              accountSummary={snapshot.accountSummary}
              monthlySummary={snapshot.monthlySummary}
              budgetSummary={snapshot.budgetSummary}
            />
          </div>
        </section>

        <section className="grid grid-cols-4 gap-2">
          <QuickAction icon={<Plus size={17} />} label="Expense" primary onClick={() => openManual("expense")} />
          <QuickAction icon={<TrendingUp size={17} />} label="Income" onClick={() => openManual("income")} />
          <QuickAction icon={<ArrowRightLeft size={17} />} label="Transfer" onClick={() => openManual("transfer")} />
          <QuickAction icon={<Camera size={17} />} label="Scan" onClick={openScan} />
        </section>

        <PendingReceiptCard count={snapshot.pendingReceiptCount} onOpen={() => navigate("inbox")} />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Monthly Budget</div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                {snapshot.budgetSummary.totalLimitSatang
                  ? `${formatCurrency(snapshot.budgetSummary.actualSatang)} used of ${formatCurrency(snapshot.budgetSummary.totalLimitSatang)}`
                  : "Set a monthly or category budget to track remaining spend."}
              </div>
            </div>
            <button type="button" onClick={() => navigate("budgets")} className="text-xs font-bold text-indigo-700">
              Budgets
            </button>
          </div>
          {snapshot.budgetSummary.totalLimitSatang ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${snapshot.budgetSummary.overBudget ? "bg-rose-500" : "bg-emerald-500"}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
          ) : null}
          {topOverCategory ? (
            <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              Over budget: {topOverCategory.name || topOverCategory.id}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Transactions</h2>
              <p className="text-xs font-medium text-slate-500">
                {viewMode === "calendar" && selectedDate ? selectedDate : "Recent ledger activity"}
              </p>
            </div>
            <div className="flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`grid h-9 w-9 place-items-center rounded-full ${viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                aria-label="List view"
              >
                <List size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={`grid h-9 w-9 place-items-center rounded-full ${viewMode === "calendar" ? "bg-slate-900 text-white" : "text-slate-500"}`}
                aria-label="Calendar view"
              >
                <CalendarDays size={16} />
              </button>
            </div>
          </div>

          {viewMode === "calendar" ? (
            <CalendarMonthView
              monthKey={monthKey}
              days={snapshot.calendarDays}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate((current) => (current === date ? "" : date))}
            />
          ) : null}

          <RecentTransactionList
            transactions={visibleTransactions}
            categoryById={categoryById}
            accountById={accountById}
            onSelect={(tx) => store.startEditTransaction(tx.id)}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Accounts</div>
            <button type="button" onClick={() => navigate("accounts")} className="text-xs font-bold text-indigo-700">
              Manage
            </button>
          </div>
          <div className="space-y-2">
            {snapshot.accountSummary.accounts.slice(0, 4).map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => navigate("accounts")}
                className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{account.name || "Account"}</div>
                  <div className="text-xs font-medium text-slate-500">
                    {account.isCreditCard ? "Credit card" : account.type || "Account"}
                  </div>
                </div>
                <div className="ml-3 text-right">
                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatCurrency(account.isCreditCard ? account.outstandingSatang : account.balanceSatang)}
                  </div>
                  {account.isCreditCard ? (
                    <div className="text-[11px] font-medium text-slate-500">
                      Available {formatCurrency(account.availableCreditSatang || 0)}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
            {!snapshot.accountSummary.accounts.length ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-500">
                Add cash, bank, wallet, or credit card accounts to see balances here.
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
