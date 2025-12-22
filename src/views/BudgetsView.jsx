// src/views/BudgetsView.jsx
import { useMemo, useState } from "react";
import { ChevronRight, Bell, Trash2, Check, X, ChevronLeft, Sparkles } from "lucide-react";
import { useAppStore } from "../store/store";
import { toMonthKey, calcSpentByCategoryInMonth, getBudget } from "../store/selectors";
import { formatCurrency } from "../utils/format";

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

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
      {/* ✅ Make sure modal always sits above bottom nav */}
      <div className="w-full sm:max-w-sm glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
            aria-label="close"
            title="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        {children}

        {/* ✅ Safe bottom space for iOS + easier tapping */}
        <div className="h-3 pb-safe" />
      </div>
    </div>
  );
}

export default function BudgetsView({ showAlert, showConfirm }) {
  const { state, navigate, upsertBudget, deleteBudget } = useAppStore();

  const [month, setMonth] = useState(() => toMonthKey(new Date())); // "YYYY-MM"

  const spentMap = useMemo(
    () => calcSpentByCategoryInMonth(state.transactions || [], month),
    [state.transactions, month]
  );

  const cats = state.categories?.expense || [];
  const budgets = state.budgets || [];

  const [open, setOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [alertPct, setAlertPct] = useState("90");

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
    setLimit(String(b?.limit ?? ""));
    setAlertPct(String(b?.alertPct ?? 90));
    setOpen(true);
  };

  const save = () => {
    if (!editingCategoryId) return;
    const lim = Number(limit);
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
    () => cats.find((c) => c.id === editingCategoryId) || null,
    [cats, editingCategoryId]
  );

  const editingSpent = useMemo(() => {
    if (!editingCategoryId) return 0;
    return spentMap.get(editingCategoryId) || 0;
  }, [spentMap, editingCategoryId]);

  const preview = useMemo(() => {
    const lim = Number(limit);
    const ap = Number(alertPct);
    if (!Number.isFinite(lim) || lim <= 0) return null;

    const pct = Math.round((editingSpent / lim) * 100);
    const willAlert = Number.isFinite(ap) ? pct >= ap : false;
    const remain = Math.max(0, lim - editingSpent);
    const over = Math.max(0, editingSpent - lim);

    return { lim, ap: Number.isFinite(ap) ? ap : 90, pct, willAlert, remain, over };
  }, [limit, alertPct, editingSpent]);

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("more")}
          className="w-10 h-10 rounded-full glass-icon-btn flex items-center justify-center text-gray-700"
          type="button"
          aria-label="back"
          title="ย้อนกลับ"
        >
          <ChevronRight className="rotate-180" size={24} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-600" />
            Budget Alert
          </h1>
          <p className="text-gray-600 text-sm truncate">
            {formatMonthLabelTH(month)} <span className="text-gray-500">({month})</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
            className="w-10 h-10 rounded-full glass-icon-btn flex items-center justify-center text-gray-700 active:scale-95"
            aria-label="prev month"
            title="เดือนก่อนหน้า"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonthKey(m, +1))}
            className="w-10 h-10 rounded-full glass-icon-btn flex items-center justify-center text-gray-700 active:scale-95"
            aria-label="next month"
            title="เดือนถัดไป"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      {/* Summary */}
      <div className="glass-card rounded-3xl p-5 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900/60 uppercase">สรุปเดือนนี้</div>
            <div className="mt-1 text-lg font-extrabold text-gray-900">
              ใช้ไป {formatCurrency(summary.totalSpent)}
              {summary.totalLimit ? (
                <span className="text-gray-800/60 text-sm font-bold"> / งบรวม {formatCurrency(summary.totalLimit)}</span>
              ) : (
                <span className="text-gray-800/50 text-sm font-bold"> (ยังไม่ได้ตั้งงบรวม)</span>
              )}
            </div>
          </div>

          {summary.alertCount ? (
            <div className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-900 text-xs font-extrabold inline-flex items-center gap-1 border border-amber-500/20 shrink-0">
              <Bell size={14} /> Alert {summary.alertCount}
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-full bg-white/20 text-gray-800/70 text-xs font-extrabold border border-white/20 shrink-0">
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
                    <div className="font-extrabold text-gray-900 truncate">{cat.name}</div>

                    <div className="text-xs text-gray-700/80 mt-0.5">
                      ใช้แล้ว <span className="font-extrabold">{formatCurrency(spent)}</span>
                      {lim ? (
                        <>
                          {" "}
                          / งบ <span className="font-extrabold">{formatCurrency(lim)}</span>{" "}
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
                  <div className="px-3 py-1 rounded-full glass-chip text-amber-900 text-xs font-extrabold inline-flex items-center gap-1 shrink-0">
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
              <div className="text-sm font-extrabold text-gray-900 truncate">
                {editingCat?.name || editingCategoryId}
              </div>
              <div className="text-[12px] text-gray-800/60 mt-0.5">
                ใช้แล้วเดือนนี้: <span className="font-extrabold text-gray-900">{formatCurrency(editingSpent)}</span>
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
                <div className="text-xs font-extrabold text-gray-900/70">
                  สถานะ:{" "}
                  {preview.willAlert ? (
                    <span className="text-amber-800">เตือนแล้ว ({preview.pct}%)</span>
                  ) : (
                    <span className="text-gray-900">{preview.pct}%</span>
                  )}
                </div>
                {preview.willAlert ? (
                  <div className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-amber-500/15 text-amber-900 border border-amber-500/20">
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
            onChange={(e) => setLimit(e.target.value)}
            type="number"
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
            placeholder="เช่น 5000"
          />

          <div className="mt-2 flex gap-2 flex-wrap">
            {[1000, 2000, 3000, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setLimit(String(v))}
                className="px-3 py-1.5 rounded-full glass-chip text-[12px] font-extrabold text-gray-900/80 border border-white/20 active:scale-95"
                title={`ตั้ง ${v}`}
              >
                {formatCurrency(v)}
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
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold text-gray-900"
            placeholder="90"
          />

          <div className="mt-2 flex gap-2">
            {[80, 90, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAlertPct(String(v))}
                className="flex-1 py-2 rounded-2xl glass-chip font-extrabold text-gray-900/80 border border-white/20 active:scale-95"
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
              className="flex-1 py-3 rounded-2xl glass-chip font-extrabold text-gray-800 active:scale-95"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
            >
              <Check size={18} /> บันทึก
            </button>
          </div>

          {getBudget(budgets, month, editingCategoryId) ? (
            <button
              type="button"
              onClick={remove}
              className="w-full mt-3 py-3 rounded-2xl bg-red-500/10 text-red-700 font-extrabold flex items-center justify-center gap-2 border border-red-500/15"
            >
              <Trash2 size={18} /> ลบงบประมาณ
            </button>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}
