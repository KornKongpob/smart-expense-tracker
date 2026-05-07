import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Gauge,
  ListOrdered,
  TrendingDown,
} from "lucide-react";

import { EmptyPanel, MetricCard, ScreenShell, StatusPill } from "../app/ui.jsx";
import {
  calculateDebtOverview,
  getDebtAccounts,
  simulateDebtPayoff,
  sortDebtsByStrategy,
} from "./debtPayoff.js";
import { buildAccountBalanceMap } from "../app/accountBalanceState.js";
import { formatCurrency, formatDateLong } from "../../utils/format.js";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../utils/money.js";

const STRATEGY_OPTIONS = [
  { id: "avalanche", label: "ดอกสูงก่อน", description: "ลดดอกเบี้ยรวมโดยโฟกัส APR สูง" },
  { id: "snowball", label: "ยอดเล็กก่อน", description: "ปิดยอดเล็กเพื่อสร้างแรงส่ง" },
  { id: "utilization", label: "ใช้วงเงินสูงก่อน", description: "ลดบัตรที่ utilization สูงก่อน" },
];

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function toId(value) {
  return String(value || "").trim();
}

function readSatang(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function isActiveDebtPlan(plan) {
  const status = String(plan?.status || "active").trim().toLowerCase();
  return status === "active";
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  return `${Math.round(number)}%`;
}

function formatMonths(value) {
  if (value === 0) return "ปิดหมดแล้ว";
  if (value == null) return "ยังไม่ปิดในกรอบจำลอง";
  return `${value} เดือน`;
}

function getDebtTone(debt) {
  if (debt.utilizationPct >= 90) return "danger";
  if (debt.utilizationPct >= 75 || debt.aprMissing) return "warning";
  return "default";
}

function normalizeRuntimeAccount(account, balanceMap, planByAccountId) {
  const id = toId(account?.id);
  const numericId = Number(account?.id);
  const plan = planByAccountId.get(id) || planByAccountId.get(String(numericId)) || null;
  const balance = Number.isFinite(numericId) && balanceMap.has(numericId)
    ? balanceMap.get(numericId)
    : readSatang(account?.openingBalance ?? account?.opening_balance_satang, 0);

  return {
    id,
    name: String(account?.name || "บัญชีหนี้").trim() || "บัญชีหนี้",
    type: String(account?.type || "").trim() || "credit",
    openingBalance: balance,
    creditLimit: readSatang(account?.creditLimit ?? account?.credit_limit_satang, 0),
    statementDay: account?.statementDay ?? account?.statement_day ?? "",
    dueDay: plan?.due_day ?? account?.dueDay ?? account?.due_day ?? "",
    aprBps: plan?.apr_bps ?? account?.aprBps ?? account?.apr_bps,
    minimumPaymentSatang: plan?.minimum_payment_satang ?? account?.minimumPaymentSatang,
    extraPaymentSatang: plan?.target_payment_satang
      ? Math.max(0, readSatang(plan.target_payment_satang, 0) - readSatang(plan.minimum_payment_satang, 0))
      : account?.extraPaymentSatang,
  };
}

export function buildDebtPlannerStateFromRuntime({
  accounts = [],
  accountBalanceSnapshot = [],
  debtPlans = [],
} = {}) {
  const balanceMap = buildAccountBalanceMap(accountBalanceSnapshot);
  const planByAccountId = new Map();

  for (const plan of listOf(debtPlans)) {
    if (!isActiveDebtPlan(plan)) continue;
    const accountId = toId(plan?.account_id ?? plan?.accountId);
    if (!accountId) continue;
    planByAccountId.set(accountId, plan);
  }

  return {
    accounts: listOf(accounts).map((account) => normalizeRuntimeAccount(account, balanceMap, planByAccountId)),
    transactions: [],
  };
}

function DebtAccountRow({ debt, dueSoon }) {
  const utilization = Math.max(0, Math.min(100, Number(debt.utilizationPct || 0)));
  const tone = getDebtTone(debt);

  return (
    <article className="finance-list-button finance-account-button" data-testid={`debt-row-${debt.accountId}`}>
      <div className="finance-row finance-account-row">
        <div className="finance-row-main">
          <span className="finance-category-icon finance-account-icon">
            <CreditCard size={18} />
          </span>
          <div className="finance-account-copy">
            <div className="finance-row-title">{debt.name}</div>
            <div className="finance-row-meta finance-row-meta-wrap">
              วงเงิน {formatCurrency(debt.creditLimit)} · ใช้ไป {formatPercent(debt.utilizationPct)}
            </div>
          </div>
        </div>
        <div className="finance-row-side finance-account-side">
          <div className="finance-account-liability-label">ยอดหนี้</div>
          <div className="finance-row-amount finance-account-liability-amount">
            {formatCurrency(debt.debtOwed)}
          </div>
        </div>
      </div>

      <div className="finance-form finance-form-section-compact">
        <div className="dashboard-progress finance-progress-bar">
          <span style={{ width: `${utilization}%` }} />
        </div>

        <div className="finance-chip-grid">
          <StatusPill tone={tone}>utilization {formatPercent(debt.utilizationPct)}</StatusPill>
          {debt.statementDay ? <StatusPill tone="default">ตัดรอบวันที่ {debt.statementDay}</StatusPill> : null}
          {debt.dueDay ? <StatusPill tone="default">ครบกำหนดวันที่ {debt.dueDay}</StatusPill> : null}
          {debt.aprMissing ? (
            <StatusPill tone="warning">ยังไม่มี APR</StatusPill>
          ) : (
            <StatusPill tone="default">APR {Number(debt.apr || 0).toFixed(2)}%</StatusPill>
          )}
          {dueSoon ? (
            <StatusPill tone="warning">ใกล้ครบกำหนด {formatDateLong(dueSoon.dueDate)}</StatusPill>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function DebtPlannerWorkspace({ state = {}, onOpenAccounts }) {
  const [strategy, setStrategy] = useState("avalanche");
  const [extraPaymentInput, setExtraPaymentInput] = useState("");
  const today = useMemo(() => new Date(), []);

  const debts = useMemo(() => getDebtAccounts(state, { today }), [state, today]);
  const overview = useMemo(() => calculateDebtOverview(state, { today, debts }), [debts, state, today]);
  const sortedDebts = useMemo(() => sortDebtsByStrategy(debts, strategy), [debts, strategy]);
  const extraPaymentSatang = Math.max(0, parseMoneyToSatang(extraPaymentInput || "0"));
  const monthlyBudgetForDebt = Math.max(0, overview.totalMinimumPayment + extraPaymentSatang);
  const simulation = useMemo(
    () =>
      simulateDebtPayoff(sortedDebts, {
        strategy,
        monthlyBudgetForDebt,
        maxMonths: 360,
      }),
    [monthlyBudgetForDebt, sortedDebts, strategy],
  );
  const dueSoonByAccountId = useMemo(
    () => new Map(listOf(overview.dueSoon).map((item) => [toId(item.accountId), item])),
    [overview.dueSoon],
  );
  const focusDebt = overview.highestAprDebt || overview.highestUtilizationDebt || sortedDebts[0] || null;
  const payoffNames = simulation.payoffOrder
    .map((accountId) => debts.find((debt) => toId(debt.accountId) === toId(accountId))?.name)
    .filter(Boolean);
  const hasDebts = debts.length > 0;
  const hasActiveDebt = overview.totalDebt > 0;

  return (
    <ScreenShell
      title="แผนจัดการหนี้"
      subtitle="ดูยอดหนี้ วันครบกำหนด และแผนปิดหนี้"
      headerMode="visible"
    >
      <section className="finance-dashboard-overview-grid" data-testid="debt-overview">
        <MetricCard label="หนี้รวม" value={formatCurrency(overview.totalDebt)} hint={`${debts.length} บัญชีที่ติดตาม`} tone={overview.totalDebt > 0 ? "danger" : "success"} />
        <MetricCard label="จ่ายขั้นต่ำรวม" value={formatCurrency(overview.totalMinimumPayment)} hint="ประมาณการขั้นต่ำต่อเดือน" />
        <MetricCard label="utilization เฉลี่ย" value={formatPercent(overview.averageUtilizationPct)} hint="เทียบกับวงเงินรวมของบัตร" tone={overview.averageUtilizationPct >= 75 ? "warning" : "default"} />
        <MetricCard
          label="หนี้ที่ควรโฟกัส"
          value={focusDebt ? focusDebt.name : "-"}
          hint={focusDebt ? `${formatCurrency(focusDebt.debtOwed)} · APR ${Number(focusDebt.apr || 0).toFixed(2)}%` : "ยังไม่มีหนี้ที่ต้องโฟกัส"}
          tone={focusDebt ? "warning" : "success"}
        />
      </section>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">วิธีเรียงลำดับหนี้</div>
            <div className="finance-panel-copy">เลือกมุมมองสำหรับจำลองแผนชำระ โดยยังไม่บันทึกค่าใดลงระบบ</div>
          </div>
          <StatusPill tone="default">local only</StatusPill>
        </div>

        <div className="finance-form">
          <div className="finance-type-grid finance-type-grid-accounts">
            {STRATEGY_OPTIONS.map((option) => {
              const active = strategy === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={["finance-type-chip", active ? "is-active" : ""].join(" ")}
                  onClick={() => setStrategy(option.id)}
                  data-testid={`debt-strategy-${option.id}`}
                >
                  <span className="finance-type-chip-icon">
                    <ListOrdered size={16} />
                  </span>
                  <span className="finance-type-chip-label">{option.label}</span>
                </button>
              );
            })}
          </div>

          <div className="finance-panel-copy">
            {STRATEGY_OPTIONS.find((option) => option.id === strategy)?.description}
          </div>

          <label className="finance-field">
            <span className="ui-label">เงินโปะเพิ่มต่อเดือน</span>
            <input
              className="ui-input"
              inputMode="decimal"
              value={extraPaymentInput}
              onChange={(event) => setExtraPaymentInput(sanitizeMoneyInput(event.target.value))}
              placeholder="0.00"
              data-testid="debt-extra-payment"
            />
            <span className="finance-field-helper">
              ระบบจะนำไปบวกกับยอดขั้นต่ำรวมเป็นงบชำระหนี้ต่อเดือน: {formatCurrency(monthlyBudgetForDebt)}
            </span>
          </label>
        </div>
      </article>

      <article className="ui-card finance-panel" data-testid="debt-payoff-simulation">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">จำลองแผนปิดหนี้</div>
            <div className="finance-panel-copy">คำนวณแบบง่ายจาก APR รายเดือนและงบชำระที่กรอก</div>
          </div>
          {hasActiveDebt && simulation.monthsToPayoff == null ? (
            <StatusPill tone="warning">ยังไม่ปิดใน 360 เดือน</StatusPill>
          ) : hasActiveDebt ? (
            <StatusPill tone="success">จำลองได้</StatusPill>
          ) : (
            <StatusPill tone="success">ไม่มีหนี้ค้าง</StatusPill>
          )}
        </div>

        <div className="finance-grid finance-grid-3">
          <MetricCard label="เวลาปิดหนี้" value={formatMonths(simulation.monthsToPayoff)} hint="ประมาณการจากยอดปัจจุบัน" />
          <MetricCard label="ดอกเบี้ยประมาณการ" value={formatCurrency(simulation.totalInterestEstimate)} hint={debts.some((debt) => debt.aprMissing) ? "บางบัญชียังไม่มี APR" : "รวมตลอดแผนจำลอง"} tone={simulation.totalInterestEstimate > 0 ? "warning" : "default"} />
          <MetricCard label="งบชำระต่อเดือน" value={formatCurrency(monthlyBudgetForDebt)} hint={`ขั้นต่ำ ${formatCurrency(overview.totalMinimumPayment)} + เพิ่ม ${formatCurrency(extraPaymentSatang)}`} />
        </div>

        <div className="finance-form finance-form-section-compact">
          <div className="finance-section-label">ลำดับที่แนะนำ</div>
          {payoffNames.length ? (
            <div className="finance-list">
              {payoffNames.map((name, index) => (
                <div key={`${name}-${index}`} className="finance-row">
                  <div className="finance-row-main">
                    <span className="finance-category-icon finance-account-icon">{index + 1}</span>
                    <div className="finance-row-title">{name}</div>
                  </div>
                  <div className="finance-row-side">
                    <TrendingDown size={16} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="finance-panel-copy">ยังไม่มีลำดับชำระหนี้ให้แสดง</div>
          )}
        </div>
      </article>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">บัญชีหนี้</div>
            <div className="finance-panel-copy">แสดงยอดหนี้เป็นจำนวนบวก เพื่อให้อ่านง่ายและไม่ปะปนกับ net worth</div>
          </div>
          {overview.dueSoon.length ? (
            <StatusPill tone="warning">ใกล้ครบกำหนด {overview.dueSoon.length}</StatusPill>
          ) : (
            <StatusPill tone="default">ไม่มีแจ้งเตือนใกล้ครบกำหนด</StatusPill>
          )}
        </div>

        {hasDebts ? (
          <div className="finance-list">
            {sortedDebts.map((debt) => (
              <DebtAccountRow key={debt.accountId} debt={debt} dueSoon={dueSoonByAccountId.get(toId(debt.accountId))} />
            ))}
          </div>
        ) : (
          <EmptyPanel
            title="ยังไม่พบบัญชีบัตรเครดิต"
            copy="เพิ่มบัญชีประเภทบัตรเครดิตพร้อมวงเงิน วันตัดรอบ และวันครบกำหนด เพื่อเริ่มวางแผนชำระ"
            action={
              onOpenAccounts ? (
                <button type="button" className="ui-btn ui-btn-primary" onClick={onOpenAccounts}>
                  <CreditCard size={16} />
                  ไปที่บัญชี
                </button>
              ) : null
            }
          />
        )}
      </article>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div className="finance-panel-title">หมายเหตุ</div>
        </div>
        <div className="finance-inline-note">
          <div className="finance-row">
            <div className="finance-row-main">
              <span className="finance-category-icon finance-account-icon">
                {debts.some((debt) => debt.aprMissing) ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
              </span>
              <div className="finance-settings-row-copy">
                <div className="finance-row-title">เป็นการคำนวณเพื่อช่วยวางแผน ไม่ใช่คำแนะนำทางการเงินแบบรับรองผล</div>
                <div className="finance-row-meta finance-row-meta-wrap">
                  เพิ่ม APR และยอดขั้นต่ำจริงในแผนชำระหนี้เพื่อให้ประมาณการละเอียดขึ้น
                </div>
              </div>
            </div>
            <div className="finance-row-side">
              <Gauge size={16} />
              <CalendarClock size={16} />
            </div>
          </div>
        </div>
      </article>
    </ScreenShell>
  );
}
