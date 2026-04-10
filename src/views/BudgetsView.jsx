// src/views/BudgetsView.jsx
import { useMemo, useState } from "react";
import { ChevronRight, Bell, Trash2, Check, X, ChevronLeft, Sparkles } from "lucide-react";
import AppHeader from "../components/AppHeader";
import ModalShell from "../components/ModalShell";
import { useAppStore } from "../store/store.jsx";
import { toMonthKey, calcSpentByCategoryInMonth, getBudget } from "../store/selectors.js";
import { formatCurrency, toISODate } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput, formatMoneyInputFromSatang } from "../utils/money";
import { sumExpenseForDate, daysInMonthKey } from "../utils/transaction";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

const BUDGET_TOTAL_ID = "__TOTAL__"; // overall monthly budget
const BUDGET_DAILY_ID = "__DAILY__"; // daily budget (for Dashboard)

const PSEUDO_BUDGET_CATS = {
  [BUDGET_TOTAL_ID]: { id: BUDGET_TOTAL_ID, name: "งบรวมรายเดือน", icon: "🧮", color: "#111827" },
  [BUDGET_DAILY_ID]: { id: BUDGET_DAILY_ID, name: "งบต่อวัน", icon: "📅", color: "#111827" },
};

function monthKeyToDate(monthKey) {
  const s = String(monthKey || "").trim(); // "YYYY-MM"
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Date();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return new Date(y, Math.max(0, (mo || 1) - 1), 1);
}


function dateToMonthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function shiftMonthKey(monthKey, deltaMonths) {
  const d = monthKeyToDate(monthKey);
  const next = new Date(d.getFullYear(), d.getMonth() + (deltaMonths || 0), 1);
  return dateToMonthKey(next);
}

function formatMonthLabelTH(monthKey) {
  const d = monthKeyToDate(monthKey);
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(d);
}


