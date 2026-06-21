import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Save } from "lucide-react";

import { formatCurrency, formatDateShort, toISODate } from "../utils/format.js";
import { formatMoneyInputFromSatang, parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money.js";
import {
  getStatementsNeedingInput,
  makeCreditStatementCycleKey,
  normalizeCreditStatement,
} from "../utils/creditPlanner.js";

const ACTIVE_STATUSES = new Set(["open", "planned"]);
const COMPLETED_STATUSES = new Set(["paid", "skipped"]);

const STATUS_OPTIONS = [
  { id: "open", label: "เปิดอยู่" },
  { id: "planned", label: "วางแผนจ่าย" },
  { id: "paid", label: "จ่ายครบแล้ว" },
  { id: "skipped", label: "ข้ามรอบนี้" },
];

const STATUS_LABELS = {
  open: "เปิดอยู่",
  planned: "วางแผนจ่าย",
  paid: "จ่ายครบแล้ว",
  skipped: "ข้ามรอบนี้",
};

function toAccountId(value) {
  return String(value ?? "").trim();
}

function normalizeDay(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(31, Math.max(1, Math.trunc(number)));
}

function normalizeCreditAccount(account) {
  const id = toAccountId(account?.id ?? account?.accountId ?? account?.account_id);
  return {
    ...account,
    id,
    type: "credit",
    name: String(account?.name || account?.institution_label || account?.institutionLabel || "บัตรเครดิต").trim(),
    statementDay: normalizeDay(account?.statementDay ?? account?.statement_day, 1),
    dueDay: normalizeDay(account?.dueDay ?? account?.due_day, 25),
  };
}

function getBalanceSnapshotMap(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = toAccountId(row?.id ?? row?.accountId ?? row?.account_id);
    if (!id) continue;
    const balance = Number(row?.balance_satang ?? row?.balanceSatang ?? row?.balance ?? 0);
    map.set(id, Number.isFinite(balance) ? Math.trunc(balance) : 0);
  }
  return map;
}

function getCardBalanceSatang(account, balanceMap) {
  const id = toAccountId(account?.id);
  if (balanceMap.has(id)) return balanceMap.get(id);
  const fallback = Number(account?.balance_satang ?? account?.balanceSatang ?? account?.opening_balance_satang ?? account?.openingBalance ?? 0);
  return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
}

function getDisplayDebtSatang(balanceSatang) {
  const balance = Number(balanceSatang || 0);
  return balance < 0 ? Math.abs(balance) : 0;
}

function sanitizePositiveMoneyInput(value) {
  return sanitizeMoneyInput(value).replace(/^-/, "");
}

function isValidISODate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    Number.isFinite(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function buildDraftDefaults({ statement, cycle }) {
  const source = statement || {};
  return {
    minimumDue: formatMoneyInputFromSatang(source.minimumDue || 0, { emptyIfZero: true }),
    fullDue: formatMoneyInputFromSatang(source.fullDue || 0, { emptyIfZero: true }),
    dueDate: source.dueDate || cycle?.dueDate || "",
    note: source.note || "",
    status: source.status || "open",
  };
}

function Section({ title, subtitle, count, children, empty }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {subtitle ? <p className="ui-help mt-1">{subtitle}</p> : null}
        </div>
        {count != null ? <span className="ui-chip shrink-0">{count}</span> : null}
      </div>
      {count ? <div className="grid gap-3 md:grid-cols-2">{children}</div> : empty}
    </section>
  );
}

function EmptyState({ title, copy }) {
  return (
    <div className="view-empty">
      <div className="finance-empty-title">{title}</div>
      <p className="finance-empty-copy">{copy}</p>
    </div>
  );
}

function StatementStatusChip({ status }) {
  const tone =
    status === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "skipped"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : status === "planned"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-amber-200 bg-amber-50 text-amber-700";

  return <span className={`ui-chip ${tone}`}>{STATUS_LABELS[status] || STATUS_LABELS.open}</span>;
}

