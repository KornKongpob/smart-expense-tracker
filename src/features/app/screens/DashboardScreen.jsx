import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, CreditCard, PlusCircle, Repeat2, Target } from "lucide-react";

import { useExpenseNavigation } from "../navigation.js";
import { useExpenseApp } from "../AppProvider.jsx";
import AccountSheetPicker from "../AccountSheetPicker.jsx";
import DashboardAnalyticsPanels from "../DashboardAnalyticsPanels.jsx";
import AssistantPanel from "../../assistant/AssistantPanel.jsx";
import { generatePersonalMoneyRecommendations } from "../../assistant/recommendationEngine.js";
import MoneyCoachPanel from "../../../components/MoneyCoachPanel.jsx";
import TransactionEditSheet, {
  TransactionKindIcon,
  buildTransactionAccountLabel,
  buildTransactionDateTimeLabel,
  buildTransactionTitle,
  getTransactionAmountTone,
} from "../TransactionEditSheet.jsx";
import { AmountText, MetricCard, ScreenShell, StatusPill } from "../ui.jsx";
import { getPresetLabel, resolvePresetForAccount } from "../accountPresetUtils.js";
import { formatCurrency, toISODate } from "../../../utils/format.js";
import TransactionDetailModal from "../../../components/TransactionDetailModal.jsx";
import { generateMoneyCoachInsights } from "../../../utils/moneyCoach.js";

void AccountSheetPicker;

