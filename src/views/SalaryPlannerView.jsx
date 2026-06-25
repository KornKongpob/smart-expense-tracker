import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Save, WalletCards } from "lucide-react";

import { formatCurrency, formatDateShort, toISODate, toMonthKey } from "../utils/format.js";
import { formatMoneyInputFromSatang, parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money.js";
import { calculateCreditPaymentPlan } from "../utils/creditPlanner.js";

const STRATEGY_OPTIONS = [
  { id: "due_date", label: "ใกล้ครบกำหนดก่อน" },
  { id: "highest_balance", label: "ยอดสูงก่อน" },
  { id: "snowball", label: "ปิดใบเล็กก่อน" },
];

function normalizeCreditAccount(account) {
  return {
    ...account,
    id: String(account?.id ?? account?.accountId ?? account?.account_id ?? "").trim(),
    name: String(account?.name || account?.institution_label || account?.institutionLabel || "บัตรเครดิต").trim(),
    type: "credit",
  };
}

function sanitizePositiveMoneyInput(value) {
  return sanitizeMoneyInput(value).replace(/^-/, "");
}

function createDraft(plan = null) {
  return {
    salaryAmount: formatMoneyInputFromSatang(plan?.salaryAmount || 0, { emptyIfZero: true }),
    reserveAmount: formatMoneyInputFromSatang(plan?.reserveAmount || 0, { emptyIfZero: true }),
    debtBudget: formatMoneyInputFromSatang(plan?.debtBudget || 0, { emptyIfZero: true }),
    strategy: plan?.strategy || "due_date",
  };
}

function getStrategyLabel(strategy) {
  return STRATEGY_OPTIONS.find((option) => option.id === strategy)?.label || STRATEGY_OPTIONS[0].label;
}

function getPaymentReason(payment, index, strategy) {
  if (payment.warnings?.includes("minimum_due_not_fully_funded")) return "เงินไม่พอจ่ายขั้นต่ำครบ";
  if (payment.recommendedPayment <= 0) return "ยังไม่จัดสรรจากงบนี้";
  if (payment.extraPayment > 0) {
    if (strategy === "highest_balance") return "โปะเพิ่มจากยอดสูงก่อน";
    if (strategy === "snowball") return "โปะเพิ่มเพื่อปิดใบเล็กก่อน";
    return index === 0 ? "ครบกำหนดใกล้สุด" : "โปะเพิ่มจากงบที่เหลือ";
  }
  return "จ่ายขั้นต่ำก่อน";
}

function SummaryCard({ label, value, hint, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "border-rose-200 bg-rose-50/90"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50/90"
        : "border-slate-200 bg-white/80";

  return (
    <article className={`ui-card ${toneClass}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
      {hint ? <div className="ui-help mt-1">{hint}</div> : null}
    </article>
  );
}

function EmptyState({ title, copy, action }) {
  return (
    <div className="view-empty">
      <div className="finance-empty-title">{title}</div>
      <p className="finance-empty-copy">{copy}</p>
      {action ? <div className="finance-empty-action">{action}</div> : null}
    </div>
  );
}

function MoneyInput({ label, value, onChange, placeholder = "0.00", help }) {
  return (
    <label className="grid gap-1">
      <span className="ui-label">{label}</span>
      <input
        className="ui-input"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(sanitizePositiveMoneyInput(event.target.value))}
        placeholder={placeholder}
      />
      {help ? <span className="ui-help">{help}</span> : null}
    </label>
  );
}

export default function SalaryPlannerView({
  accounts = [],
  creditStatements = [],
  salaryPlans = [],
  onSaveSalaryPlan,
  onNavigate,
  saving = false,
  todayDate = toISODate(new Date()),
}) {
  const monthKey = toMonthKey(todayDate);
  const existingPlan = useMemo(
    () => (Array.isArray(salaryPlans) ? salaryPlans : []).find((plan) => String(plan?.month || "") === monthKey) || null,
    [monthKey, salaryPlans],
  );
  const [draft, setDraft] = useState(() => createDraft(existingPlan));
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setDraft(createDraft(existingPlan));
    setFeedback(null);
  }, [existingPlan?.id, existingPlan?.updatedAt, monthKey]);

  const creditAccounts = useMemo(
    () =>
      (Array.isArray(accounts) ? accounts : [])
        .filter((account) => String(account?.type ?? account?.account_type ?? "").toLowerCase().trim() === "credit")
        .map(normalizeCreditAccount)
        .filter((account) => account.id),
    [accounts],
  );

  const salaryAmount = Math.max(0, parseMoneyToSatang(draft.salaryAmount));
  const reserveAmount = Math.max(0, parseMoneyToSatang(draft.reserveAmount));
  const debtBudget = Math.max(0, parseMoneyToSatang(draft.debtBudget));

  const plan = useMemo(
    () =>
      calculateCreditPaymentPlan({
        accounts: creditAccounts,
        creditStatements,
        salaryAmount,
        reserveAmount,
        debtBudget,
        strategy: draft.strategy,
        todayDate,
      }),
    [creditAccounts, creditStatements, debtBudget, draft.strategy, reserveAmount, salaryAmount, todayDate],
  );

  const underpaidCards = plan.payments.filter((payment) => payment.warnings?.includes("minimum_due_not_fully_funded"));
  const cardsStillDue = plan.payments.filter((payment) => payment.remainingAfterPayment > 0).length;
  const balanceTone = plan.shortfall > 0 ? "danger" : plan.surplus > 0 ? "success" : "default";

  async function savePlan() {
    const result = await Promise.resolve(
      onSaveSalaryPlan?.({
        ...(existingPlan || {}),
        month: monthKey,
        salaryAmount,
        reserveAmount,
        debtBudget,
        strategy: draft.strategy,
      }),
    );

    if (result === false) {
      setFeedback({ tone: "error", message: "บันทึกแผนไม่สำเร็จ ลองอีกครั้ง" });
      return;
    }
    setFeedback({ tone: "success", message: "บันทึกแผนเงินเดือนนี้แล้ว" });
  }

  if (!creditAccounts.length) {
    return (
      <EmptyState
        title="ยังไม่มีบัตรเครดิต"
        copy="เพิ่มบัญชีประเภทบัตรเครดิตก่อน แล้วกลับมาวางแผนจ่ายขั้นต่ำและยอดเต็มจากเงินเดือน"
        action={
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => onNavigate?.("accounts")}>
            ไปเพิ่มบัตรเครดิต
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="ui-card-strong space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="view-eyebrow">Salary allocation · {monthKey}</div>
            <h2 className="text-lg font-semibold text-slate-950">งบจากเงินเดือนรอบนี้</h2>
            <p className="ui-help mt-1">ถ้าไม่กรอกงบจ่ายหนี้โดยตรง ระบบจะใช้เงินเดือนลบเงินกันไว้</p>
          </div>
          <span className="ui-chip">{getStrategyLabel(draft.strategy)}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <MoneyInput
            label="เงินเดือน / เงินที่เพิ่งเข้า"
            value={draft.salaryAmount}
            onChange={(value) => setDraft((current) => ({ ...current, salaryAmount: value }))}
          />
          <MoneyInput
            label="เงินที่กันไว้ใช้ชีวิตและค่าใช้จ่ายจำเป็น"
            value={draft.reserveAmount}
            onChange={(value) => setDraft((current) => ({ ...current, reserveAmount: value }))}
          />
          <MoneyInput
            label="เงินที่ต้องการใช้จ่ายหนี้บัตรโดยตรง"
            value={draft.debtBudget}
            onChange={(value) => setDraft((current) => ({ ...current, debtBudget: value }))}
            help="ไม่กรอกได้ ถ้าต้องการให้คำนวณจากเงินเดือนหลังกันเงินไว้"
          />
        </div>

        <label className="grid gap-1">
          <span className="ui-label">กลยุทธ์</span>
          <select
            className="ui-input"
            value={draft.strategy}
            onChange={(event) => setDraft((current) => ({ ...current, strategy: event.target.value }))}
          >
            {STRATEGY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          {feedback ? (
            <span className={feedback.tone === "success" ? "ui-chip border-emerald-200 bg-emerald-50 text-emerald-700" : "ui-chip border-rose-200 bg-rose-50 text-rose-700"}>
              {feedback.tone === "success" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {feedback.message}
            </span>
          ) : null}
          <button type="button" className="ui-btn ui-btn-primary" onClick={savePlan} disabled={saving}>
            <Save size={16} />
            บันทึกแผนเดือนนี้
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="เงินที่ใช้จ่ายหนี้ได้" value={formatCurrency(plan.availableDebtBudget)} />
        <SummaryCard label="ขั้นต่ำรวมที่ต้องจ่าย" value={formatCurrency(plan.totalMinimumRequired)} />
        <SummaryCard label="ยอดเต็มรวม" value={formatCurrency(plan.totalFullDue)} />
        <SummaryCard
          label={plan.shortfall > 0 ? "เงินขาด" : "เงินเหลือ"}
          value={formatCurrency(plan.shortfall > 0 ? plan.shortfall : plan.surplus)}
          tone={balanceTone}
        />
        <SummaryCard label="จำนวนบัตรที่ยังต้องจ่าย" value={`${cardsStillDue} ใบ`} />
      </section>

      {plan.warnings.includes("minimum_due_shortfall") ? (
        <section className="ui-card border border-amber-200 bg-amber-50/90">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 shrink-0 text-amber-700" size={20} />
            <div>
              <h2 className="text-base font-semibold text-amber-900">เงินไม่พอจ่ายขั้นต่ำครบทุกใบ</h2>
              <p className="mt-1 text-sm text-amber-800">
                บัตรที่ยังขาดขั้นต่ำ: {underpaidCards.map((payment) => payment.accountName || payment.accountId).join(", ")}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {!plan.payments.length ? (
        <EmptyState
          title="ยังไม่มีรอบบิลเปิดอยู่"
          copy="กรอกยอดขั้นต่ำและยอดเต็มหลังวันตัดรอบก่อน ระบบถึงจะวางแผนจ่ายจากเงินเดือนได้"
          action={
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => onNavigate?.("credit-statements")}>
              ไปกรอกรอบบิลบัตรเครดิต
            </button>
          }
        />
      ) : (
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">คำแนะนำรายบัตร</h2>
              <p className="ui-help mt-1">จ่ายขั้นต่ำก่อน แล้วค่อยจัดเงินที่เหลือตามกลยุทธ์ที่เลือก</p>
            </div>
            <span className="ui-chip">{plan.payments.length} รายการ</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {plan.payments.map((payment, index) => {
              const reason = getPaymentReason(payment, index, plan.strategy);
              return (
                <article key={payment.statementId || payment.cycleKey || payment.accountId} className="ui-card space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-900 text-white">
                          <CreditCard size={18} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-slate-950">{payment.accountName || payment.accountId}</h3>
                          <p className="ui-help">ครบกำหนด {formatDateShort(payment.dueDate)}</p>
                        </div>
                      </div>
                    </div>
                    <span className="ui-chip">{reason}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
                      <div className="text-slate-500">ยอดขั้นต่ำ</div>
                      <div className="font-semibold text-slate-950">{formatCurrency(payment.minimumDue)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
                      <div className="text-slate-500">ยอดเต็ม</div>
                      <div className="font-semibold text-slate-950">{formatCurrency(payment.fullDue)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
                      <div className="text-slate-500">จ่ายแล้ว</div>
                      <div className="font-semibold text-slate-950">{formatCurrency(payment.paidAmount)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
                      <div className="text-slate-500">แนะนำให้จ่าย</div>
                      <div className="font-semibold text-slate-950">{formatCurrency(payment.recommendedPayment)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500">คงเหลือหลังจ่ายตามแผน</div>
                      <div className="font-semibold text-slate-950">{formatCurrency(payment.remainingAfterPayment)}</div>
                    </div>
                    {payment.recommendedPayment > 0 ? (
                      <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onNavigate?.("add")}>
                        <WalletCards size={16} />
                        ไปบันทึกการชำระ
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="ui-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-950">ยังไม่ได้กรอกยอดจากใบแจ้งหนี้?</div>
          <p className="ui-help mt-1">กลับไปบันทึกยอดขั้นต่ำและยอดเต็มก่อน เพื่อให้แผนจ่ายแม่นขึ้น</p>
        </div>
        <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onNavigate?.("credit-statements")}>
          ไปรอบบิลบัตรเครดิต
          <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