function StatementFormCard({
  mode,
  account,
  cycle,
  statement,
  currentBalanceSatang,
  draft,
  feedback,
  saving,
  onDraftChange,
  onSave,
}) {
  const status = draft.status || "open";
  const debtSatang = getDisplayDebtSatang(currentBalanceSatang);
  const balanceIsPositive = Number(currentBalanceSatang || 0) > 0;
  const minimumDueSatang = Math.max(0, parseMoneyToSatang(draft.minimumDue));
  const fullDueSatang = Math.max(0, parseMoneyToSatang(draft.fullDue));
  const remainingDueSatang = statement ? Math.max(0, fullDueSatang - Number(statement.paidAmount || 0)) : fullDueSatang;

  return (
    <article className={["ui-card", mode === "input" ? "ui-card-strong" : ""].filter(Boolean).join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-900 text-white">
              <CreditCard size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-950">{account.name}</h3>
              <p className="ui-help">
                ตัดรอบ {formatDateShort(cycle.statementDate)} · ครบกำหนด {formatDateShort(draft.dueDate || cycle.dueDate)}
              </p>
            </div>
          </div>
        </div>
        <StatementStatusChip status={status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
          <div className="text-xs font-medium text-slate-500">หนี้บัตรตอนนี้</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(debtSatang)}</div>
          {balanceIsPositive ? <div className="ui-help mt-1">ยอดบัญชีเป็นบวก ไม่แสดงเป็นหนี้</div> : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
          <div className="text-xs font-medium text-slate-500">ยอดคงค้างรอบนี้</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(remainingDueSatang)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className="ui-label">ยอดขั้นต่ำ</span>
          <input
            className="ui-input"
            inputMode="decimal"
            value={draft.minimumDue}
            onChange={(event) => onDraftChange({ minimumDue: sanitizePositiveMoneyInput(event.target.value) })}
            placeholder="0.00"
          />
        </label>

        <label className="grid gap-1">
          <span className="ui-label">ยอดเต็มที่ต้องจ่าย</span>
          <input
            className="ui-input"
            inputMode="decimal"
            value={draft.fullDue}
            onChange={(event) => onDraftChange({ fullDue: sanitizePositiveMoneyInput(event.target.value) })}
            placeholder="0.00"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="ui-label">วันครบกำหนดชำระ</span>
            <input
              className="ui-input"
              type="date"
              value={draft.dueDate}
              onChange={(event) => onDraftChange({ dueDate: event.target.value })}
            />
          </label>

          <label className="grid gap-1">
            <span className="ui-label">สถานะ</span>
            <select
              className="ui-input"
              value={status}
              onChange={(event) => onDraftChange({ status: event.target.value })}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1">
          <span className="ui-label">หมายเหตุ</span>
          <textarea
            className="ui-input min-h-[84px] resize-y py-3"
            value={draft.note}
            onChange={(event) => onDraftChange({ note: event.target.value })}
            placeholder="เช่น รอใบแจ้งยอดจากแอปธนาคาร"
          />
        </label>
      </div>

      {fullDueSatang === 0 ? (
        <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          <span>ยอดเต็มเป็น 0 ได้เฉพาะเมื่อเลือกจ่ายครบแล้วหรือข้ามรอบนี้</span>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={[
            "mt-3 rounded-lg px-3 py-2 text-sm",
            feedback.tone === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700",
          ].join(" ")}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button type="button" className="ui-btn ui-btn-primary" onClick={onSave} disabled={saving}>
          {feedback?.tone === "success" ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {statement ? "บันทึกการแก้ไข" : "บันทึกรอบบิล"}
        </button>
      </div>
    </article>
  );
}

export default function CreditStatementsView({
  accounts = [],
  accountBalanceSnapshot = [],
  creditStatements = [],
  onSaveStatement,
  saving = false,
  todayDate = toISODate(new Date()),
}) {
  const [drafts, setDrafts] = useState({});
  const [feedbackByKey, setFeedbackByKey] = useState({});

  const creditAccounts = useMemo(
    () =>
      (Array.isArray(accounts) ? accounts : [])
        .filter((account) => String(account?.type ?? account?.account_type ?? "").toLowerCase().trim() === "credit")
        .map(normalizeCreditAccount)
        .filter((account) => account.id),
    [accounts],
  );

  const accountById = useMemo(() => new Map(creditAccounts.map((account) => [account.id, account])), [creditAccounts]);
  const balanceMap = useMemo(() => getBalanceSnapshotMap(accountBalanceSnapshot), [accountBalanceSnapshot]);

  const normalizedStatements = useMemo(
    () => (Array.isArray(creditStatements) ? creditStatements : []).map(normalizeCreditStatement),
    [creditStatements],
  );

  const needingInput = useMemo(
    () => getStatementsNeedingInput(creditAccounts, normalizedStatements, todayDate),
    [creditAccounts, normalizedStatements, todayDate],
  );

  const openStatements = useMemo(
    () =>
      normalizedStatements
        .filter((statement) => accountById.has(statement.accountId))
        .filter((statement) => ACTIVE_STATUSES.has(statement.status))
        .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || ""))),
    [accountById, normalizedStatements],
  );

  const completedStatements = useMemo(
    () =>
      normalizedStatements
        .filter((statement) => accountById.has(statement.accountId))
        .filter((statement) => COMPLETED_STATUSES.has(statement.status))
        .sort((a, b) => String(b.statementDate || "").localeCompare(String(a.statementDate || ""))),
    [accountById, normalizedStatements],
  );

  function getDraft(key, defaults) {
    return drafts[key] || defaults;
  }

  function patchDraft(key, defaults, patch) {
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...defaults,
        ...(current[key] || {}),
        ...patch,
      },
    }));
    setFeedbackByKey((current) => ({ ...current, [key]: null }));
  }

  async function saveStatement({ key, account, cycle, statement, draft }) {
    const minimumDue = Math.max(0, parseMoneyToSatang(draft.minimumDue));
    const fullDue = Math.max(0, parseMoneyToSatang(draft.fullDue));
    const status = String(draft.status || statement?.status || "open").trim() || "open";
    const dueDate = String(draft.dueDate || "").trim();

    if (!isValidISODate(dueDate)) {
      setFeedbackByKey((current) => ({
        ...current,
        [key]: { tone: "error", message: "วันครบกำหนดชำระต้องเป็นวันที่รูปแบบ YYYY-MM-DD" },
      }));
      return;
    }

    if (fullDue < minimumDue) {
      setFeedbackByKey((current) => ({
        ...current,
        [key]: { tone: "error", message: "ยอดเต็มที่ต้องจ่ายต้องมากกว่าหรือเท่ากับยอดขั้นต่ำ" },
      }));
      return;
    }

    if (fullDue === 0 && status !== "paid" && status !== "skipped") {
      setFeedbackByKey((current) => ({
        ...current,
        [key]: { tone: "error", message: "ถ้ายอดเต็มเป็น 0 ให้เลือกจ่ายครบแล้วหรือข้ามรอบนี้ก่อนบันทึก" },
      }));
      return;
    }

    const statementDate = cycle.statementDate || statement?.statementDate || "";
    const cycleKey = cycle.cycleKey || statement?.cycleKey || makeCreditStatementCycleKey(account.id, statementDate);
    const paidAmount =
      status === "paid"
        ? fullDue
        : statement?.status === "paid"
          ? 0
          : Number(statement?.paidAmount || 0);
    const result = await Promise.resolve(
      onSaveStatement?.({
        ...(statement || {}),
        id: statement?.id,
        accountId: account.id,
        cycleKey,
        month: statementDate.slice(0, 7),
        statementDate,
        dueDate,
        minimumDue,
        fullDue,
        statementBalance: fullDue,
        paidAmount,
        plannedPayAmount: Number(statement?.plannedPayAmount || 0),
        status,
        note: String(draft.note || "").trim(),
      }),
    );

    if (result === false) {
      setFeedbackByKey((current) => ({
        ...current,
        [key]: { tone: "error", message: "บันทึกไม่สำเร็จ ลองอีกครั้ง" },
      }));
      return;
    }

    setFeedbackByKey((current) => ({
      ...current,
      [key]: { tone: "success", message: "บันทึกรอบบิลแล้ว" },
    }));
  }

  function renderInputCycle(cycle) {
    const account = accountById.get(cycle.accountId) || normalizeCreditAccount(cycle.account);
    const key = cycle.cycleKey;
    const defaults = buildDraftDefaults({ cycle });
    const draft = getDraft(key, defaults);
    const balance = getCardBalanceSatang(account, balanceMap);

    return (
      <StatementFormCard
        key={key}
        mode="input"
        account={account}
        cycle={cycle}
        currentBalanceSatang={balance}
        draft={draft}
        feedback={feedbackByKey[key]}
        saving={saving}
        onDraftChange={(patch) => patchDraft(key, defaults, patch)}
        onSave={() => saveStatement({ key, account, cycle, draft })}
      />
    );
  }

  function renderSavedStatement(statement) {
    const account = accountById.get(statement.accountId);
    if (!account) return null;
    const statementDate = statement.statementDate || `${statement.month || todayDate.slice(0, 7)}-01`;
    const cycle = {
      accountId: account.id,
      statementDate,
      dueDate: statement.dueDate,
      cycleKey: statement.cycleKey || makeCreditStatementCycleKey(account.id, statementDate),
    };
    const key = statement.cycleKey || statement.id || cycle.cycleKey;
    const defaults = buildDraftDefaults({ statement, cycle });
    const draft = getDraft(key, defaults);
    const balance = getCardBalanceSatang(account, balanceMap);

    return (
      <StatementFormCard
        key={key}
        account={account}
        cycle={cycle}
        statement={statement}
        currentBalanceSatang={balance}
        draft={draft}
        feedback={feedbackByKey[key]}
        saving={saving}
        onDraftChange={(patch) => patchDraft(key, defaults, patch)}
        onSave={() => saveStatement({ key, account, cycle, statement, draft })}
      />
    );
  }

  if (!creditAccounts.length) {
    return (
      <EmptyState
        title="ยังไม่มีบัตรเครดิต"
        copy="เพิ่มบัญชีประเภทบัตรเครดิตก่อน แล้วค่อยกลับมากรอกยอดขั้นต่ำและยอดเต็มหลังวันตัดรอบ"
      />
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title="ต้องกรอกยอด"
        subtitle="แสดงรอบบิลล่าสุดที่ถึงวันตัดรอบแล้ว แต่ยังไม่มีข้อมูลยอดเรียกเก็บ"
        count={needingInput.length}
        empty={<EmptyState title="ยังไม่มีรอบที่ต้องกรอก" copy="เมื่อถึงวันตัดรอบใหม่ การ์ดบัตรเครดิตจะแสดงที่นี่" />}
      >
        {needingInput.map(renderInputCycle)}
      </Section>

      <Section
        title="เปิดอยู่"
        subtitle="รอบบิลที่บันทึกแล้วและยังใช้วางแผนการจ่ายได้"
        count={openStatements.length}
        empty={<EmptyState title="ยังไม่มีรอบบิลเปิดอยู่" copy="บันทึกยอดขั้นต่ำและยอดเต็มจากส่วนต้องกรอกยอดก่อน" />}
      >
        {openStatements.map(renderSavedStatement)}
      </Section>

      <Section
        title="จ่ายครบแล้ว"
        subtitle="รวมรอบบิลที่ปิดแล้วหรือข้ามรอบนี้ไว้"
        count={completedStatements.length}
        empty={<EmptyState title="ยังไม่มีรอบที่ปิดแล้ว" copy="รอบที่เลือกจ่ายครบแล้วหรือข้ามรอบนี้จะแสดงในส่วนนี้" />}
      >
        {completedStatements.map(renderSavedStatement)}
      </Section>
    </div>
  );
}
