import { createElement, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  PiggyBank,
  Sparkles,
} from "lucide-react";

import {
  buildFinancialPlanFallback,
  buildFinancialSnapshot,
  requestFinancialPlan,
} from "../services/financialPlan.js";
import { formatCurrency } from "../utils/format.js";

const TEXT_ALIASES = {
  financial_plan_network_error: "เชื่อมต่อ AI ไม่สำเร็จ จึงใช้แผนพื้นฐานจากข้อมูลในเครื่อง",
  financial_plan_timeout: "การเรียก AI ใช้เวลานานเกินไป จึงใช้แผนพื้นฐานจากข้อมูลในเครื่อง",
  financial_plan_failed: "ยังสร้างแผนด้วย AI ไม่สำเร็จ จึงใช้แผนพื้นฐานจากข้อมูลในเครื่อง",
  missing_openai_api_key: "ยังไม่ได้เปิดใช้งาน OpenAI API บนเซิร์ฟเวอร์",
  missing_minimum_due: "ยังมีบัตรเครดิตที่ไม่ได้กรอกยอดขั้นต่ำ",
  minimum_due_estimated: "บางยอดขั้นต่ำเป็นค่าประมาณ",
  minimum_cash_buffer_reserved: "กันเงินขั้นต่ำไว้ใช้ระหว่างเดือนแล้ว",
  cash_below_minimum_buffer: "เงินสดพร้อมใช้น้อยกว่าเงินขั้นต่ำที่ต้องเหลือไว้",
  cash_shortfall_minimum_due: "เงินที่พร้อมจ่ายอาจยังไม่พอจ่ายขั้นต่ำทั้งหมด",
  minimum_due_not_fully_funded: "บางบัตรยังไม่ได้รับเงินครบขั้นต่ำ",
};

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function textOf(value) {
  const raw = String(value || "").trim();
  return TEXT_ALIASES[raw] || raw;
}

