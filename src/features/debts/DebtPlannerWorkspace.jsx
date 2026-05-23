import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Save,
  WalletCards,
} from "lucide-react";

import { EmptyPanel, MetricCard, ScreenShell, StatusPill } from "../app/ui.jsx";
import { buildAccountBalanceMap } from "../app/accountBalanceState.js";
import { formatCurrency, toISODate } from "../../utils/format.js";
import {
  formatMoneyInputFromSatang,
  parseMoneyToSatang,
  sanitizeMoneyInput,
} from "../../utils/money.js";
import { isCreditAccount } from "../../utils/accountMatch.js";
import { planCreditCardPayments } from "../../utils/debtPlan.js";

const STRATEGY_OPTIONS = [
  {
    id: "avalanche",
    label: "Avalanche",
    detail: "APR สูงก่อน",
  },
  {
    id: "snowball",
    label: "Snowball",
    detail: "ยอดเล็กก่อน",
  },
  {
    id: "due_date",
    label: "Due date",
    detail: "ครบกำหนดก่อน",
  },
];

const WARNING_LABELS = {
  missing_minimum_due: "ยังมีบัตรที่ไม่ได้กรอกขั้นต่ำจริง",
  minimum_due_estimated: "มีขั้นต่ำที่ยังเป็นค่าประมาณ",
  minimum_due_capped_to_balance: "ขั้นต่ำบางใบสูงกว่ายอดคงค้าง จึงจำกัดตามยอดหนี้",
  cash_below_minimum_buffer: "เงินที่พร้อมจ่ายต่ำกว่าเงินที่ต้องเหลือไว้ใช้",
  cash_shortfall_minimum_due: "เงินจ่ายหนี้เดือนนี้ไม่พอจ่ายขั้นต่ำครบทุกใบ",
  minimum_due_not_fully_funded: "ขั้นต่ำใบนี้ยังจ่ายไม่ครบตามแผน",
};

const DISPLAY_WARNING_KEYS = new Set(Object.keys(WARNING_LABELS));

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

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeMonthKey(value, fallback = todayMonth()) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return fallback;
  return `${match[1]}-${match[2]}`;
}

function normalizeDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function clampDay(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const day = Math.trunc(number);
  return day >= 1 && day <= 31 ? day : 0;
}