export default function BudgetsView({ showAlert, showConfirm }) {
  const { state, navigate, upsertBudget, deleteBudget } = useAppStore();

  const [month, setMonth] = useState(() => toMonthKey(new Date())); // "YYYY-MM"

  const catsAll = useMemo(() => state.categories?.expense || [], [state.categories]);
  const catsActive = useMemo(() => (catsAll || []).filter((c) => !(c?.deletedAt || c?.isDeleted)), [catsAll]);
  const catsMain = useMemo(
    () =>
      (catsActive || [])
        .filter((c) => !String(c?.parentId || "").trim())
        .slice()
        .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "th")),
    [catsActive]
  );

  // ✅ Aggregate spending to main categories (parent buckets) so budgets can be set at the main level
  const spentMap = useMemo(
    () => calcSpentByCategoryInMonth(state.transactions || [], month, catsAll),
    [state.transactions, month, catsAll]
  );

  const cats = catsMain;
  const budgets = useMemo(() => state.budgets || [], [state.budgets]);

  // ✅ Used for "Daily budget" preview (only meaningful for current month)
  const todayISO = toISODate(new Date());
  const currentMonth = toMonthKey(todayISO);
  const isCurrentMonth = month === currentMonth;
  const todaySpentAll = useMemo(
    () => (isCurrentMonth ? sumExpenseForDate(state.transactions || [], todayISO) : 0),
    [state.transactions, todayISO, isCurrentMonth]
  );

  // ✅ Overall budgets for Dashboard
  const overallMonthlyBudget = useMemo(() => getBudget(budgets, month, BUDGET_TOTAL_ID), [budgets, month]);
  const overallDailyBudget = useMemo(() => getBudget(budgets, month, BUDGET_DAILY_ID), [budgets, month]);

  const [open, setOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [alertPct, setAlertPct] = useState("90");

  // Prevent background scroll while modal is open
  useLockBodyScroll(open);

  const rows = useMemo(() => {
    const list = cats.map((c) => {
      const spent = spentMap.get(c.id) || 0;
      const b = getBudget(budgets, month, c.id);
      const lim = Number(b?.limit || 0) || 0;
      const pct = lim ? Math.round((spent / lim) * 100) : 0;
      const ap = Number(b?.alertPct || 90) || 90;
      const alert = lim ? pct >= ap : false;
      return { cat: c, spent, budget: b, lim, pct, alert, ap };
    });

    // ✅ UX: alert first, then highest % used, then by name
    list.sort((a, b) => {
      if (a.alert !== b.alert) return a.alert ? -1 : 1;
      if ((b.pct || 0) !== (a.pct || 0)) return (b.pct || 0) - (a.pct || 0);
      return String(a.cat?.name || "").localeCompare(String(b.cat?.name || ""), "th");
    });

    return list;
  }, [cats, spentMap, budgets, month]);

  const summary = useMemo(() => {
    let totalSpent = 0;
    let totalLimit = 0;
    let alertCount = 0;

    for (const r of rows) {
      totalSpent += Number(r.spent || 0) || 0;
      totalLimit += Number(r.lim || 0) || 0;
      if (r.alert) alertCount += 1;
    }

    return { totalSpent, totalLimit, alertCount };
  }, [rows]);

  const openEdit = (catId) => {
    const b = getBudget(budgets, month, catId);
    setEditingCategoryId(catId);
    setLimit(b?.limit != null ? formatMoneyInputFromSatang(b.limit, { emptyIfZero: true }) : "");
    setAlertPct(String(b?.alertPct ?? 90));
    setOpen(true);
  };

  const save = () => {
    if (!editingCategoryId) return;
    const lim = parseMoneyToSatang(limit);
    const ap = Number(alertPct);

    if (!Number.isFinite(lim) || lim <= 0) return showAlert?.("กรุณาใส่วงเงินงบประมาณให้ถูกต้อง");
    if (!Number.isFinite(ap) || ap < 10 || ap > 100) return showAlert?.("alert % ต้องอยู่ระหว่าง 10-100");

    const existing = getBudget(budgets, month, editingCategoryId);
    upsertBudget({
      id: existing?.id,
      month,
      categoryId: editingCategoryId,
      limit: lim,
      alertPct: ap,
    });

    setOpen(false);
  };

  const remove = () => {
    const b = getBudget(budgets, month, editingCategoryId);
    if (!b) return;
    showConfirm?.("ลบงบประมาณ", "ยืนยันลบงบประมาณนี้?", () => deleteBudget(b.id), true);
    setOpen(false);
  };

  const editingCat = useMemo(
    () => cats.find((c) => c.id === editingCategoryId) || PSEUDO_BUDGET_CATS[editingCategoryId] || null,
    [cats, editingCategoryId]
  );

  const editingSpent = useMemo(() => {
    if (!editingCategoryId) return 0;
    if (editingCategoryId === BUDGET_TOTAL_ID) return Number(summary.totalSpent || 0) || 0;
    if (editingCategoryId === BUDGET_DAILY_ID) return Number(todaySpentAll || 0) || 0;
    return spentMap.get(editingCategoryId) || 0;
  }, [spentMap, editingCategoryId, summary.totalSpent, todaySpentAll]);

  const preview = useMemo(() => {
    const lim = parseMoneyToSatang(limit);
    const ap = Number(alertPct);
    if (!Number.isFinite(lim) || lim <= 0) return null;

    const pct = Math.round((editingSpent / lim) * 100);
    const willAlert = Number.isFinite(ap) ? pct >= ap : false;
    const remain = Math.max(0, lim - editingSpent);
    const over = Math.max(0, editingSpent - lim);

    return { lim, ap: Number.isFinite(ap) ? ap : 90, pct, willAlert, remain, over };
  }, [limit, alertPct, editingSpent]);

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="งบประมาณ"
        subtitle={`${formatMonthLabelTH(month)} (${month})`}
        onBack={() => navigate("more")}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
              className="ui-icon-btn text-gray-700 active:scale-95"
              aria-label="เดือนก่อนหน้า"
              title="เดือนก่อนหน้า"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonthKey(m, +1))}
              className="ui-icon-btn text-gray-700 active:scale-95"
              aria-label="เดือนถัดไป"
              title="เดือนถัดไป"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        }
      />

    <main className="ui-page pt-4 pb-nav view-flow">

      {/* Summary bar */}
      <div className="ui-card p-4 flex items-center justify-between gap-3">
        <div className="text-[13px] text-slate-500">
          ใช้ไป <span className="font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>{formatCurrency(summary.totalSpent)}</span>
          {summary.totalLimit ? ` / ${formatCurrency(summary.totalLimit)}` : ""}
        </div>
        <div className="text-[13px] text-slate-500">{summary.alertCount ? `⚠️ เกินงบ ${summary.alertCount}` : "✅ ปกติ"}</div>
      </div>

      {/* Summary */}
      <div className="ui-card p-5 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900/60 uppercase">สรุปเดือนนี้</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              ใช้ไป {formatCurrency(summary.totalSpent)}
              {summary.totalLimit ? (
                <span className="text-gray-800/60 text-sm font-bold"> / งบรวม {formatCurrency(summary.totalLimit)}</span>
              ) : (
                <span className="text-gray-800/50 text-sm font-bold"> (ยังไม่ได้ตั้งงบรวม)</span>
              )}
            </div>
          </div>

          {summary.alertCount ? (
            <div className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-900 text-xs font-semibold inline-flex items-center gap-1 border border-amber-500/20 shrink-0">
              <Bell size={14} /> Alert {summary.alertCount}
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-full bg-white/20 text-gray-800/70 text-xs font-semibold border border-white/20 shrink-0">
              ปกติ
            </div>
          )}
        </div>

        {summary.totalLimit ? (
          <div className="mt-4 h-2.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${Math.min(100, Math.round((summary.totalSpent / summary.totalLimit) * 100))}%`,
                backgroundColor: summary.alertCount ? "#f59e0b" : "#111827",
              }}
            />
          </div>
        ) : null}
      </div>

      {/* ✅ Dashboard budgets (Daily / Monthly) */}
      <div className="ui-card p-5 mb-5">
        <div className="text-xs font-bold text-gray-900/60 uppercase">งบสำหรับ Dashboard</div>

        {(() => {
          const monthlyLimit =
            Number(overallMonthlyBudget?.limit || 0) > 0 ? Number(overallMonthlyBudget.limit) : Number(summary.totalLimit || 0) || 0;
          const derivedDaily = monthlyLimit > 0 ? Math.round(monthlyLimit / daysInMonthKey(month)) : 0;
          const dailyLimit =
            Number(overallDailyBudget?.limit || 0) > 0 ? Number(overallDailyBudget.limit) : derivedDaily;

          const monthSpent = Number(summary.totalSpent || 0) || 0;
          const monthPct = monthlyLimit ? Math.round((monthSpent / monthlyLimit) * 100) : 0;
          const monthOver = monthlyLimit ? Math.max(0, monthSpent - monthlyLimit) : 0;

          const daySpent = isCurrentMonth ? Number(todaySpentAll || 0) || 0 : 0;
          const dayPct = dailyLimit ? Math.round((daySpent / dailyLimit) * 100) : 0;
          const dayOver = dailyLimit ? Math.max(0, daySpent - dailyLimit) : 0;

          return (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {/* Daily */}
                <button
                  type="button"
                  onClick={() => openEdit(BUDGET_DAILY_ID)}
                  data-testid="budget-daily-card"
                  className="glass-panel border border-white/20 rounded-2xl p-4 text-left active:scale-[0.99]"
                  title="แตะเพื่อตั้ง/แก้ไข Daily budget"
                >
                  <div className="text-xs font-semibold text-gray-900/70 flex items-center gap-2">
                    <span className="text-lg">{PSEUDO_BUDGET_CATS[BUDGET_DAILY_ID].icon}</span> Daily budget
                  </div>

                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {dailyLimit ? formatCurrency(dailyLimit) : <span className="text-gray-500">ยังไม่ตั้ง</span>}
                  </div>

                  <div className="mt-1 text-[11px] text-gray-800/60">
                    {isCurrentMonth ? (
                      dailyLimit ? (
                        <>
                          วันนี้ใช้ไป <span className="font-semibold">{formatCurrency(daySpent)}</span> ({dayPct}%)
                        </>
                      ) : (
                        <>
                          วันนี้ใช้ไป <span className="font-semibold">{formatCurrency(daySpent)}</span>
                        </>
                      )
                    ) : (
                      <span className="text-gray-500">ดูสถานะได้บน Dashboard (เฉพาะเดือนปัจจุบัน)</span>
                    )}
                  </div>

                  {dailyLimit && isCurrentMonth ? (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-white/30 overflow-hidden">
                        <div
                          className={`h-full ${dayOver > 0 ? "bg-red-600/80" : "bg-gray-900/50"}`}
                          style={{ width: `${Math.min(100, Math.max(0, dayPct))}%` }}
                        />
                      </div>
                      <div
                        className={`mt-2 text-[11px] font-semibold ${dayOver > 0 ? "text-red-700" : "text-gray-900/60"}`}
                      >
                        {dayOver > 0
                          ? `เกินงบ ${formatCurrency(dayOver)}`
                          : `เหลือ ${formatCurrency(Math.max(0, dailyLimit - daySpent))}`}
                      </div>
                      {!(Number(overallDailyBudget?.limit || 0) > 0) && derivedDaily > 0 ? (
                        <div className="mt-0.5 text-[10px] text-gray-900/45">* คำนวณจากงบรายเดือน / จำนวนวัน</div>
                      ) : null}
                    </div>
                  ) : null}
                </button>

                {/* Monthly */}
                <button
                  type="button"
                  onClick={() => openEdit(BUDGET_TOTAL_ID)}
                  data-testid="budget-monthly-card"
                  className="glass-panel border border-white/20 rounded-2xl p-4 text-left active:scale-[0.99]"
                  title="แตะเพื่อตั้ง/แก้ไข Monthly budget"
                >
                  <div className="text-xs font-semibold text-gray-900/70 flex items-center gap-2">
                    <span className="text-lg">{PSEUDO_BUDGET_CATS[BUDGET_TOTAL_ID].icon}</span> Monthly budget
                  </div>

                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {monthlyLimit ? formatCurrency(monthlyLimit) : <span className="text-gray-500">ยังไม่ตั้ง</span>}
                  </div>

                  <div className="mt-1 text-[11px] text-gray-800/60">
                    {monthlyLimit ? (
                      Number(overallMonthlyBudget?.limit || 0) > 0 ? (
                        <>
                          ใช้ไป <span className="font-semibold">{formatCurrency(monthSpent)}</span> ({monthPct}%)
                        </>
                      ) : (
                        <>
                          ใช้ไป <span className="font-semibold">{formatCurrency(monthSpent)}</span> ({monthPct}%) • รวมจากหมวด
                        </>
                      )
                    ) : (
                      <>
                        ใช้ไป <span className="font-semibold">{formatCurrency(monthSpent)}</span>
                      </>
                    )}
                  </div>

                  {monthlyLimit ? (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-white/30 overflow-hidden">
                        <div
                          className={`h-full ${monthOver > 0 ? "bg-red-600/80" : "bg-gray-900/50"}`}
                          style={{ width: `${Math.min(100, Math.max(0, monthPct))}%` }}
                        />
                      </div>
                      <div
                        className={`mt-2 text-[11px] font-semibold ${monthOver > 0 ? "text-red-700" : "text-gray-900/60"}`}
                      >
                        {monthOver > 0
                          ? `เกินงบ ${formatCurrency(monthOver)}`
                          : `เหลือ ${formatCurrency(Math.max(0, monthlyLimit - monthSpent))}`}
                      </div>
                    </div>
                  ) : null}
                </button>
              </div>

              <div className="mt-3 text-[11px] text-gray-800/55">
                * ถ้าไม่ได้ตั้ง Monthly budget ระบบจะใช้ “งบรวมจากหมวด” (งบประมาณต่อหมวด) แทน • Daily budget ถ้าไม่ได้ตั้งจะคำนวณจาก Monthly / จำนวนวัน
              </div>
            </>
          );
        })()}
      </div>

      <div className="space-y-3">
        {rows.map((r) => {
          const { cat, spent, lim, pct, alert, ap } = r;

          const remain = lim ? Math.max(0, lim - spent) : 0;
          const over = lim ? Math.max(0, spent - lim) : 0;

          return (
            <button
              key={cat.id}
              onClick={() => openEdit(cat.id)}
              type="button"
              className="w-full text-left glass-card rounded-2xl p-4 active:scale-[0.99]"
              title="แตะเพื่อตั้งงบ / แก้ไข"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                    style={{ backgroundColor: `${cat.color}20` }}
                  >
                    {cat.icon}
                  </div>

                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{cat.name}</div>

                    <div className="text-xs text-gray-700/80 mt-0.5">
                      ใช้แล้ว <span className="font-semibold">{formatCurrency(spent)}</span>
                      {lim ? (
                        <>
                          {" "}
                          / งบ <span className="font-semibold">{formatCurrency(lim)}</span>{" "}
                          <span className={`${alert ? "text-amber-800" : "text-gray-700/80"}`}>
                            ({pct}% • เตือนที่ {ap}%)
                          </span>
                        </>
                      ) : (
                        <span className="ml-2 text-gray-500">ยังไม่ได้ตั้งงบ</span>
                      )}
                    </div>

                    {lim ? (
                      <div className="text-[11px] text-gray-800/55 mt-1">
                        {over > 0 ? (
                          <span className="text-red-700 font-bold">เกินงบ {formatCurrency(over)}</span>
                        ) : (
                          <span>เหลืองบ {formatCurrency(remain)}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {alert ? (
                  <div className="px-3 py-1 rounded-full glass-chip text-amber-900 text-xs font-semibold inline-flex items-center gap-1 shrink-0">
                    <Bell size={14} /> Alert
                  </div>
                ) : null}
              </div>

              {lim ? (
                <div className="mt-3 h-2 rounded-full bg-white/30 overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: alert ? "#f59e0b" : cat.color || "#111827",
                    }}
                  />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {open ? (
        <ModalShell title="ตั้งงบประมาณ" onClose={() => setOpen(false)}>
          <div className="flex items-center gap-3 mb-4">
            {editingCat ? (
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${editingCat.color}20` }}
              >
                {editingCat.icon}
              </div>
            ) : null}

            <div className="min-w-0">
              <div className="text-xs text-gray-800/60">หมวดหมู่</div>
              <div className="text-sm font-semibold text-gray-900 truncate">
                {editingCat?.name || editingCategoryId}
              </div>
              <div className="text-[12px] text-gray-800/60 mt-0.5">
                ใช้แล้วเดือนนี้: <span className="font-semibold text-gray-900">{formatCurrency(editingSpent)}</span>
              </div>
            </div>
          </div>

          {preview ? (
            <div
              className={`glass-panel border rounded-2xl p-4 mb-4 ${
                preview.willAlert ? "border-amber-500/20" : "border-white/20"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-gray-900/70">
                  สถานะ:{" "}
                  {preview.willAlert ? (
                    <span className="text-amber-800">เตือนแล้ว ({preview.pct}%)</span>
                  ) : (
                    <span className="text-gray-900">{preview.pct}%</span>
                  )}
                </div>
                {preview.willAlert ? (
                  <div className="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-900 border border-amber-500/20">
                    <Bell size={12} className="inline-block mr-1" />
                    Alert
                  </div>
                ) : null}
              </div>

              <div className="mt-2 h-2.5 rounded-full bg-white/30 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, preview.pct)}%`,
                    backgroundColor: preview.willAlert ? "#f59e0b" : editingCat?.color || "#111827",
                  }}
                />
              </div>

              <div className="mt-2 text-[12px] text-gray-800/60">
                {preview.over > 0 ? (
                  <span className="text-red-700 font-bold">เกินงบ {formatCurrency(preview.over)}</span>
                ) : (
                  <span>เหลืองบ {formatCurrency(preview.remain)}</span>
                )}
              </div>
            </div>
          ) : null}

          <label className="text-xs font-bold text-gray-700 mb-1 block">วงเงินงบ (THB)</label>
          <input
            value={limit}
            onChange={(e) => setLimit(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
            inputMode="decimal"
            data-testid="budget-limit-input"
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-semibold text-gray-900"
            placeholder="เช่น 5000.00"
          />

          <div className="mt-2 flex gap-2 flex-wrap">
            {[1000, 2000, 3000, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setLimit(String(v))}
                className="px-3 py-1.5 rounded-full glass-chip text-[12px] font-semibold text-gray-900/80 border border-white/20 active:scale-95"
                title={`ตั้ง ${v}`}
              >
                {formatCurrency(v * 100)}
              </button>
            ))}
          </div>

          <label className="text-xs font-bold text-gray-700 mb-1 block mt-4">เตือนเมื่อใช้เกิน (%)</label>
          <input
            value={alertPct}
            onChange={(e) => setAlertPct(e.target.value)}
            type="number"
            min="10"
            max="100"
            data-testid="budget-alert-input"
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-semibold text-gray-900"
            placeholder="90"
          />

          <div className="mt-2 flex gap-2">
            {[80, 90, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAlertPct(String(v))}
                className="flex-1 py-2 rounded-2xl glass-chip font-semibold text-gray-900/80 border border-white/20 active:scale-95"
              >
                {v}%
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-600 mt-2">เช่น 90 = เตือนเมื่อเกิน 90% ของงบ</p>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-3 rounded-2xl glass-chip font-semibold text-gray-800 active:scale-95"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              data-testid="budget-save"
              className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-semibold flex items-center justify-center gap-2 active:scale-95"
            >
              <Check size={18} /> บันทึก
            </button>
          </div>

          {getBudget(budgets, month, editingCategoryId) ? (
            <button
              type="button"
              onClick={remove}
              className="w-full mt-3 py-3 rounded-2xl bg-red-500/10 text-red-700 font-semibold flex items-center justify-center gap-2 border border-red-500/15"
            >
              <Trash2 size={18} /> ลบงบประมาณ
            </button>
          ) : null}
        </ModalShell>
      ) : null}
      </main>
    </div>
  );
}
