// src/views/BudgetsView.jsx
import { useMemo, useState } from "react";
import { ChevronRight, Bell, Trash2, Check, X } from "lucide-react";
import { useAppStore } from "../store/store";
import { toMonthKey, calcSpentByCategoryInMonth, getBudget } from "../store/selectors";
import { formatCurrency } from "../utils/format";

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function BudgetsView({ showAlert, showConfirm }) {
  const { state, navigate, upsertBudget, deleteBudget } = useAppStore();

  const month = useMemo(() => toMonthKey(new Date()), []);
  const spentMap = useMemo(() => calcSpentByCategoryInMonth(state.transactions || [], month), [state.transactions, month]);

  const cats = state.categories?.expense || [];
  const budgets = state.budgets || [];

  const [open, setOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [alertPct, setAlertPct] = useState("90");

  const rows = useMemo(() => {
    return cats.map((c) => {
      const spent = spentMap.get(c.id) || 0;
      const b = getBudget(budgets, month, c.id);
      const lim = Number(b?.limit || 0) || 0;
      const pct = lim ? Math.round((spent / lim) * 100) : 0;
      const ap = Number(b?.alertPct || 90) || 90;
      const alert = lim ? pct >= ap : false;
      return { cat: c, spent, budget: b, lim, pct, alert };
    });
  }, [cats, spentMap, budgets, month]);

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

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("more")}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-600"
          type="button"
        >
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Budget Alert</h1>
          <p className="text-gray-500 text-sm">เดือน {month}</p>
        </div>
      </header>

      <div className="space-y-3">
        {rows.map((r) => {
          const { cat, spent, lim, pct, alert } = r;
          return (
            <button
              key={cat.id}
              onClick={() => openEdit(cat.id)}
              type="button"
              className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${cat.color}20` }}
                  >
                    {cat.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-gray-900 truncate">{cat.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ใช้แล้ว {formatCurrency(spent)}
                      {lim ? (
                        <>
                          {" "} / งบ {formatCurrency(lim)} ({pct}%)
                        </>
                      ) : (
                        <span className="ml-2 text-gray-400">ยังไม่ได้ตั้งงบ</span>
                      )}
                    </div>
                  </div>
                </div>

                {alert ? (
                  <div className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-extrabold inline-flex items-center gap-1 shrink-0">
                    <Bell size={14} /> Alert
                  </div>
                ) : null}
              </div>

              {lim ? (
                <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: alert ? "#f59e0b" : "#111827",
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
          <div className="text-sm font-extrabold text-gray-900 mb-2">
            หมวด: {cats.find((c) => c.id === editingCategoryId)?.name || editingCategoryId}
          </div>

          <label className="text-xs font-bold text-gray-500 mb-1 block">วงเงินงบ (THB)</label>
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            type="number"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold"
            placeholder="เช่น 5000"
          />

          <label className="text-xs font-bold text-gray-500 mb-1 block mt-4">เตือนเมื่อใช้เกิน (%)</label>
          <input
            value={alertPct}
            onChange={(e) => setAlertPct(e.target.value)}
            type="number"
            min="10"
            max="100"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold"
            placeholder="90"
          />
          <p className="text-[11px] text-gray-400 mt-1">เช่น 90 = เตือนเมื่อเกิน 90% ของงบ</p>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-3 rounded-2xl bg-gray-100 font-extrabold text-gray-700"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              className="flex-1 py-3 rounded-2xl bg-gray-900 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
            >
              <Check size={18} /> บันทึก
            </button>
          </div>

          {getBudget(budgets, month, editingCategoryId) ? (
            <button
              type="button"
              onClick={remove}
              className="w-full mt-3 py-3 rounded-2xl bg-red-50 text-red-600 font-extrabold flex items-center justify-center gap-2"
            >
              <Trash2 size={18} /> ลบงบประมาณ
            </button>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}
