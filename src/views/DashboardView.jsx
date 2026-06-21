import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CalendarDays,
  CreditCard,
  List,
  PiggyBank,
  Plus,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";

import AppHeader from "../components/AppHeader";
import FinancialPlanPanel from "../components/FinancialPlanPanel.jsx";
import MoneyCoachPanel from "../components/MoneyCoachPanel.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import SectionHeader from "../components/SectionHeader.jsx";
import StatCard from "../components/StatCard.jsx";
import TransactionDetailModal from "../components/TransactionDetailModal.jsx";
import { useAppStore } from "../store/store.jsx";
import { formatCurrency, formatDateShort, toISODate } from "../utils/format";
import { compareTxNewestFirst } from "../utils/transaction";
import {
  addMonthsToKey,
  selectDashboardSnapshot,
  selectVisibleTransactions,
} from "../store/selectors/index.js";
import {
  calculateMonthlyPlan,
  forecastCashFlow,
} from "../features/money-plan/moneyPlan.js";
import AssistantPanel from "../features/assistant/AssistantPanel.jsx";
import { generatePersonalMoneyRecommendations } from "../features/assistant/recommendationEngine.js";
import { generateMoneyCoachInsights } from "../utils/moneyCoach.js";
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
      className={`ui-card flex min-h-20 cursor-pointer flex-col items-start justify-between p-3 text-left ${
        primary ? "border-blue-500/40 bg-blue-600 text-white shadow-[0_18px_34px_-24px_rgba(0,122,255,0.7)]" : "text-[color:var(--text)]"
      }`}
    >
      <span className={`grid h-9 w-9 place-items-center rounded-2xl ${primary ? "bg-white/20" : "bg-blue-50 text-blue-700"}`}>
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
  const [detailTransactionId, setDetailTransactionId] = useState("");

  const accounts = useMemo(() => asList(state.accounts), [state.accounts]);
  const transactions = useMemo(() => asList(state.transactions), [state.transactions]);
  const categories = useMemo(
    () => (state.categories && typeof state.categories === "object" ? state.categories : { expense: [], income: [] }),
    [state.categories],
  );
  const budgets = useMemo(() => asList(state.budgets), [state.budgets]);
  const recurring = useMemo(() => asList(state.recurring), [state.recurring]);
  const goals = useMemo(() => asList(state.goals), [state.goals]);
  const inbox = useMemo(() => asList(state.inbox), [state.inbox]);
  const todayISO = toISODate(new Date());

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

  const moneyPlanState = useMemo(
    () => ({ accounts, transactions, budgets, recurring }),
    [accounts, transactions, budgets, recurring],
  );

  const assistantState = useMemo(
    () => ({ accounts, transactions, budgets, recurring, goals, categories }),
    [accounts, transactions, budgets, recurring, goals, categories],
  );

  const moneyPlan = useMemo(
    () => calculateMonthlyPlan(moneyPlanState, { today: todayISO }),
    [moneyPlanState, todayISO],
  );

  const cashFlowForecast = useMemo(
    () => forecastCashFlow(moneyPlanState, { today: todayISO, days: 30 }),
    [moneyPlanState, todayISO],
  );

  const assistantRecommendations = useMemo(
    () => generatePersonalMoneyRecommendations(assistantState, { today: todayISO, maxItems: 5 }),
    [assistantState, todayISO],
  );
  const moneyCoachInsights = useMemo(
    () =>
      generateMoneyCoachInsights({
        transactions,
        accounts,
        categories,
        budgets,
        recurring,
        todayISO,
      }),
    [transactions, accounts, categories, budgets, recurring, todayISO],
  );

  const selectedDayTransactions = useMemo(() => {
    if (!selectedDate) return [];
    return selectVisibleTransactions(transactions, { monthKey, date: selectedDate })
      .slice()
      .sort(compareTxNewestFirst);
  }, [transactions, monthKey, selectedDate]);

  const visibleTransactions =
    viewMode === "calendar" && selectedDate ? selectedDayTransactions : snapshot.recentTransactions;
  const detailTransaction = useMemo(
    () => transactions.find((tx) => String(tx?.id || "") === String(detailTransactionId || "")) || null,
    [transactions, detailTransactionId],
  );
  const budgetPercent = clampPercent(snapshot.budgetSummary?.percent || 0);
  const hasMonthlyBudget = Number(snapshot.budgetSummary?.totalLimitSatang || 0) > 0;
  const budgetRemainingSatang = Number(snapshot.budgetSummary?.remainingSatang || 0);
  const isOverMonthlyBudget = hasMonthlyBudget && budgetRemainingSatang < 0;
  const budgetOverviewLabel = isOverMonthlyBudget ? "เกินงบเดือนนี้" : "เหลืองบเดือนนี้";
  const budgetOverviewValue = hasMonthlyBudget
    ? formatCurrency(Math.abs(budgetRemainingSatang))
    : "ยังไม่ได้ตั้งงบ";
  const budgetOverviewHint = hasMonthlyBudget
    ? `ใช้ไป ${budgetPercent}% ของงบ`
    : `แผนเงินคงเหลือ ${formatCurrency(moneyPlan.availableThisMonth || 0)}`;
  const topOverCategory = snapshot.budgetSummary?.topOverBudget
    ? categoryById.get(String(snapshot.budgetSummary.topOverBudget.categoryId || ""))
    : null;

  const openManual = (txType) => store.startNewTransaction({ entryMode: "manual", txType });
  const openScan = () => store.startNewTransaction({ entryMode: "scan", scanUploadKind: "receipt" });
  const openDebtPlan = () => navigate("debts");
  const openTransactionDetail = (tx) => {
    const id = String(tx?.id || "").trim();
    if (id) setDetailTransactionId(id);
  };
  const closeTransactionDetail = () => setDetailTransactionId("");
  const editTransactionFromDetail = (id) => {
    const editId = String(id || "").trim();
    if (!editId) return;
    setDetailTransactionId("");
    store.startEditTransaction(editId);
  };
  const handleMoneyCoachAction = (target) => {
    const view = String(target || "").trim();
    if (!view || view === "transactions") return;
    navigate(view === "planner" ? "budgets" : view);
  };
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
        <section className="ui-card-strong finance-dashboard-hero space-y-4 p-4">
          <SectionHeader
            eyebrow="Today / This month"
            title="ศูนย์บัญชาการการเงิน"
            subtitle="ภาพรวมเงินพร้อมใช้ งบเดือนนี้ และหนี้บัตรเครดิต"
            titleClassName="text-xl"
            action={
              <button type="button" onClick={() => navigate("budgets")} className="ui-btn ui-btn-secondary ui-btn-compact">
                ปรับงบ
              </button>
            }
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Wallet size={17} aria-hidden="true" />}
              label="เงินสด/บัญชีพร้อมใช้"
              value={formatCurrency(snapshot.accountSummary.totalAssetsSatang || 0)}
              hint="ไม่รวมวงเงินบัตรเครดิต"
              tone="success"
              onClick={() => navigate("accounts")}
            />
            <StatCard
              icon={<TrendingUp size={17} aria-hidden="true" />}
              label="ใช้ไปเดือนนี้"
              value={formatCurrency(snapshot.monthlySummary?.expense || 0)}
              hint={`รายรับ ${formatCurrency(snapshot.monthlySummary?.income || 0)}`}
              tone="info"
            />
            <StatCard
              icon={<PiggyBank size={17} aria-hidden="true" />}
              label={budgetOverviewLabel}
              value={budgetOverviewValue}
              hint={budgetOverviewHint}
              tone={isOverMonthlyBudget ? "danger" : hasMonthlyBudget ? "success" : "warning"}
              onClick={() => navigate("budgets")}
            />
            <StatCard
              icon={<CreditCard size={17} aria-hidden="true" />}
              label="หนี้บัตรเครดิตรวม"
              value={formatCurrency(snapshot.accountSummary.creditCardOutstandingSatang || 0)}
              hint="ดูแผนชำระและวันครบกำหนด"
              tone={snapshot.accountSummary.creditCardOutstandingSatang ? "danger" : "neutral"}
              onClick={openDebtPlan}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <QuickAction icon={<Plus size={17} />} label="เพิ่มรายจ่าย" primary onClick={() => openManual("expense")} />
            <QuickAction icon={<ReceiptText size={17} />} label="สแกนใบเสร็จ" onClick={openScan} />
            <QuickAction icon={<CreditCard size={17} />} label="ชำระบัตร" onClick={() => openManual("credit_payment")} />
            <QuickAction icon={<ArrowRightLeft size={17} />} label="ดูแผนหนี้" onClick={openDebtPlan} />
          </div>

          <div
            className={`ui-toast text-xs font-semibold ${
              cashFlowForecast.lowestBalance < 0
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {cashFlowForecast.lowestBalance < 0
              ? `30 วันข้างหน้า: เงินอาจติดลบ ${formatCurrency(Math.abs(cashFlowForecast.lowestBalance))} วันที่ ${formatDateShort(cashFlowForecast.lowestBalanceDate)}`
              : `30 วันข้างหน้า: คาดว่าจะเหลือ ${formatCurrency(cashFlowForecast.projectedEndingBalance)}`}
          </div>

        </section>

        <AssistantPanel
          recommendations={assistantRecommendations}
          onNavigate={(view) => navigate(view)}
        />

        <FinancialPlanPanel state={state} month={monthKey} />

        <MoneyCoachPanel insights={moneyCoachInsights} onAction={handleMoneyCoachAction} />

        <section className="ui-card-strong p-4">
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

        <PendingReceiptCard count={snapshot.pendingReceiptCount} onOpen={() => navigate("inbox")} />

        <section className="ui-card-strong p-4">
          <SectionHeader
            title="Monthly Budget"
            subtitle={
              snapshot.budgetSummary.totalLimitSatang
                ? `${formatCurrency(snapshot.budgetSummary.actualSatang)} used of ${formatCurrency(snapshot.budgetSummary.totalLimitSatang)}`
                : "Set a monthly or category budget to track remaining spend."
            }
            action={
              <button type="button" onClick={() => navigate("budgets")} className="ui-btn ui-btn-secondary ui-btn-compact">
                Budgets
              </button>
            }
          />
          {snapshot.budgetSummary.totalLimitSatang ? (
            <ProgressBar
              className="mt-3"
              value={budgetPercent}
              tone={snapshot.budgetSummary.overBudget ? "danger" : "success"}
              label="Monthly budget usage"
            />
          ) : null}
          {topOverCategory ? (
            <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              Over budget: {topOverCategory.name || topOverCategory.id}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Transactions"
            subtitle={viewMode === "calendar" && selectedDate ? selectedDate : "Recent ledger activity"}
            action={
              <div className="view-segmented min-w-24">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`view-segmented-btn grid h-9 w-9 place-items-center ${viewMode === "list" ? "is-active" : ""}`}
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className={`view-segmented-btn grid h-9 w-9 place-items-center ${viewMode === "calendar" ? "is-active" : ""}`}
                  aria-label="Calendar view"
                >
                  <CalendarDays size={16} />
                </button>
              </div>
            }
          />

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
            onSelect={openTransactionDetail}
          />
        </section>

        <section className="ui-card-strong p-4">
          <SectionHeader
            title="Accounts"
            action={
              <button type="button" onClick={() => navigate("accounts")} className="ui-btn ui-btn-secondary ui-btn-compact">
                Manage
              </button>
            }
          />
          <div className="finance-list mt-3">
            {snapshot.accountSummary.accounts.slice(0, 4).map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => navigate("accounts")}
                className="ui-row text-left"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[color:var(--text)]">{account.name || "Account"}</div>
                  <div className="text-xs font-medium text-[color:var(--muted)]">
                    {account.isCreditCard ? "Credit card" : account.type || "Account"}
                  </div>
                </div>
                <div className="ml-3 text-right">
                  <div className="text-sm font-semibold tabular-nums text-[color:var(--text)]">
                    {formatCurrency(account.isCreditCard ? account.outstandingSatang : account.balanceSatang)}
                  </div>
                  {account.isCreditCard ? (
                    <div className="text-[11px] font-medium text-[color:var(--muted)]">
                      Available {formatCurrency(account.availableCreditSatang || 0)}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
            {!snapshot.accountSummary.accounts.length ? (
              <div className="view-empty py-6 text-sm font-medium text-[color:var(--muted)]">
                Add cash, bank, wallet, or credit card accounts to see balances here.
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <TransactionDetailModal
        transaction={detailTransaction}
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        onClose={closeTransactionDetail}
        onEdit={editTransactionFromDetail}
      />
    </div>
  );
}