function sectionItems(...groups) {
  return groups.flatMap((group) => (Array.isArray(group) ? group : [group]).map(textOf).filter(Boolean));
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function strategyLabel(strategy) {
  const key = String(strategy || "").toLowerCase().trim();
  if (key === "snowball") return "Snowball";
  if (key === "due_date") return "วันครบกำหนด";
  if (key === "avalanche") return "Avalanche";
  return key || "แผนอัตโนมัติ";
}

function PlanSection({ id, icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/85 p-3" data-testid={id ? `financial-plan-section-${id}` : undefined}>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700">
          {createElement(Icon, { size: 16, "aria-hidden": "true" })}
        </span>
        <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function BulletList({ items, emptyText }) {
  const visibleItems = listOf(items).map(textOf).filter(Boolean);
  if (!visibleItems.length) {
    return <p className="text-sm font-medium leading-relaxed text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {visibleItems.slice(0, 8).map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-sm font-medium leading-relaxed text-slate-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DataSummary({ snapshot }) {
  const topCategories = listOf(snapshot.categorySpendTop)
    .slice(0, 3)
    .map((category) => category.name || category.categoryId)
    .filter(Boolean)
    .join(", ");
  const debtTotals = snapshot.deterministicDebtPlan?.totals || {};

  const rows = [
    ["เดือน", snapshot.month || "-"],
    ["รายรับ / รายจ่าย", `${formatCurrency(snapshot.incomeTotal)} / ${formatCurrency(snapshot.expenseTotal)}`],
    ["เงินสดพร้อมใช้", formatCurrency(snapshot.cashAvailable)],
    ["บัญชี / บัตรเครดิต", `${listOf(snapshot.accountsSummary).length} บัญชี / ${listOf(snapshot.creditCards).length} บัตร`],
    ["งบประมาณ", `${listOf(snapshot.budgets).length} หมวด`],
    ["หมวดใช้จ่ายสูงสุด", topCategories || "ยังไม่มีข้อมูลหมวด"],
    [
      "แผนหนี้ที่คำนวณไว้",
      `${formatCurrency(debtTotals.totalRecommended || 0)} แนะนำจ่าย, ขั้นต่ำ ${formatCurrency(debtTotals.totalMinimum || 0)}`,
    ],
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-bold uppercase text-slate-500">ข้อมูลที่จะส่งให้ AI</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl bg-white px-3 py-2">
            <div className="text-[11px] font-bold text-slate-500">{label}</div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      <div
        className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold leading-relaxed text-emerald-800"
        data-testid="financial-plan-privacy-note"
      >
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>ระบบส่งเฉพาะข้อมูลสรุป ไม่ส่งรูปใบเสร็จ</span>
      </div>
    </div>
  );
}

function PlanResult({ plan }) {
  if (!plan) return null;

  const cashflow = plan.cashflowPlan || {};
  const savings = plan.savingsPlan || {};
  const debt = plan.debtPlan || {};
  const cards = listOf(debt.cards);
  const cashflowNotes = sectionItems(cashflow.notes);
  const savingsNotes = sectionItems(savings.emergencyFundAction, savings.notes);
  const debtNotes = sectionItems(debt.notes);

  return (
    <div className="grid gap-3">
      <PlanSection id="summary" icon={BrainCircuit} title="สรุปสถานะ">
        <p className="text-sm font-medium leading-relaxed text-slate-700">{plan.summary}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-bold text-slate-500">สุทธิเดือนนี้</div>
            <div className="mt-1 text-sm font-bold text-slate-950">{formatCurrency(numberValue(cashflow.monthlyNet))}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-bold text-slate-500">เงินสดพร้อมใช้</div>
            <div className="mt-1 text-sm font-bold text-slate-950">{formatCurrency(numberValue(cashflow.cashAvailable))}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-bold text-slate-500">เพดานใช้จ่ายที่แนะนำ</div>
            <div className="mt-1 text-sm font-bold text-slate-950">{formatCurrency(numberValue(cashflow.recommendedExpenseLimit))}</div>
          </div>
        </div>
        {cashflowNotes.length ? <div className="mt-3"><BulletList items={cashflowNotes} /></div> : null}
      </PlanSection>

      <PlanSection id="savings" icon={PiggyBank} title="แผนออมเงิน">
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
          แนะนำกันออม {formatCurrency(numberValue(savings.recommendedSavings))}
        </div>
        <div className="mt-3">
          <BulletList items={savingsNotes} emptyText="ยังไม่มีคำแนะนำการออมเพิ่มเติม" />
        </div>
      </PlanSection>

      <PlanSection id="debt" icon={CreditCard} title="แผนจ่ายหนี้">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
            {strategyLabel(debt.strategy)}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            รวม {formatCurrency(numberValue(debt.totalRecommendedPayment))}
          </span>
        </div>
        {cards.length ? (
          <div className="mt-3 space-y-2">
            {cards.map((card) => (
              <div key={card.accountId || card.name} className="rounded-xl bg-slate-50 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-950">{card.name || "บัตรเครดิต"}</div>
                    <div className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{textOf(card.reason)}</div>
                  </div>
                  <div className="shrink-0 text-sm font-bold tabular-nums text-slate-950">
                    {formatCurrency(numberValue(card.recommendedPayment))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-medium text-slate-500">ยังไม่มีบัตรเครดิตที่ต้องจัดแผนจ่ายหนี้</p>
        )}
        {debtNotes.length ? <div className="mt-3"><BulletList items={debtNotes} /></div> : null}
      </PlanSection>

      <PlanSection id="actions" icon={Sparkles} title="สิ่งที่ควรทำเดือนนี้">
        <BulletList items={plan.nextActions} emptyText="ยังไม่มีรายการที่ต้องทำเพิ่มเติม" />
      </PlanSection>

      <PlanSection id="warnings" icon={AlertTriangle} title="คำเตือน/ความเสี่ยง">
        <BulletList items={plan.warnings} emptyText="ยังไม่พบความเสี่ยงเด่นจากข้อมูลสรุปเดือนนี้" />
      </PlanSection>
    </div>
  );
}

export default function FinancialPlanPanel({
  state,
  month,
  availableCashToPay,
  minimumCashBuffer,
  strategy,
  deterministicDebtPlan,
  accessToken = "",
  className = "",
}) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const snapshot = useMemo(
    () =>
      buildFinancialSnapshot(state, {
        month,
        availableCashToPay,
        minimumCashBuffer,
        strategy,
        deterministicDebtPlan,
      }),
    [availableCashToPay, deterministicDebtPlan, minimumCashBuffer, month, state, strategy],
  );

  const snapshotKey = useMemo(
    () =>
      JSON.stringify({
        month: snapshot.month,
        incomeTotal: snapshot.incomeTotal,
        expenseTotal: snapshot.expenseTotal,
        cashAvailable: snapshot.cashAvailable,
        creditCards: listOf(snapshot.creditCards).length,
        totalRecommended: snapshot.deterministicDebtPlan?.totals?.totalRecommended || 0,
      }),
    [snapshot],
  );

  useEffect(() => {
    setPlan(null);
    setErrorMessage("");
  }, [snapshotKey]);

  const handleRequestPlan = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      // The endpoint only answers signed-in callers, so forward the session token.
      const result = await requestFinancialPlan(snapshot, {
        returnMeta: true,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      setPlan(result.plan);
      if (!result.ok) {
        setErrorMessage("เรียก AI ไม่สำเร็จ จึงแสดงแผนพื้นฐานจากข้อมูลในเครื่องแทน");
      }
    } catch {
      setErrorMessage("เรียก AI ไม่สำเร็จ จึงแสดงแผนพื้นฐานจากข้อมูลในเครื่องแทน");
      setPlan(buildFinancialPlanFallback(snapshot, "financial_plan_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={["ui-card", "finance-panel", "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm", className].filter(Boolean).join(" ")}>
      <div className="finance-panel-head flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-700">
              <BrainCircuit size={18} aria-hidden="true" />
            </span>
            <div>
              <div className="finance-panel-title text-sm font-bold text-slate-950">แผนการเงินจาก AI</div>
              <div className="finance-panel-copy mt-1 text-xs font-medium text-slate-500">
                ให้ AI ช่วยเรียบเรียงแผนออมเงิน กระแสเงินสด และการจ่ายหนี้จากข้อมูลสรุปเดือนนี้
              </div>
            </div>
          </div>
        </div>
        {plan ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            พร้อมดู
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3">
        <DataSummary snapshot={snapshot} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className="ui-btn ui-btn-primary min-h-11 justify-center"
            onClick={handleRequestPlan}
            disabled={loading}
            data-testid="financial-plan-ai-button"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {loading ? "กำลังวางแผน..." : "ให้ AI ช่วยวางแผนการเงิน"}
          </button>
          <div className="text-xs font-medium leading-relaxed text-slate-500">
            ผลลัพธ์จะแสดงในหน้านี้เท่านั้น และยังไม่บันทึกเป็นประวัติถาวร
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">
            กำลังส่งข้อมูลสรุปไปยังเซิร์ฟเวอร์เพื่อสร้างแผนการเงิน
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-relaxed text-amber-800"
            data-testid="financial-plan-error"
          >
            {errorMessage}
          </div>
        ) : null}

        {plan ? (
          <PlanResult plan={plan} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm font-medium leading-relaxed text-slate-500">
            กดปุ่มเพื่อให้ AI สร้างแผนจากข้อมูลสรุปด้านบน โดยระบบจะใช้แผนจ่ายหนี้ที่คำนวณไว้เป็นฐานประกอบคำแนะนำ
          </div>
        )}
      </div>
    </section>
  );
}