function percentOf(value, total) {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function hasValue(value) {
  return Math.abs(Number(value || 0)) > 0;
}

function toId(value) {
  return String(value || "").trim();
}

function getAccountMeta(account) {
  const presetLabel = getPresetLabel(resolvePresetForAccount(account), account.type);
  if (presetLabel && String(presetLabel).trim() !== String(account?.name || "").trim()) {
    return presetLabel;
  }
  return "";
}

export default function DashboardScreen() {
  const { navigateToPath, navigateToView, openAccountDetails } = useExpenseNavigation();
  const {
    dashboardSnapshot,
    cashflowSeries,
    loading,
    saving,
    plannerSummary,
    plannerDecisionSummary,
    budgetPlanSnapshot,
    selectedMonth,
    setSelectedMonth,
    accounts,
    categories,
    budgetRows,
    financialGoals,
    recentTransactions,
    recurringRules,
    recurringDueToday,
    dashboardPreviousSnapshot,
    setTransactionsFilters,
    updateTransaction,
    deleteTransaction,
    runRecurringNow,
  } = useExpenseApp();

  const snapshot = dashboardSnapshot || {};
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const usingSuggestedPlan = !budgetPlanSnapshot?.hasAppliedBudget && !budgetPlanSnapshot?.usesLegacyMonthlyTarget;
  const displayExpenseBudgetSatang = usingSuggestedPlan
    ? Number(budgetPlanSnapshot?.suggestedExpenseBudgetSatang || 0)
    : Number(budgetPlanSnapshot?.activeExpenseBudgetSatang || 0);
  const displayDailyBudgetSatang = usingSuggestedPlan
    ? Number(budgetPlanSnapshot?.suggestedDailyBudgetSatang || 0)
    : Number(budgetPlanSnapshot?.dailyBudgetSatang || 0);
  const displayShortfallSatang = usingSuggestedPlan
    ? Number(budgetPlanSnapshot?.suggestedShortfallSatang || 0)
    : Number(budgetPlanSnapshot?.shortfallSatang || 0);
  const displaySurplusSatang = budgetPlanSnapshot?.debtStrategyMode === "paydown"
    ? usingSuggestedPlan
      ? Number(budgetPlanSnapshot?.suggestedDebtExtraSatang || 0)
      : Number(budgetPlanSnapshot?.debtExtraSatang || 0)
    : usingSuggestedPlan
      ? Number(budgetPlanSnapshot?.suggestedBufferSatang || 0)
      : Number(budgetPlanSnapshot?.bufferSatang || 0);
  const progress = percentOf(snapshot.expense_satang, displayExpenseBudgetSatang);
  const plannerAttentionCount = Number(
    plannerDecisionSummary?.attentionCount ?? budgetPlanSnapshot?.plannerAttentionCount ?? 0,
  );
  const plannerConfidencePct = Math.max(
    0,
    Math.min(
      100,
      Math.round(Number(plannerDecisionSummary?.confidenceScore ?? budgetPlanSnapshot?.plannerConfidenceScore ?? 0) * 100),
    ),
  );
  const pendingReviewCount = Number(snapshot.pending_review_count || 0);
  const unmatchedCount = Number(snapshot.unmatched_count || 0);
  const topCategories = Array.isArray(snapshot.top_categories) ? snapshot.top_categories : [];
  const snapshotAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const allAccounts = useMemo(() => (Array.isArray(accounts) ? accounts : []), [accounts]);
  const assistantState = useMemo(
    () => ({
      accounts: allAccounts,
      categories,
      budgetRows,
      financialGoals,
      recentTransactions,
      recurringRules,
    }),
    [allAccounts, budgetRows, categories, financialGoals, recentTransactions, recurringRules],
  );
  const assistantRecommendations = useMemo(
    () => generatePersonalMoneyRecommendations(assistantState, { today: todayISO, maxItems: 5 }),
    [assistantState, todayISO],
  );
  const moneyCoachInsights = useMemo(
    () =>
      generateMoneyCoachInsights({
        transactions: recentTransactions,
        accounts: allAccounts,
        categories,
        budgets: budgetRows,
        recurring: recurringRules,
        todayISO,
      }),
    [recentTransactions, allAccounts, categories, budgetRows, recurringRules, todayISO],
  );
  const accountMap = useMemo(
    () => new Map(allAccounts.map((account) => [toId(account?.id), account])),
    [allAccounts],
  );
  const history = Array.isArray(recentTransactions) ? recentTransactions.slice(0, 12) : [];
  const recurringDueCount = Array.isArray(recurringDueToday) ? recurringDueToday.length : 0;
  const hasAccounts = snapshotAccounts.length > 0;
  const hasCategories = topCategories.length > 0;
  const rawCashflow = Array.isArray(cashflowSeries) ? cashflowSeries : [];
  const [detailTransaction, setDetailTransaction] = useState(null);
  const [activeTransaction, setActiveTransaction] = useState(null);
  const hasCashflow = rawCashflow.some(
    (row) => hasValue(row?.income_satang) || hasValue(row?.expense_satang),
  );
  const chartPoints = hasCashflow ? rawCashflow : [];
  const chartMax = hasCashflow
    ? Math.max(
        ...chartPoints.flatMap((row) => [Number(row?.income_satang || 0), Number(row?.expense_satang || 0)]),
        1,
      )
    : 1;
  const hasActivity =
    hasCashflow ||
    hasCategories ||
    hasValue(snapshot.expense_satang) ||
    hasValue(snapshot.income_satang) ||
    hasValue(snapshot.net_satang) ||
    pendingReviewCount > 0 ||
    unmatchedCount > 0;
  const showStarterCardFirst = !hasAccounts || !hasActivity;
  const hideSummaryMetrics = !hasAccounts && !hasActivity;
  const totalAccountBalanceSatang = snapshotAccounts.reduce(
    (sum, account) => sum + Number(account?.balance_satang || 0),
    0,
  );
  const budgetRemainingSatang = Number(displayExpenseBudgetSatang || 0) - Number(snapshot.expense_satang || 0);
  const hasExpenseBudget = Number(displayExpenseBudgetSatang || 0) > 0;
  const budgetOverviewTone = !hasExpenseBudget
    ? "default"
    : budgetRemainingSatang < 0
      ? "danger"
      : progress >= 85
        ? "warning"
        : "success";
  const attentionCount = pendingReviewCount + unmatchedCount + recurringDueCount + plannerAttentionCount;
  const dashboardOverviewCards = [
    {
      id: "accounts",
      icon: CreditCard,
      label: "ยอดบัญชีสุทธิ",
      value: hasAccounts ? formatCurrency(totalAccountBalanceSatang) : "-",
      detail: hasAccounts ? `${snapshotAccounts.length} บัญชีที่ติดตามอยู่` : "เพิ่มบัญชีเพื่อเริ่มสรุปยอด",
      tone: totalAccountBalanceSatang < 0 ? "danger" : "default",
    },
    {
      id: "expense",
      icon: ArrowUpRight,
      label: "ใช้เดือนนี้",
      value: formatCurrency(snapshot.expense_satang || 0),
      detail: hasValue(snapshot.income_satang)
        ? `รับเข้า ${formatCurrency(snapshot.income_satang || 0)}`
        : "ยังไม่มีรายรับในเดือนนี้",
      tone: "danger",
    },
    {
      id: "budget",
      icon: Target,
      label: hasExpenseBudget && budgetRemainingSatang < 0 ? "เกินงบ" : "เหลืองบ",
      value: hasExpenseBudget ? formatCurrency(Math.abs(budgetRemainingSatang)) : formatCurrency(displayExpenseBudgetSatang || 0),
      detail: hasExpenseBudget ? `ใช้ไป ${progress}% ของงบเดือนนี้` : "ตั้งงบเพื่อดู pace การใช้จ่าย",
      tone: budgetOverviewTone,
    },
    {
      id: "attention",
      icon: CalendarClock,
      label: "ต้องดูแล",
      value: `${attentionCount}`,
      detail: attentionCount ? "รายการรอตรวจ กฎถึงรอบ หรือหมวดที่ควรปรับ" : "ไม่มีงานค้างสำคัญตอนนี้",
      tone: attentionCount ? "warning" : "success",
    },
  ];

  const buildChartPath = (key) =>
    chartPoints
      .map((point, index) => {
        const x = (index / Math.max(chartPoints.length - 1, 1)) * (320 - 8) + 4;
        const y = 160 - (Number(point?.[key] || 0) / chartMax) * (160 - 24) - 8;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

  const openFullHistory = () => {
    setTransactionsFilters((current) => ({
      ...current,
      monthKey: selectedMonth,
      kind: "all",
      accountId: "",
      categoryId: "",
      query: "",
    }));
    navigateToPath("/transactions");
  };
  const handleMoneyCoachAction = (target) => {
    const view = toId(target);
    if (!view) return;
    if (view === "transactions") {
      openFullHistory();
      return;
    }
    if (view === "budgets" || view === "planner") {
      navigateToView("planner");
      return;
    }
    navigateToView(view);
  };
  const editTransactionFromDetail = (id) => {
    const targetId = toId(id);
    const target =
      (Array.isArray(recentTransactions) ? recentTransactions : []).find(
        (transaction) => toId(transaction?.id) === targetId,
      ) || detailTransaction;
    setDetailTransaction(null);
    setActiveTransaction(target || null);
  };

  const starterCard = (
    <article
      className={[
        "ui-card",
        "finance-panel",
        "finance-dashboard-next",
        showStarterCardFirst ? "finance-dashboard-next-primary" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="finance-panel-head">
        <div className="finance-panel-title">{hasAccounts ? (hasActivity ? "ทางลัด" : "เริ่มบันทึก") : "เริ่มต้น"}</div>
      </div>
      <div className="finance-dashboard-next-copy">
        {hasAccounts
          ? hasActivity
            ? "เพิ่มรายการวันนี้หรือเปิดแผนการเงินเพื่อดูเป้าหมายและแผนชำระหนี้"
            : "เริ่มบันทึกรายการแรกหรือวางเป้าหมายการเงินได้เลย"
          : "สร้างบัญชีก่อนเพื่อเริ่มวางแผนและติดตามการเงิน"}
      </div>
      <div className="finance-dashboard-actions">
        {hasAccounts ? (
          <>
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateToView("add")}>
              <PlusCircle size={16} />
              เพิ่มรายการ
            </button>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => navigateToView("planner")}>
              <Target size={16} />
              เปิดแผนการเงิน
            </button>
          </>
        ) : (
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateToView("accounts")}>
            <CreditCard size={16} />
            สร้างบัญชี
          </button>
        )}
      </div>
    </article>
  );

  return (
    <ScreenShell title="ภาพรวม">
      {showStarterCardFirst ? starterCard : null}

      <AssistantPanel
        recommendations={assistantRecommendations}
        onNavigate={(view) => navigateToView(view)}
        actionViewAliases={{ planner: "planner", budgets: "planner" }}
      />

      <MoneyCoachPanel insights={moneyCoachInsights} onAction={handleMoneyCoachAction} />

      <article className="ui-card finance-panel finance-month-card">
        <div className="finance-month-card-copy">
          <div className="finance-panel-title">เดือนที่กำลังดู</div>
          <div className="finance-panel-copy">เลือกเดือนที่ต้องการสรุปและติดตามแผน</div>
        </div>
        <label className="finance-month-picker finance-month-picker-card">
          <input
            className="ui-input"
            type="month"
            name="dashboardMonth"
            aria-label="เลือกเดือนสรุป"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
        </label>
      </article>

      {!hideSummaryMetrics ? (
        <>
          <section className="finance-dashboard-overview-grid" data-testid="dashboard-money-overview">
            {dashboardOverviewCards.map((card) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.id}
                  className={[
                    "finance-dashboard-overview-card",
                    `finance-dashboard-overview-card-${card.tone}`,
                  ].join(" ")}
                >
                  <div className="finance-dashboard-overview-icon" aria-hidden="true">
                    <Icon size={18} />
                  </div>
                  <div className="finance-dashboard-overview-copy">
                    <span className="finance-dashboard-overview-label">{card.label}</span>
                    <strong className="finance-dashboard-overview-value">{card.value}</strong>
                    <span className="finance-dashboard-overview-detail">{card.detail}</span>
                  </div>
                </article>
              );
            })}
          </section>

          <article className="ui-card finance-panel finance-dashboard-hero">
        <div className="finance-dashboard-hero-head">
          <div>
            <div className="finance-panel-title">สรุปเงินเดือนนี้</div>
            <div className="finance-dashboard-total">{formatCurrency(snapshot.expense_satang || 0)}</div>
            <div className="finance-dashboard-hero-subtitle">รายจ่ายรวมที่บันทึกในเดือนนี้</div>
          </div>
          {loading ? <StatusPill tone="default">อัปเดต</StatusPill> : null}
        </div>

        <div className="finance-dashboard-mini-grid">
          <div className="finance-dashboard-mini-card">
            <span>รายรับ</span>
            <strong>{formatCurrency(snapshot.income_satang || 0)}</strong>
          </div>
          <div className="finance-dashboard-mini-card">
            <span>สุทธิ</span>
            <strong>{formatCurrency(snapshot.net_satang || 0)}</strong>
          </div>
        </div>

        <div className="finance-dashboard-goal">
          <div className="finance-dashboard-goal-copy">
            <span>{usingSuggestedPlan ? "งบแนะนำ" : "งบเดือนนี้"}</span>
            <strong>{formatCurrency(displayExpenseBudgetSatang || 0)}</strong>
          </div>
          <div className={`dashboard-progress finance-progress-bar ${progress >= 85 ? "dashboard-progress--alert" : ""}`}>
            <span style={{ width: `${progress || 0}%` }} />
          </div>
          {(pendingReviewCount || unmatchedCount) ? (
            <div className="finance-chip-grid">
              {pendingReviewCount ? <StatusPill tone="warning">รอตรวจ {pendingReviewCount}</StatusPill> : null}
              {unmatchedCount ? <StatusPill tone="warning">ยังไม่จับคู่ {unmatchedCount}</StatusPill> : null}
            </div>
          ) : null}
          {(plannerAttentionCount || plannerConfidencePct) ? (
            <div className="finance-chip-grid">
              {plannerAttentionCount ? <StatusPill tone="warning">ควรปรับ {plannerAttentionCount} หมวด</StatusPill> : null}
              {plannerConfidencePct ? <StatusPill tone="default">ความมั่นใจ {plannerConfidencePct}%</StatusPill> : null}
            </div>
          ) : null}
          {(plannerDecisionSummary?.title || plannerDecisionSummary?.copy) ? (
            <div className="finance-dashboard-planner-note">
              {plannerDecisionSummary?.title ? <strong>{plannerDecisionSummary.title}</strong> : null}
              {plannerDecisionSummary?.copy ? <span>{plannerDecisionSummary.copy}</span> : null}
            </div>
          ) : null}
        </div>
          </article>

          <section className="finance-grid finance-dashboard-planner-grid">
        <MetricCard
          label="งบรายวัน"
          value={formatCurrency(displayDailyBudgetSatang)}
          hint={`${budgetPlanSnapshot?.daysRemaining || 0} วันที่เหลือในเดือนนี้`}
        />
        <MetricCard
          label="เงินออมที่กันไว้"
          value={formatCurrency(budgetPlanSnapshot?.savingsReserveSatang || 0)}
          hint={`หนี้ขั้นต่ำ ${formatCurrency(budgetPlanSnapshot?.debtMinimumSatang || 0)}`}
          tone="success"
        />
        <MetricCard
          label={budgetPlanSnapshot?.debtStrategyMode === "paydown" ? "เงินโปะหนี้เพิ่ม" : "เงินสำรอง"}
          value={formatCurrency(displaySurplusSatang)}
          hint={budgetPlanSnapshot?.debtTarget ? "มีเป้าหมายชำระหนี้สำหรับเดือนนี้" : `${plannerSummary.activeDebtCount} แผนชำระหนี้`}
          tone="default"
        />
        <MetricCard
          label="สถานะแผน"
          value={displayShortfallSatang > 0 ? `-${formatCurrency(displayShortfallSatang)}` : formatCurrency(displaySurplusSatang)}
          hint={displayShortfallSatang > 0 ? "ควรลดงบหรือปรับแผน" : "แผนยังอยู่ในกรอบ"}
          tone={displayShortfallSatang > 0 ? "danger" : "success"}
        />
          </section>
        </>
      ) : null}

      {!showStarterCardFirst ? starterCard : null}

      {hasCashflow ? (
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div className="finance-panel-title">กระแสเงิน</div>
          </div>
          <div className="finance-chart">
            <svg viewBox="0 0 320 160" className="finance-chart-svg" aria-hidden="true">
              <path d={buildChartPath("expense_satang")} className="finance-chart-line finance-chart-line-expense" />
              <path d={buildChartPath("income_satang")} className="finance-chart-line finance-chart-line-income" />
            </svg>
            <div className="finance-chart-legend">
              <span>
                <i className="finance-dot finance-dot-income" />
                รายรับ
              </span>
              <span>
                <i className="finance-dot finance-dot-expense" />
                รายจ่าย
              </span>
            </div>
          </div>
        </article>
      ) : null}

      <article className="ui-card finance-panel finance-recurring-summary-card">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">รายการประจำ</div>
            <div className="finance-panel-copy">ตั้งกฎรายรับ รายจ่าย หรือโอนเงินที่เกิดซ้ำ แล้วให้ระบบสร้างรายการให้อัตโนมัติตามรอบ</div>
          </div>
          {recurringDueCount ? <StatusPill tone="warning">ถึงรอบ {recurringDueCount}</StatusPill> : <StatusPill tone="default">ยังไม่มีคิววันนี้</StatusPill>}
        </div>
        <div className="finance-dashboard-actions">
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => void runRecurringNow()}
            disabled={saving}
          >
            <Repeat2 size={16} />
            สร้างรายการตอนนี้
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => navigateToView("recurring")}>
            <CalendarClock size={16} />
            จัดการรายการประจำ
          </button>
        </div>
      </article>

      <DashboardAnalyticsPanels
        snapshot={snapshot}
        previousSnapshot={dashboardPreviousSnapshot}
        cashflowSeries={cashflowSeries}
      />

      {history.length ? (
        <article className="ui-card finance-panel" data-testid="dashboard-recent-history">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">รายการล่าสุด</div>
              <div className="finance-panel-copy">แตะรายการเพื่อเปิดแก้ไขหรือดูสรุปสั้น ๆ ได้ทันที</div>
            </div>
          </div>

          <div className="finance-list">
            {history.map((transaction) => {
              const kindKey = String(transaction?.kind || "expense").trim().toLowerCase();
              const accountLabel = buildTransactionAccountLabel(transaction, accountMap);
              const dateTimeLabel = buildTransactionDateTimeLabel(transaction);

              return (
                <button
                  key={transaction.id}
                  type="button"
                  className="finance-list-button finance-history-button"
                  onClick={() => setDetailTransaction(transaction)}
                  data-testid={`dashboard-transaction-${transaction.id}`}
                >
                  <div className="finance-row finance-history-row">
                    <div className="finance-row-main">
                      <span className={["finance-category-icon", "finance-history-icon", `finance-history-icon-${kindKey}`].join(" ")}>
                        <TransactionKindIcon kind={transaction.kind} />
                      </span>
                      <div className="finance-account-copy finance-history-copy">
                        <div className="finance-row-title">{buildTransactionTitle(transaction)}</div>
                        {accountLabel ? <div className="finance-row-meta finance-history-account">{accountLabel}</div> : null}
                      </div>
                    </div>

                    <div className="finance-row-side finance-history-side">
                      <AmountText value={transaction.amount_satang} tone={getTransactionAmountTone(transaction.kind)} />
                      {dateTimeLabel ? <div className="finance-row-meta finance-history-time">{dateTimeLabel}</div> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="finance-dashboard-actions">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={openFullHistory}>
              ดูทั้งหมด
            </button>
          </div>
        </article>
      ) : null}

      {(hasCategories || hasAccounts) ? (
        <section className="finance-grid finance-grid-main">
          {hasCategories ? (
            <article className="ui-card finance-panel" data-testid="dashboard-top-categories">
              <div className="finance-panel-head">
                <div className="finance-panel-title">หมวด</div>
              </div>

              <div className="finance-list">
                {topCategories.map((category) => (
                  <div key={category.id} className="finance-row" data-testid={`dashboard-category-${category.id}`}>
                    <div className="finance-row-main">
                      <span
                        className="finance-category-icon"
                        style={{ backgroundColor: `${category.color}18`, color: category.color }}
                      >
                        {category.icon || "•"}
                      </span>
                      <div className="finance-row-title">{category.name}</div>
                    </div>
                    <AmountText value={category.total_satang} />
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {hasAccounts ? (
            <article className="ui-card finance-panel">
              <div className="finance-panel-head">
                <div className="finance-panel-title">บัญชี</div>
              </div>

              <div className="finance-list">
                {snapshotAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="finance-list-button finance-account-button finance-dashboard-account-button"
                    onClick={() => openAccountDetails(account.id)}
                    data-testid={`dashboard-account-${account.id}`}
                  >
                    <div className="finance-row">
                      <div className="finance-row-main">
                        <span className="finance-category-icon finance-account-icon">{account.icon || "•"}</span>
                        <div>
                          <div className="finance-row-title">{account.name}</div>
                          {getAccountMeta(account) ? <div className="finance-row-meta">{getAccountMeta(account)}</div> : null}
                        </div>
                      </div>
                      <div className="finance-balance">
                        {account.type === "credit" || account.type === "loan" ? (
                          <span className="finance-account-liability-label">ยอดหนี้</span>
                        ) : null}
                        <AmountText
                          value={account.balance_satang}
                          tone={
                            Number(account.balance_satang || 0) < 0 || account.type === "credit" || account.type === "loan"
                              ? "danger"
                              : "default"
                          }
                        />
                        <ArrowUpRight size={14} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      <TransactionEditSheet
        transaction={activeTransaction}
        open={Boolean(activeTransaction)}
        onClose={() => setActiveTransaction(null)}
        accounts={allAccounts}
        categories={categories}
        saving={saving}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
      />
      <TransactionDetailModal
        transaction={detailTransaction}
        transactions={recentTransactions}
        accounts={allAccounts}
        categories={categories}
        onClose={() => setDetailTransaction(null)}
        onEdit={editTransactionFromDetail}
      />
    </ScreenShell>
  );
}