function shiftMonth(monthKey, delta) {
  const [year, month] = normalizeMonthKey(monthKey).split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateForDay(monthKey, day) {
  const safeDay = clampDay(day);
  if (!safeDay) return "";
  const [year, month] = normalizeMonthKey(monthKey).split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${normalizeMonthKey(monthKey)}-${String(Math.min(safeDay, lastDay)).padStart(2, "0")}`;
}

function defaultStatementDate(account, monthKey) {
  return dateForDay(monthKey, account?.statementDay ?? account?.statement_day);
}

function defaultDueDate(account, monthKey) {
  const dueDay = clampDay(account?.dueDay ?? account?.due_day ?? account?.paymentDueDay);
  if (!dueDay) return "";
  const statementDay = clampDay(account?.statementDay ?? account?.statement_day);
  const dueMonth = statementDay && dueDay <= statementDay ? shiftMonth(monthKey, 1) : monthKey;
  return dateForDay(dueMonth, dueDay);
}

function statementMonth(statement) {
  return normalizeMonthKey(statement?.month ?? statement?.monthKey ?? statement?.statementDate ?? statement?.dueDate, "");
}

function findStatement(statements, accountId, monthKey) {
  const targetAccountId = toId(accountId);
  const targetMonth = normalizeMonthKey(monthKey);
  return (
    listOf(statements).find(
      (statement) =>
        toId(statement?.accountId ?? statement?.account_id) === targetAccountId &&
        statementMonth(statement) === targetMonth,
    ) || null
  );
}

function accountName(account) {
  return String(account?.name || "").trim() || "บัญชี";
}

function isCreditSourceAccount(account) {
  return String(account?.type || "").toLowerCase().trim() === "credit" || isCreditAccount(account);
}

function moneyInput(value) {
  return formatMoneyInputFromSatang(value, { emptyIfZero: true });
}

function positiveMoneyInput(value) {
  return sanitizeMoneyInput(value).replace(/^-/, "");
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return `${number.toFixed(2).replace(/\.00$/, "")}%`;
}

function normalizeRuntimeAccount(account, balanceMap, planByAccountId) {
  const id = toId(account?.id);
  const numericId = Number(account?.id);
  const plan = planByAccountId.get(id) || planByAccountId.get(String(numericId)) || null;
  const balance = Number.isFinite(numericId) && balanceMap.has(numericId)
    ? balanceMap.get(numericId)
    : readSatang(
        account?.openingBalance ??
          account?.opening_balance_satang ??
          account?.balanceSatang ??
          account?.balance_satang,
        0,
      );

  return {
    id,
    name: String(account?.name || "บัตรเครดิต").trim() || "บัตรเครดิต",
    type: String(account?.type || "").trim() || "credit",
    openingBalance: balance,
    creditLimit: readSatang(account?.creditLimit ?? account?.credit_limit_satang, 0),
    statementDay: account?.statementDay ?? account?.statement_day ?? "",
    dueDay: plan?.due_day ?? account?.dueDay ?? account?.due_day ?? "",
    aprBps: plan?.apr_bps ?? account?.aprBps ?? account?.apr_bps,
  };
}

export function buildDebtPlannerStateFromRuntime({
  accounts = [],
  accountBalanceSnapshot = [],
  debtPlans = [],
  transactions = [],
} = {}) {
  const balanceMap = buildAccountBalanceMap(accountBalanceSnapshot);
  const planByAccountId = new Map();

  for (const plan of listOf(debtPlans)) {
    if (String(plan?.status || "active").trim().toLowerCase() !== "active") continue;
    const accountId = toId(plan?.account_id ?? plan?.accountId);
    if (accountId) planByAccountId.set(accountId, plan);
  }

  return {
    accounts: listOf(accounts).map((account) => normalizeRuntimeAccount(account, balanceMap, planByAccountId)),
    transactions: [],
    debtPaymentTransactions: listOf(transactions),
  };
}

function buildDraft(account, statement, monthKey) {
  const aprValue = statement?.apr ?? statement?.aprPct ?? statement?.apr_percent;
  return {
    id: statement?.id || "",
    statementBalanceInput: moneyInput(statement?.statementBalance ?? statement?.statement_balance_satang),
    minimumDueInput: moneyInput(statement?.minimumDue ?? statement?.minimum_due_satang),
    statementDate: normalizeDate(statement?.statementDate ?? statement?.statement_date) || defaultStatementDate(account, monthKey),
    dueDate: normalizeDate(statement?.dueDate ?? statement?.due_date) || defaultDueDate(account, monthKey),
    aprInput:
      aprValue == null || String(aprValue).trim() === ""
        ? ""
        : positiveMoneyInput(String(aprValue)),
  };
}

function buildDrafts(accounts, statements, monthKey) {
  const next = {};
  for (const account of accounts) {
    const accountId = toId(account?.id);
    if (!accountId) continue;
    next[accountId] = buildDraft(account, findStatement(statements, accountId, monthKey), monthKey);
  }
  return next;
}

function buildPlanningStatement(account, draft, monthKey) {
  const statement = {
    id: draft?.id || `credit_statement_${toId(account?.id)}_${normalizeMonthKey(monthKey)}`,
    accountId: toId(account?.id),
    month: normalizeMonthKey(monthKey),
    statementDate: normalizeDate(draft?.statementDate),
    dueDate: normalizeDate(draft?.dueDate),
    statementBalance: Math.max(0, parseMoneyToSatang(draft?.statementBalanceInput || "0")),
    minimumDue: Math.max(0, parseMoneyToSatang(draft?.minimumDueInput || "0")),
    status: "open",
  };

  if (String(draft?.aprInput || "").trim()) {
    const apr = Number(draft.aprInput);
    if (Number.isFinite(apr)) statement.apr = Math.max(0, apr);
  }

  return statement;
}

function readDebtPaymentMeta(tx) {
  const direct = tx?.meta && typeof tx.meta === "object" ? tx.meta : null;
  if (direct?.kind === "debt_plan_payment") return direct;

  const raw = tx?.raw && typeof tx.raw === "object" ? tx.raw : null;
  const rawMeta = raw?.meta && typeof raw.meta === "object" ? raw.meta : null;
  if (rawMeta?.kind === "debt_plan_payment") return rawMeta;

  const rawDebtPlan = raw?.debtPlanPayment && typeof raw.debtPlanPayment === "object" ? raw.debtPlanPayment : null;
  if (rawDebtPlan?.kind === "debt_plan_payment") return rawDebtPlan;

  const snakeDebtPlan = raw?.debt_plan_payment && typeof raw.debt_plan_payment === "object" ? raw.debt_plan_payment : null;
  if (snakeDebtPlan?.kind === "debt_plan_payment") return snakeDebtPlan;

  return null;
}

function hasDebtPlanPaymentDuplicate(transactions, payment, monthKey) {
  const targetMonth = normalizeMonthKey(monthKey);
  const targetAccountId = toId(payment?.accountId);
  const targetStatementId = toId(payment?.creditStatementId);

  return listOf(transactions).some((tx) => {
    const meta = readDebtPaymentMeta(tx);
    if (!meta) return false;
    if (normalizeMonthKey(meta.month, "") !== targetMonth) return false;
    if (toId(meta.accountId ?? meta.account_id) !== targetAccountId) return false;
    const statementId = toId(meta.creditStatementId ?? meta.credit_statement_id);
    return !targetStatementId || !statementId || statementId === targetStatementId;
  });
}

function choosePaymentDate(monthKey, dueDate) {
  const today = toISODate(new Date());
  const normalizedMonth = normalizeMonthKey(monthKey);
  if (today.startsWith(`${normalizedMonth}-`)) return today;
  return normalizeDate(dueDate) || `${normalizedMonth}-01`;
}

function buildPaymentRequest({ card, account, monthKey }) {
  const accountId = toId(card?.accountId ?? account?.id);
  const amountSatang = Math.max(0, readSatang(card?.recommendedPayment, 0));
  const creditStatementId = toId(card?.statementId) || `credit_statement_${accountId}_${normalizeMonthKey(monthKey)}`;
  const cardName = account ? accountName(account) : String(card?.name || "").trim() || "บัตรเครดิต";
  const meta = {
    kind: "debt_plan_payment",
    month: normalizeMonthKey(monthKey),
    creditStatementId,
    accountId,
  };

  return {
    accountId,
    cardName,
    amountSatang,
    creditStatementId,
    dueDate: normalizeDate(card?.dueDate),
    paymentDate: choosePaymentDate(monthKey, card?.dueDate),
    note: `ชำระหนี้ตามแผน ${normalizeMonthKey(monthKey)} - ${cardName}`,
    meta,
  };
}

function getWarningLabel(warning) {
  return WARNING_LABELS[warning] || String(warning || "ตรวจสอบข้อมูล");
}

function WarningPanel({ warnings }) {
  const list = [...new Set(listOf(warnings).filter((warning) => DISPLAY_WARNING_KEYS.has(warning)))];
  if (!list.length) return null;

  return (
    <div className="finance-inline-note" data-testid="debt-plan-warnings">
      <div className="finance-row">
        <div className="finance-row-main">
          <span className="finance-category-icon finance-account-icon">
            <AlertTriangle size={18} />
          </span>
          <div className="finance-settings-row-copy">
            <div className="finance-row-title">ตรวจสอบก่อนจ่าย</div>
            <div className="finance-row-meta finance-row-meta-wrap">
              {list.map(getWarningLabel).join(" · ")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DebtCardRow({ account, draft, planCard, onChange }) {
  const accountId = toId(account?.id);
  const warnings = listOf(planCard?.warnings);
  const missingMinimum = warnings.includes("missing_minimum_due");
  const shortMinimum = warnings.includes("minimum_due_not_fully_funded");

  return (
    <article className="finance-list-button finance-account-button" data-testid={`debt-card-${accountId}`}>
      <div className="finance-row finance-account-row">
        <div className="finance-row-main">
          <span className="finance-category-icon finance-account-icon">
            <CreditCard size={18} />
          </span>
          <div className="finance-account-copy">
            <div className="finance-row-title">{account?.name || "บัตรเครดิต"}</div>
            <div className="finance-row-meta finance-row-meta-wrap">
              ยอดในแอป {formatCurrency(planCard?.currentBalance || 0)}
              {planCard?.statementDate ? ` · ตัดรอบ ${planCard.statementDate}` : ""}
              {planCard?.dueDate ? ` · ครบกำหนด ${planCard.dueDate}` : ""}
            </div>
          </div>
        </div>
        <div className="finance-row-side finance-account-side">
          <div className="finance-account-liability-label">แนะนำจ่าย</div>
          <div className="finance-row-amount finance-account-liability-amount">
            {formatCurrency(planCard?.recommendedPayment || 0)}
          </div>
        </div>
      </div>

      <div className="finance-form finance-form-section-compact">
        <div className="finance-grid finance-grid-2">
          <label className="finance-field">
            <span className="ui-label">Statement balance</span>
            <input
              className="ui-input"
              inputMode="decimal"
              value={draft?.statementBalanceInput || ""}
              onChange={(event) => onChange(accountId, "statementBalanceInput", positiveMoneyInput(event.target.value))}
              placeholder="0.00"
              data-testid={`debt-statement-balance-${accountId}`}
            />
          </label>
          <label className="finance-field">
            <span className="ui-label">Minimum due</span>
            <input
              className="ui-input"
              inputMode="decimal"
              value={draft?.minimumDueInput || ""}
              onChange={(event) => onChange(accountId, "minimumDueInput", positiveMoneyInput(event.target.value))}
              placeholder="0.00"
              aria-invalid={missingMinimum ? "true" : undefined}
              data-testid={`debt-minimum-due-${accountId}`}
            />
          </label>
        </div>

        <div className="finance-grid finance-grid-3">
          <label className="finance-field">
            <span className="ui-label">Statement date</span>
            <input
              className="ui-input"
              type="date"
              value={draft?.statementDate || ""}
              onChange={(event) => onChange(accountId, "statementDate", event.target.value)}
              data-testid={`debt-statement-date-${accountId}`}
            />
          </label>
          <label className="finance-field">
            <span className="ui-label">Due date</span>
            <input
              className="ui-input"
              type="date"
              value={draft?.dueDate || ""}
              onChange={(event) => onChange(accountId, "dueDate", event.target.value)}
              data-testid={`debt-due-date-${accountId}`}
            />
          </label>
          <label className="finance-field">
            <span className="ui-label">APR optional</span>
            <input
              className="ui-input"
              inputMode="decimal"
              value={draft?.aprInput || ""}
              onChange={(event) => onChange(accountId, "aprInput", positiveMoneyInput(event.target.value))}
              placeholder="0.00"
              data-testid={`debt-apr-${accountId}`}
            />
          </label>
        </div>

        <div className="finance-chip-grid">
          <StatusPill tone={planCard?.minimumDue ? "default" : "warning"}>
            ขั้นต่ำ {formatCurrency(planCard?.minimumDue || 0)}
          </StatusPill>
          <StatusPill tone={planCard?.extraPayment ? "success" : "default"}>
            โปะเพิ่ม {formatCurrency(planCard?.extraPayment || 0)}
          </StatusPill>
          <StatusPill tone={planCard?.apr ? "default" : "warning"}>
            APR {formatPercent(planCard?.apr)}
          </StatusPill>
          {shortMinimum ? <StatusPill tone="danger">จ่ายขั้นต่ำไม่ครบ</StatusPill> : null}
          {missingMinimum ? <StatusPill tone="warning">ยังไม่กรอกขั้นต่ำ</StatusPill> : null}
        </div>
      </div>
    </article>
  );
}

export default function DebtPlannerWorkspace({
  state = {},
  creditStatements = state?.creditStatements || [],
  initialMonth,
  onMonthChange,
  onOpenAccounts,
  onCreatePlannedPayments,
  onSaveStatement,
  onSaveStatements,
  saving = false,
}) {
  const [month, setMonth] = useState(() => normalizeMonthKey(initialMonth || todayMonth()));
  const [availableCashInput, setAvailableCashInput] = useState("");
  const [minimumBufferInput, setMinimumBufferInput] = useState("");
  const [strategy, setStrategy] = useState("avalanche");
  const [drafts, setDrafts] = useState({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [confirmCreditSource, setConfirmCreditSource] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);

  useEffect(() => {
    if (!initialMonth) return;
    const nextMonth = normalizeMonthKey(initialMonth);
    setMonth((current) => (current === nextMonth ? current : nextMonth));
  }, [initialMonth]);

  const accounts = useMemo(() => listOf(state?.accounts), [state?.accounts]);
  const creditAccounts = useMemo(
    () => accounts.filter((account) => String(account?.type || "").toLowerCase().trim() === "credit" || isCreditAccount(account)),
    [accounts],
  );
  const accountKey = useMemo(() => creditAccounts.map((account) => toId(account?.id)).join("|"), [creditAccounts]);

  useEffect(() => {
    setDrafts(buildDrafts(creditAccounts, creditStatements, month));
  }, [accountKey, creditAccounts, creditStatements, month]);

  const planningStatements = useMemo(
    () => creditAccounts.map((account) => buildPlanningStatement(account, drafts[toId(account?.id)] || {}, month)),
    [creditAccounts, drafts, month],
  );
  const availableCashSatang = Math.max(0, parseMoneyToSatang(availableCashInput || "0"));
  const minimumBufferSatang = Math.max(0, parseMoneyToSatang(minimumBufferInput || "0"));
  const paymentBudgetSatang = Math.max(0, availableCashSatang - minimumBufferSatang);
  const plan = useMemo(
    () =>
      planCreditCardPayments({
        accounts: creditAccounts,
        transactions: state?.transactions || [],
        creditStatements: planningStatements,
        month,
        availableCashToPay: availableCashSatang,
        minimumCashBuffer: minimumBufferSatang,
        strategy,
      }),
    [availableCashSatang, creditAccounts, minimumBufferSatang, month, planningStatements, state?.transactions, strategy],
  );
  const cardByAccountId = useMemo(
    () => new Map(listOf(plan?.cards).map((card) => [toId(card?.accountId), card])),
    [plan?.cards],
  );
  const accountById = useMemo(() => new Map(accounts.map((account) => [toId(account?.id), account])), [accounts]);
  const paymentSourceAccounts = useMemo(
    () =>
      accounts
        .filter((account) => toId(account?.id))
        .sort((left, right) => {
          const byCredit = Number(isCreditSourceAccount(left)) - Number(isCreditSourceAccount(right));
          if (byCredit !== 0) return byCredit;
          return accountName(left).localeCompare(accountName(right));
        }),
    [accounts],
  );
  const preferredSourceId = useMemo(
    () =>
      toId(paymentSourceAccounts.find((account) => !isCreditSourceAccount(account))?.id) ||
      toId(paymentSourceAccounts[0]?.id),
    [paymentSourceAccounts],
  );
  const selectedSourceAccount = accountById.get(toId(sourceAccountId)) || null;
  const selectedSourceIsCredit = selectedSourceAccount ? isCreditSourceAccount(selectedSourceAccount) : false;
  const plannedPayments = useMemo(
    () =>
      listOf(plan?.cards)
        .map((card) =>
          buildPaymentRequest({
            card,
            account: accountById.get(toId(card?.accountId)),
            monthKey: month,
          }),
        )
        .filter((payment) => payment.accountId && payment.amountSatang > 0),
    [accountById, month, plan?.cards],
  );
  const duplicatePayments = useMemo(
    () =>
      plannedPayments.filter((payment) =>
        hasDebtPlanPaymentDuplicate(state?.debtPaymentTransactions || state?.transactions, payment, month),
      ),
    [month, plannedPayments, state?.debtPaymentTransactions, state?.transactions],
  );
  const totalBalance = listOf(plan?.cards).reduce((sum, card) => sum + Math.max(0, Number(card?.balance || 0)), 0);
  const hasCards = creditAccounts.length > 0;
  const canSave = hasCards && (onSaveStatements || onSaveStatement);
  const canCreatePayments = hasCards && typeof onCreatePlannedPayments === "function";

  useEffect(() => {
    if (!preferredSourceId) return;
    setSourceAccountId((current) => {
      if (current && paymentSourceAccounts.some((account) => toId(account?.id) === toId(current))) return current;
      return preferredSourceId;
    });
  }, [paymentSourceAccounts, preferredSourceId]);

  useEffect(() => {
    setConfirmCreditSource(false);
  }, [sourceAccountId]);

  const updateDraft = (accountId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [accountId]: {
        ...(current[accountId] || {}),
        [field]: value,
      },
    }));
    setSavedAt(null);
  };

  const changeMonth = (nextMonth) => {
    const normalized = normalizeMonthKey(nextMonth);
    setMonth(normalized);
    setSavedAt(null);
    onMonthChange?.(normalized);
  };

  const saveStatements = async () => {
    if (!canSave) return;
    const payloads = creditAccounts.map((account) => buildPlanningStatement(account, drafts[toId(account?.id)] || {}, month));
    setSavingLocal(true);
    try {
      let result = true;
      if (onSaveStatements) {
        result = await onSaveStatements(payloads);
      } else if (onSaveStatement) {
        for (const payload of payloads) {
          const itemResult = await onSaveStatement(payload);
          if (itemResult === false) result = false;
        }
      }
      if (result !== false) setSavedAt(Date.now());
    } finally {
      setSavingLocal(false);
    }
  };

  const finishCreatePayments = async ({ includeDuplicates = false } = {}) => {
    if (!canCreatePayments) {
      setPaymentStatus({
        tone: "warning",
        text: "ยังสร้างรายการจากแผนไม่ได้ในหน้าจอนี้",
      });
      return;
    }

    if (!sourceAccountId) {
      setPaymentStatus({
        tone: "warning",
        text: "เลือกบัญชีต้นทางสำหรับชำระหนี้ก่อน",
      });
      return;
    }

    if (selectedSourceIsCredit && !confirmCreditSource) {
      setPaymentStatus({
        tone: "warning",
        text: "บัญชีต้นทางเป็นบัตรเครดิต กรุณายืนยันก่อนสร้างรายการ",
      });
      return;
    }

    if (!plannedPayments.length) {
      setPaymentStatus({
        tone: "default",
        text: "ยังไม่มีรายการที่แนะนำให้ชำระจากแผนเดือนนี้",
      });
      return;
    }

    const selfPayments = plannedPayments.filter((payment) => payment.accountId === toId(sourceAccountId));
    if (selfPayments.length) {
      setPaymentStatus({
        tone: "warning",
        text: `บัญชีต้นทางต้องไม่ใช่บัตรเดียวกับรายการที่จะชำระ (${selfPayments
          .map((payment) => payment.cardName)
          .join(" · ")})`,
      });
      return;
    }

    const duplicates = duplicatePayments;
    const duplicateIds = new Set(duplicates.map((payment) => payment.accountId));
    const paymentsToCreate = includeDuplicates
      ? plannedPayments
      : plannedPayments.filter((payment) => !duplicateIds.has(payment.accountId));

    if (duplicates.length && !includeDuplicates && !duplicatePrompt) {
      setDuplicatePrompt({ duplicates });
      setPaymentStatus(null);
      return;
    }

    if (!paymentsToCreate.length) {
      setDuplicatePrompt(null);
      setPaymentStatus({
        tone: "warning",
        text: `พบรายการซ้ำครบทุกใบในเดือน ${month} จึงยังไม่สร้างรายการใหม่`,
      });
      return;
    }

    setPaymentSaving(true);
    setPaymentStatus(null);
    try {
      const result = await onCreatePlannedPayments({
        month,
        sourceAccountId,
        sourceAccount: selectedSourceAccount,
        payments: paymentsToCreate,
        skippedDuplicatePayments: includeDuplicates ? [] : duplicates,
      });
      const totalSatang =
        result?.totalSatang ??
        paymentsToCreate.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountSatang || 0)), 0);
      const createdCount = Number(result?.createdCount ?? paymentsToCreate.length) || paymentsToCreate.length;
      const skippedCount = includeDuplicates ? 0 : duplicates.length;
      setDuplicatePrompt(null);
      setPaymentStatus({
        tone: "success",
        text: `สร้างรายการชำระ ${createdCount} ใบ รวม ${formatCurrency(totalSatang)}${
          skippedCount ? ` และข้ามรายการซ้ำ ${skippedCount} ใบ` : ""
        }`,
      });
    } catch (error) {
      setPaymentStatus({
        tone: "danger",
        text: String(error?.message || "สร้างรายการชำระไม่สำเร็จ"),
      });
    } finally {
      setPaymentSaving(false);
    }
  };

  if (!hasCards) {
    return (
      <ScreenShell
        title="Debt Planner"
        subtitle="บันทึกขั้นต่ำจริงต่อบัตร แล้วคำนวณแผนจ่ายรายเดือน"
        headerMode="visible"
      >
        <EmptyPanel
          title="ยังไม่พบบัตรเครดิต"
          copy="เพิ่มบัญชีประเภทบัตรเครดิตก่อน แล้วกลับมาวางแผนจ่ายขั้นต่ำรายเดือนได้ที่หน้านี้"
          action={
            onOpenAccounts ? (
              <button type="button" className="ui-btn ui-btn-primary" onClick={onOpenAccounts}>
                <CreditCard size={16} />
                ไปที่ Accounts
              </button>
            ) : null
          }
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Debt Planner"
      subtitle="ขั้นต่ำจริงหลังตัดรอบบัตรเครดิต"
      headerMode="visible"
      actions={
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={saveStatements}
          disabled={!canSave || saving || savingLocal}
          data-testid="debt-save-statements"
        >
          <Save size={16} />
          {saving || savingLocal ? "กำลังบันทึก" : "บันทึก"}
        </button>
      }
    >
      <section className="finance-dashboard-overview-grid" data-testid="debt-overview">
        <MetricCard label="ยอดหนี้ตามรอบบัตร" value={formatCurrency(totalBalance)} hint={`${creditAccounts.length} บัตรเครดิต`} tone={totalBalance ? "danger" : "success"} />
        <MetricCard label="ขั้นต่ำรวม" value={formatCurrency(plan?.totals?.totalMinimum || 0)} hint="จากยอดขั้นต่ำที่กรอกจริง" tone={plan?.totals?.totalMinimum ? "warning" : "default"} />
        <MetricCard label="งบจ่ายหนี้เดือนนี้" value={formatCurrency(paymentBudgetSatang)} hint={`กันเงินไว้ ${formatCurrency(minimumBufferSatang)}`} />
        <MetricCard label="เงินเหลือหลังจ่าย" value={formatCurrency(plan?.totals?.cashAfterPayments || 0)} hint={`แนะนำจ่าย ${formatCurrency(plan?.totals?.totalRecommended || 0)}`} tone={(plan?.totals?.cashAfterPayments || 0) < minimumBufferSatang ? "warning" : "success"} />
      </section>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">ตั้งค่าแผนเดือนนี้</div>
            <div className="finance-panel-copy">เลือกเดือน เงินที่จ่ายได้ และกลยุทธ์จัดลำดับบัตร</div>
          </div>
          {savedAt ? (
            <StatusPill tone="success">
              <CheckCircle2 size={14} /> บันทึกแล้ว
            </StatusPill>
          ) : (
            <StatusPill tone="default">ข้อมูล statement ในเครื่อง</StatusPill>
          )}
        </div>

        <div className="finance-form">
          <div className="finance-grid finance-grid-3">
            <label className="finance-field">
              <span className="ui-label">เดือน</span>
              <input
                className="ui-input"
                type="month"
                value={month}
                onChange={(event) => changeMonth(event.target.value)}
                data-testid="debt-month"
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">เงินที่พร้อมจ่ายหนี้เดือนนี้</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={availableCashInput}
                onChange={(event) => setAvailableCashInput(positiveMoneyInput(event.target.value))}
                placeholder="0.00"
                data-testid="debt-available-cash"
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">เงินขั้นต่ำที่ต้องเหลือไว้ใช้ระหว่างเดือน</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={minimumBufferInput}
                onChange={(event) => setMinimumBufferInput(positiveMoneyInput(event.target.value))}
                placeholder="0.00"
                data-testid="debt-minimum-buffer"
              />
            </label>
          </div>

          <div className="finance-type-grid finance-type-grid-accounts" role="radiogroup" aria-label="กลยุทธ์จัดลำดับหนี้">
            {STRATEGY_OPTIONS.map((option) => {
              const active = strategy === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={["finance-type-chip", active ? "is-active" : ""].join(" ")}
                  onClick={() => setStrategy(option.id)}
                  aria-pressed={active}
                  data-testid={`debt-strategy-${option.id}`}
                >
                  <span className="finance-type-chip-icon">
                    <WalletCards size={16} />
                  </span>
                  <span className="finance-type-chip-label">{option.label}</span>
                  <span className="finance-type-chip-detail">{option.detail}</span>
                </button>
              );
            })}
          </div>
        </div>
      </article>

      <WarningPanel warnings={plan?.warnings} />

      <article className="ui-card finance-panel" data-testid="debt-payment-creator">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">สร้างรายการชำระตามแผน</div>
            <div className="finance-panel-copy">
              สร้างรายการโอนเงิน (transfer) สำหรับบัตรที่มียอดแนะนำ โดยผูก meta กันสร้างซ้ำในเดือนเดียวกัน
            </div>
          </div>
          <StatusPill tone={plannedPayments.length ? "success" : "default"}>
            <ArrowRightLeft size={14} /> {plannedPayments.length} รายการ
          </StatusPill>
        </div>

        <div className="finance-form">
          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">บัญชีต้นทาง</span>
              <select
                className="ui-select"
                value={sourceAccountId}
                onChange={(event) => {
                  setSourceAccountId(event.target.value);
                  setDuplicatePrompt(null);
                  setPaymentStatus(null);
                }}
                data-testid="debt-payment-source"
              >
                {!paymentSourceAccounts.length ? <option value="">ยังไม่มีบัญชีต้นทาง</option> : null}
                {paymentSourceAccounts.map((account) => (
                  <option key={toId(account?.id)} value={toId(account?.id)}>
                    {accountName(account)}
                    {isCreditSourceAccount(account) ? " (บัตรเครดิต)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="finance-field">
              <span className="ui-label">ยอดที่จะสร้าง</span>
              <div className="finance-inline-note">
                {plannedPayments.length
                  ? `${plannedPayments.length} ใบ รวม ${formatCurrency(
                      plannedPayments.reduce((sum, payment) => sum + payment.amountSatang, 0),
                    )}`
                  : "ยังไม่มียอดแนะนำให้ชำระ"}
              </div>
            </div>
          </div>

          {selectedSourceIsCredit ? (
            <label className="finance-inline-note" data-testid="debt-payment-credit-source-warning">
              <input
                type="checkbox"
                checked={confirmCreditSource}
                onChange={(event) => setConfirmCreditSource(event.target.checked)}
              />
              ยืนยันว่าจะใช้บัตรเครดิตเป็นบัญชีต้นทางสำหรับรายการชำระนี้
            </label>
          ) : null}

          {duplicatePrompt?.duplicates?.length ? (
            <div className="ui-toast ui-toast--info finance-inline-note" data-testid="debt-payment-duplicates">
              <div className="finance-row">
                <div className="finance-row-main">
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">พบรายการที่เคยสร้างแล้วในเดือน {month}</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      {duplicatePrompt.duplicates.map((payment) => payment.cardName).join(" · ")}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={() => finishCreatePayments({ includeDuplicates: false })}
                  disabled={paymentSaving}
                  data-testid="debt-payment-skip-duplicates"
                >
                  ข้ามรายการซ้ำแล้วสร้างที่เหลือ
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={() => finishCreatePayments({ includeDuplicates: true })}
                  disabled={paymentSaving}
                  data-testid="debt-payment-confirm-duplicates"
                >
                  ยืนยันสร้างซ้ำ
                </button>
              </div>
            </div>
          ) : null}

          {paymentStatus ? (
            <div
              className={`ui-toast finance-inline-note ${
                paymentStatus.tone === "success"
                  ? "ui-toast--success"
                  : paymentStatus.tone === "danger"
                    ? "ui-toast--error"
                    : "ui-toast--info"
              }`}
              data-testid="debt-payment-summary"
            >
              {paymentStatus.text}
            </div>
          ) : null}

          <button
            type="button"
            className="ui-btn ui-btn-primary w-full sm:w-auto"
            onClick={() => finishCreatePayments()}
            disabled={!canCreatePayments || saving || paymentSaving || !plannedPayments.length}
            data-testid="debt-create-planned-payments"
          >
            <ArrowRightLeft size={16} />
            {paymentSaving ? "กำลังสร้างรายการ" : "สร้างรายการชำระตามแผน"}
          </button>
        </div>
      </article>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">บัตรเครดิต</div>
            <div className="finance-panel-copy">กรอกยอดจาก statement ล่าสุดของแต่ละใบ</div>
          </div>
          <StatusPill tone="default">
            <CalendarDays size={14} /> {month}
          </StatusPill>
        </div>

        <div className="finance-list">
          {creditAccounts.map((account) => {
            const accountId = toId(account?.id);
            return (
              <DebtCardRow
                key={accountId}
                account={account}
                draft={drafts[accountId] || {}}
                planCard={cardByAccountId.get(accountId)}
                onChange={updateDraft}
              />
            );
          })}
        </div>
      </article>
    </ScreenShell>
  );
}
