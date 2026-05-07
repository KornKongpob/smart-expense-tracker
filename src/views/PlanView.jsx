import { useMemo } from "react";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  Gauge,
  PiggyBank,
  ReceiptText,
  Repeat2,
  Target,
} from "lucide-react";

import { getUpcomingBills, summarizeBills } from "../features/bills/detectBills.js";
import { calculateDebtOverview, getDebtAccounts } from "../features/debts/debtPayoff.js";
import { summarizeGoals } from "../features/goals/goalCalculators.js";
import { calculateMonthlyPlan, forecastCashFlow } from "../features/money-plan/moneyPlan.js";
import { MetricCard, ScreenShell, StatusPill } from "../features/app/ui.jsx";
import { formatCurrency, formatDateShort, toISODate } from "../utils/format.js";
import { ensureSatangInt } from "../utils/money.js";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function cleanId(value) {
  return String(value || "").trim();
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function readSatang(...values) {
  const value = firstDefined(...values);
  return ensureSatangInt(value, 0);
}

function normalizeTransaction(tx) {
  const source = tx && typeof tx === "object" ? tx : {};
  const type = cleanText(source.type || source.kind || source.txType || source.tx_type || "expense").toLowerCase();
  const accountId = cleanId(source.accountId ?? source.account_id ?? source.fromAccountId ?? source.from_account_id);
  const categoryId = cleanId(source.categoryId ?? source.category_id ?? source.category);

  return {
    ...source,
    id: cleanId(source.id),
    type,
    kind: type,
    amount: Math.abs(readSatang(source.amount, source.amountSatang, source.amount_satang)),
    accountId,
    account_id: accountId,
    category: categoryId,
    categoryId,
    category_id: categoryId,
    date: cleanText(source.date || source.transactionDate || source.postedDate).slice(0, 10),
    isTransfer: source.isTransfer === true || source.is_transfer === true || type === "transfer",
    isSplitParent:
      source.isSplitParent === true ||
      source.is_split_parent === true ||
      String(source.splitRole || source.split_role || "").toLowerCase() === "parent",
    adjustmentEffect: source.adjustmentEffect || source.adjustment_effect || "",
  };
}

function transactionNet(tx) {
  if (!tx?.accountId || tx?.isSplitParent) return 0;
  if (tx.type === "income") return tx.amount;
  if (tx.type === "expense") {
    return String(tx.adjustmentEffect || "").toLowerCase() === "subtract" ? tx.amount : -tx.amount;
  }
  return 0;
}

function normalizeBudget(row) {
  const source = row && typeof row === "object" ? row : {};
  return {
    ...source,
    id: cleanId(source.id),
    month: cleanText(source.month || source.monthKey || source.month_key),
    categoryId: cleanId(source.categoryId ?? source.category_id ?? source.category),
    limit: Math.max(0, readSatang(source.limit, source.limitSatang, source.limit_satang)),
  };
}

function normalizeRecurring(rule) {
  const source = rule && typeof rule === "object" ? rule : {};
  const type = cleanText(source.type || source.kind || source.txType || "expense").toLowerCase();

  return {
    ...source,
    id: cleanId(source.id),
    type,
    kind: type,
    amount: Math.abs(readSatang(source.amount, source.amountSatang, source.amount_satang)),
    accountId: cleanId(source.accountId ?? source.account_id),
    categoryId: cleanId(source.categoryId ?? source.category_id ?? source.category),
    note: cleanText(source.note || source.label || source.name || "Recurring"),
    frequency: cleanText(source.frequency || "monthly").toLowerCase(),
    interval: Math.max(1, Math.trunc(Number(source.interval ?? source.interval_count ?? 1) || 1)),
    startDate: cleanText(source.startDate ?? source.start_date).slice(0, 10),
    lastGenerated: cleanText(source.lastGenerated ?? source.last_generated_date).slice(0, 10),
    enabled: source.enabled !== false,
  };
}

function normalizeAccounts(accounts, transactions) {
  const netByAccount = new Map();
  for (const tx of transactions) {
    if (!tx.accountId) continue;
    netByAccount.set(tx.accountId, (netByAccount.get(tx.accountId) || 0) + transactionNet(tx));
  }

  return listOf(accounts)
    .map((account) => {
      const source = account && typeof account === "object" ? account : {};
      const id = cleanId(source.id ?? source.accountId ?? source.account_id);
      if (!id) return null;

      const currentBalance = firstDefined(
        source.balanceSatang,
        source.balance_satang,
        source.currentBalanceSatang,
        source.current_balance_satang,
        source.balance,
      );
      const hasCurrentBalance = currentBalance !== undefined;
      const openingBalance = hasCurrentBalance
        ? readSatang(currentBalance) - (netByAccount.get(id) || 0)
        : readSatang(source.openingBalance, source.openingBalanceSatang, source.opening_balance_satang);

      return {
        ...source,
        id,
        name: cleanText(source.name || source.accountName || "บัญชี"),
        type: cleanText(source.type || source.kind || "cash").toLowerCase(),
        openingBalance,
        creditLimit: Math.max(
          0,
          readSatang(source.creditLimit, source.creditLimitSatang, source.credit_limit_satang, source.limit),
        ),
        statementDay: source.statementDay ?? source.statement_day ?? "",
        dueDay: source.dueDay ?? source.due_day ?? source.paymentDueDay ?? "",
        apr: source.apr ?? source.aprPct ?? source.aprPercent,
        aprBps: source.aprBps ?? source.apr_bps,
        minimumPayment: source.minimumPayment ?? source.minimumPaymentSatang ?? source.minimum_payment_satang,
        extraPayment: source.extraPayment ?? source.extraPaymentSatang ?? source.extra_payment_satang,
      };
    })
    .filter(Boolean);
}

function normalizePlanState(state = {}) {
  const source = state && typeof state === "object" ? state : {};
  const transactions = listOf(source.transactions)
    .map(normalizeTransaction)
    .filter((tx) => tx.date && tx.amount > 0);
  const goals = listOf(source.goals).length ? source.goals : source.financialGoals;

  return {
    accounts: normalizeAccounts(source.accounts, transactions),
    transactions,
    budgets: listOf(source.budgets || source.budgetRows)
      .map(normalizeBudget)
      .filter((budget) => budget.month && budget.categoryId && budget.limit > 0),
    recurring: listOf(source.recurring || source.recurringRules)
      .map(normalizeRecurring)
      .filter((rule) => rule.amount > 0),
    goals: listOf(goals),
    categories: source.categories || { expense: [], income: [] },
  };
}

function formatMaybeDate(value) {
  const iso = cleanText(value).slice(0, 10);
  return iso ? formatDateShort(iso) : "-";
}

function PlanMetricGrid({ plan, goalsSummary, debtOverview, billsSummary }) {
  return (
    <section className="finance-grid finance-dashboard-planner-grid" data-testid="plan-summary">
      <MetricCard
        label="ใช้ได้ต่อวัน"
        value={formatCurrency(plan.safeToSpendPerDay)}
        hint={`เดือนนี้เหลือ ${formatCurrency(plan.availableThisMonth)}`}
        tone={plan.safeToSpendPerDay > 0 ? "success" : "warning"}
      />
      <MetricCard
        label="เป้าหมาย active"
        value={`${goalsSummary.activeCount}`}
        hint={goalsSummary.activeCount ? `ต้องออม ${formatCurrency(goalsSummary.monthlyContributionNeeded)}/เดือน` : "ยังไม่มีเป้าหมาย active"}
        tone={goalsSummary.activeCount ? "default" : "warning"}
      />
      <MetricCard
        label="หนี้รวม"
        value={formatCurrency(debtOverview.totalDebt)}
        hint={debtOverview.totalDebt ? `ขั้นต่ำ ${formatCurrency(debtOverview.totalMinimumPayment)}` : "ยังไม่มีบัญชีเครดิต"}
        tone={debtOverview.totalDebt ? "warning" : "success"}
      />
      <MetricCard
        label="บิลใกล้ถึง"
        value={`${billsSummary.dueSoon.length}`}
        hint="ใน 7 วันข้างหน้า"
        tone={billsSummary.dueSoon.length ? "warning" : "success"}
      />
    </section>
  );
}

function PlanRow({ icon, title, subtitle, value, badge, onClick }) {
  return (
    <button type="button" className="finance-list-button" onClick={onClick}>
      <div className="finance-row">
        <div className="finance-row-main">
          <span className="finance-category-icon finance-account-icon">{icon}</span>
          <div className="finance-settings-row-copy">
            <div className="finance-row-title">{title}</div>
            <div className="finance-row-meta finance-row-meta-wrap">{subtitle}</div>
          </div>
        </div>
        <div className="finance-row-side">
          {badge ? <StatusPill tone={badge.tone || "default"}>{badge.label}</StatusPill> : null}
          {value ? <div className="finance-row-title tabular-nums">{value}</div> : null}
          <ArrowRight size={16} />
        </div>
      </div>
    </button>
  );
}

function ForecastSection({ forecast }) {
  const events = listOf(forecast.events).slice(0, 5);

  return (
    <article className="ui-card finance-panel" data-testid="plan-cashflow">
      <div className="finance-panel-head">
        <div>
          <div className="finance-panel-title">Cash-flow Forecast</div>
          <div className="finance-panel-copy">
            {forecast.startDate} ถึง {forecast.endDate}
          </div>
        </div>
        {forecast.lowestBalance < 0 ? (
          <StatusPill tone="warning">เสี่ยงติดลบ</StatusPill>
        ) : (
          <StatusPill tone="success">ยังเป็นบวก</StatusPill>
        )}
      </div>

      <div className="finance-grid finance-dashboard-planner-grid">
        <MetricCard label="ยอดเริ่ม" value={formatCurrency(forecast.startingBalance)} hint="บัญชีใช้จ่ายได้" />
        <MetricCard
          label="คาดว่าสิ้นงวด"
          value={formatCurrency(forecast.projectedEndingBalance)}
          hint="หลัง recurring ที่รู้แล้ว"
          tone={forecast.projectedEndingBalance < 0 ? "danger" : "success"}
        />
        <MetricCard
          label="ยอดต่ำสุด"
          value={formatCurrency(forecast.lowestBalance)}
          hint={formatMaybeDate(forecast.lowestBalanceDate)}
          tone={forecast.lowestBalance < 0 ? "danger" : "default"}
        />
      </div>

      {events.length ? (
        <div className="finance-list">
          {events.map((event, index) => (
            <div key={`${event.date}-${event.label}-${index}`} className="finance-row">
              <div className="finance-row-main">
                <span className="finance-category-icon finance-account-icon">
                  <CalendarClock size={16} />
                </span>
                <div className="finance-account-copy">
                  <div className="finance-row-title">{event.label || "Recurring"}</div>
                  <div className="finance-row-meta">{formatMaybeDate(event.date)}</div>
                </div>
              </div>
              <div className="finance-row-side">
                <div className="finance-row-title tabular-nums">{formatCurrency(event.amount)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="finance-inline-note">ยังไม่มี recurring ใน 30 วันข้างหน้า</div>
      )}
    </article>
  );
}

export default function PlanView({ state = {}, today = null, onNavigate }) {
  const todayIso = useMemo(() => toISODate(today || new Date()), [today]);
  const planState = useMemo(() => normalizePlanState(state), [state]);
  const monthlyPlan = useMemo(() => calculateMonthlyPlan(planState, { today: todayIso }), [planState, todayIso]);
  const forecast = useMemo(() => forecastCashFlow(planState, { today: todayIso, days: 30 }), [planState, todayIso]);
  const goalsSummary = useMemo(() => summarizeGoals(planState.goals, { today: todayIso }), [planState.goals, todayIso]);
  const debts = useMemo(() => getDebtAccounts(planState, { today: todayIso }), [planState, todayIso]);
  const debtOverview = useMemo(
    () => calculateDebtOverview(planState, { today: todayIso, debts, dueSoonDays: 7 }),
    [debts, planState, todayIso],
  );
  const billsSummary = useMemo(() => summarizeBills(planState, { today: todayIso, dueSoonDays: 7 }), [planState, todayIso]);
  const upcomingBills = useMemo(
    () => getUpcomingBills(planState, { today: todayIso }).filter((bill) => bill?.type !== "income"),
    [planState, todayIso],
  );

  const openView = (view) => {
    if (typeof onNavigate === "function") onNavigate(view);
  };

  const focusDebt = debtOverview.highestAprDebt || debtOverview.highestUtilizationDebt;

  return (
    <ScreenShell
      title="แผนการเงิน"
      subtitle="งบ ออม หนี้ บิล และเงินเหลือใช้"
      headerMode="visible"
    >
      <PlanMetricGrid
        plan={monthlyPlan}
        goalsSummary={goalsSummary}
        debtOverview={debtOverview}
        billsSummary={billsSummary}
      />

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">ศูนย์วางแผน</div>
            <div className="finance-panel-copy">เลือกงานวางแผนที่ต้องการจัดการต่อ</div>
          </div>
        </div>

        <div className="finance-list">
          <PlanRow
            icon={<Target size={18} />}
            title="Budgets"
            subtitle={monthlyPlan.monthlyBudgetLimit ? `เหลืองบเดือนนี้ ${formatCurrency(monthlyPlan.monthlyBudgetRemaining)}` : "ตั้งงบเดือนนี้เพื่อคุมกรอบใช้จ่าย"}
            value={monthlyPlan.monthlyBudgetLimit ? formatCurrency(monthlyPlan.monthlyBudgetLimit) : ""}
            badge={monthlyPlan.safeToSpendPerDay <= 0 ? { tone: "warning", label: "ควรดู" } : null}
            onClick={() => openView("budgets")}
          />
          <PlanRow
            icon={<PiggyBank size={18} />}
            title="Savings Goals"
            subtitle={goalsSummary.activeCount ? `กำลังออม ${goalsSummary.activeCount} เป้าหมาย` : "กองทุนฉุกเฉิน ทริป ของใหญ่ หรือเงินสำรองหนี้"}
            value={goalsSummary.activeCount ? formatCurrency(goalsSummary.totalCurrent) : ""}
            onClick={() => openView("goals")}
          />
          <PlanRow
            icon={<CreditCard size={18} />}
            title="Debt Planner"
            subtitle={focusDebt ? `โฟกัส ${focusDebt.name}` : "ดูยอดหนี้ วันครบกำหนด และแผนปิดหนี้"}
            value={debtOverview.totalDebt ? formatCurrency(debtOverview.totalDebt) : ""}
            badge={debtOverview.dueSoon.length ? { tone: "warning", label: "ใกล้ครบกำหนด" } : null}
            onClick={() => openView("debts")}
          />
          <PlanRow
            icon={<ReceiptText size={18} />}
            title="Bills & Subscriptions"
            subtitle={upcomingBills.length ? `พบรายการข้างหน้า ${upcomingBills.length} รายการ` : "รู้ก่อนเงินออก และหา subscription ที่อาจลืมอยู่"}
            value={billsSummary.monthlyBillsTotal || billsSummary.monthlySubscriptionTotal ? formatCurrency(billsSummary.monthlyBillsTotal + billsSummary.monthlySubscriptionTotal) : ""}
            badge={billsSummary.priceChanges.length ? { tone: "warning", label: "ยอดเปลี่ยน" } : null}
            onClick={() => openView("bills")}
          />
          <PlanRow
            icon={<Repeat2 size={18} />}
            title="Recurring"
            subtitle={planState.recurring.length ? `เปิดใช้ ${planState.recurring.filter((item) => item.enabled !== false).length}/${planState.recurring.length} กฎ` : "ตั้งรายรับ รายจ่าย หรือโอนเงินที่เกิดซ้ำ"}
            onClick={() => openView("recurring")}
          />
        </div>
      </article>

      <ForecastSection forecast={forecast} />

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">สรุปที่ควรรู้ตอนนี้</div>
            <div className="finance-panel-copy">ตัวเลขนี้เป็นการคำนวณเพื่อช่วยวางแผน ไม่ใช่คำแนะนำทางการเงินแบบรับรองผล</div>
          </div>
          <Gauge size={18} className="text-slate-500" />
        </div>
        <div className="finance-chip-grid">
          <StatusPill tone={monthlyPlan.availableThisMonth > 0 ? "success" : "warning"}>
            เหลือใช้ {formatCurrency(monthlyPlan.availableThisMonth)}
          </StatusPill>
          <StatusPill tone={forecast.lowestBalance < 0 ? "warning" : "success"}>
            ต่ำสุด 30 วัน {formatCurrency(forecast.lowestBalance)}
          </StatusPill>
          <StatusPill tone={debtOverview.averageUtilizationPct > 80 ? "warning" : "default"}>
            utilization เฉลี่ย {debtOverview.averageUtilizationPct}%
          </StatusPill>
          <StatusPill tone={billsSummary.dueSoon.length ? "warning" : "success"}>
            บิลใกล้ถึง {billsSummary.dueSoon.length}
          </StatusPill>
        </div>
        <div className="finance-inline-note">
          ถ้าตัวเลขยังดูว่าง ให้เพิ่มรายการ ตั้งงบ และตั้ง recurring ก่อน ระบบจะคำนวณได้แม่นขึ้น
        </div>
      </article>
    </ScreenShell>
  );
}
