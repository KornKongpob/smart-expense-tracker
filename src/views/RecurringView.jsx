// src/views/RecurringView.jsx
import { useMemo, useState } from "react";
import CategorySelect from "../components/CategorySelect";
import AccountPicker from "../components/AccountPicker";
import { ChevronRight, Plus, Trash2, Check, X, Repeat, Pencil, PlayCircle, CalendarClock } from "lucide-react";
import AppHeader from "../components/AppHeader";
import ModalShell from "../components/ModalShell";
import { useAppStore } from "../store/store.jsx";
import { formatCurrency, toISODate } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput, formatMoneyInputFromSatang } from "../utils/money";
import { getNextRecurringDueDate, getNextRecurringDueISO, isRecurringDue } from "../utils/recurring";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";


// ---- local helpers (mirror store logic, but view-only) ----
const safeNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clampInt = (v, min, max, fallback) => {
  const n = Math.trunc(safeNum(v, fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export default function RecurringView({ showAlert, showConfirm }) {
  const { state, navigate, upsertRecurring, deleteRecurring, runRecurringNow } = useAppStore();

  const accounts = state.accounts || [];
  const expenseCats = state.categories?.expense || [];
  const incomeCats = state.categories?.income || [];
  // Keep stable reference to avoid exhaustive-deps warnings when state.recurring is undefined.
  const recurring = useMemo(() => (Array.isArray(state?.recurring) ? state.recurring : []), [state?.recurring]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Prevent background scroll while modal is open
  useLockBodyScroll(open);

  const [rtype, setRType] = useState("expense");
  const [amount, setAmount] = useState("0");
  const [categoryId, setCategoryId] = useState(expenseCats?.[0]?.id || "other");
  const [accountId, setAccountId] = useState(accounts?.[0]?.id || "");
  const [note, setNote] = useState("Recurring");
  const [startDate, setStartDate] = useState(toISODate(new Date()));
  const [frequency, setFrequency] = useState("monthly"); // weekly | monthly
  const [interval, setInterval] = useState("1");

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const recurringStats = useMemo(() => {
    const enabled = (recurring || []).filter((r) => r?.enabled !== false).length;

    // “due-ish” = nextDue <= today
    let due = 0;
    for (const r of recurring || []) {
      if (r?.enabled === false) continue;
      if (isRecurringDue(r, todayISO)) due += 1;
    }

    return { total: (recurring || []).length, enabled, due };
  }, [recurring, todayISO]);

  const resetForm = () => {
    setEditingId(null);
    setRType("expense");
    setAmount("0.00");
    setCategoryId(expenseCats?.[0]?.id || "other");
    setAccountId(accounts?.[0]?.id || "");
    setNote("Recurring");
    setStartDate(toISODate(new Date()));
    setFrequency("monthly");
    setInterval("1");
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (r) => {
    setEditingId(r?.id || null);
    setRType(r?.type === "income" ? "income" : "expense");
    setAmount(formatMoneyInputFromSatang(r?.amount ?? 0, { emptyIfZero: false }));
    setCategoryId(String(r?.categoryId || (r?.type === "income" ? incomeCats?.[0]?.id : expenseCats?.[0]?.id) || "other"));
    setAccountId(String(r?.accountId || accounts?.[0]?.id || ""));
    setNote(String(r?.note || "Recurring"));
    setStartDate(String(r?.startDate || toISODate(new Date())).slice(0, 10));
    setFrequency(r?.frequency === "weekly" ? "weekly" : "monthly");
    setInterval(String(clampInt(r?.interval, 1, 120, 1)));
    setOpen(true);
  };

  const save = () => {
    const amt = parseMoneyToSatang(amount);
    const itv = Number(interval);

    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");
    if (!Number.isFinite(amt) || amt <= 0) return showAlert?.("จำนวนเงินไม่ถูกต้อง");
    if (!categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!Number.isFinite(itv) || itv <= 0) return showAlert?.("interval ไม่ถูกต้อง");
    if (!startDate) return showAlert?.("กรุณาเลือกวันเริ่ม");

    const existing = editingId ? (recurring || []).find((x) => x?.id === editingId) : null;

    upsertRecurring({
      id: existing?.id, // ✅ keep id when editing
      enabled: existing ? existing.enabled !== false : true,
      type: rtype,
      amount: amt,
      categoryId,
      accountId,
      note: String(note || "").trim() || "Recurring",
      startDate: String(startDate).slice(0, 10),
      frequency,
      interval: itv,
      // ✅ don't wipe lastGenerated when editing
      lastGenerated: existing?.lastGenerated ?? null,
    });

    setOpen(false);
    showAlert?.(existing ? "บันทึกการแก้ไข Recurring แล้ว" : "บันทึก Recurring แล้ว");
  };

  const remove = (id) => {
    showConfirm?.("ลบ Recurring", "ยืนยันลบรายการ Recurring นี้?", () => deleteRecurring(id), true);
  };

  const toggle = (r) => {
    upsertRecurring({ ...r, enabled: !r.enabled });
  };

  const runNow = () => {
    const res = runRecurringNow?.() || { createdCount: 0, truncatedRules: [], cap: 0 };
    const n = Number(res.createdCount || 0) || 0;
    const truncated = Array.isArray(res.truncatedRules) ? res.truncatedRules.length : 0;
    if (truncated) {
      showAlert?.(
        `สร้างรายการตาม Recurring เพิ่มแล้ว ${n} รายการ (ถึงวันที่ ${todayISO}) — บางกฎถูกจำกัดต่อครั้ง ${res.cap} รายการ (กด Run อีกครั้งเพื่อสร้างต่อ)`
      );
      return;
    }
    showAlert?.(`สร้างรายการตาม Recurring เพิ่มแล้ว ${n} รายการ (ถึงวันที่ ${todayISO})`);
  };

  const catsForType = rtype === "income" ? incomeCats : expenseCats;

  // If switching type and current categoryId not in list, snap to first
  const ensureCategoryInType = (nextType) => {
    const list = nextType === "income" ? incomeCats : expenseCats;
    const ok = (list || []).some((c) => c?.id === categoryId);
    if (!ok) setCategoryId(list?.[0]?.id || "other");
  };

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="รายการประจำ"
        subtitle={`เปิดใช้งาน ${recurringStats.enabled}/${recurringStats.total}${recurringStats.due ? ` • ถึงรอบวันนี้ ~${recurringStats.due}` : ""}`}
        onBack={() => navigate("more")}
        right={
          <button
            onClick={openNew}
            data-testid="recurring-add"
            className="ui-icon-btn text-gray-900 active:scale-95"
            type="button"
            aria-label="เพิ่มรายการประจำ"
            title="เพิ่มรายการประจำ"
          >
            <Plus size={18} />
          </button>
        }
      />

      <main className="ui-page pt-4 pb-6 view-flow">

      {/* Summary */}
      <div className="text-[13px] text-slate-500">เปิดใช้ {recurringStats.enabled}/{recurringStats.total} • ถึงรอบ {recurringStats.due || 0} รายการ</div>

      <div className="ui-card p-4 mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-9 h-9 rounded-2xl glass-chip flex items-center justify-center text-emerald-700">
              <Repeat size={18} />
            </span>
            Generate Now
          </div>
          <div className="text-xs text-gray-600 mt-1">
            กดเพื่อสร้างรายการที่ถึงรอบแล้วทันที • วันนี้ {todayISO}
          </div>
          {recurringStats.due ? (
            <div className="text-[11px] text-emerald-800/80 mt-1 inline-flex items-center gap-1">
              <CalendarClock size={12} /> มี {recurringStats.due} รายการที่น่าจะถึงรอบ
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={runNow}
          data-testid="recurring-run-now"
          className="px-4 py-3 rounded-2xl bg-emerald-600/90 text-white font-semibold active:scale-95 shadow-sm inline-flex items-center gap-2"
        >
          <PlayCircle size={18} /> Run
        </button>
      </div>

      <div className="space-y-3">
        {recurring.length ? (
          recurring
            .slice()
            .sort((a, b) => {
              // enabled first, then nearest nextDue
              const ae = a?.enabled !== false;
              const be = b?.enabled !== false;
              if (ae !== be) return ae ? -1 : 1;
              const an = getNextRecurringDueDate(a, todayISO).getTime();
              const bn = getNextRecurringDueDate(b, todayISO).getTime();
              return an - bn;
            })
            .map((r) => {
              const list = r.type === "income" ? incomeCats : expenseCats;
              const cat =
                (list || []).find((c) => c.id === r.categoryId) || {
                  name: r.categoryId,
                  icon: "🏷️",
                  color: "#ccc",
                };
              const acc = accounts.find((a) => a.id === r.accountId);

              const nextDueISO = getNextRecurringDueISO(r, todayISO);
              const isDue = r.enabled !== false && isRecurringDue(r, todayISO);

              return (
                <div key={r.id} className="ui-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                        style={{ backgroundColor: `${cat.color}20` }}
                      >
                        {cat.icon}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold text-gray-900 truncate">{r.note || "Recurring"}</div>
                          {isDue ? (
                            <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/20">
                              ถึงรอบ
                            </span>
                          ) : null}
                          {r.enabled === false ? (
                            <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-white/25 text-gray-700 border border-white/20">
                              ปิดใช้งาน
                            </span>
                          ) : null}
                        </div>

                        <div className="text-xs text-gray-700/80 mt-1">
                          {String(r.type || "").toUpperCase()} • {cat.name} • {acc ? acc.name : r.accountId}
                        </div>

                        <div className="text-xs text-gray-700/70 mt-0.5">
                          {r.frequency} ทุก {r.interval} • เริ่ม {r.startDate}
                          <span className="mx-2">•</span>
                          รอบถัดไป <span className="font-semibold text-gray-900">{nextDueISO}</span>
                        </div>

                        {r.lastGenerated ? (
                          <div className="text-[11px] text-gray-700/55 mt-1">สร้างล่าสุด: {String(r.lastGenerated).slice(0, 10)}</div>
                        ) : (
                          <div className="text-[11px] text-gray-700/55 mt-1">ยังไม่เคยสร้างรายการ</div>
                        )}

                        <div className="mt-2 text-lg font-semibold text-gray-900">{formatCurrency(r.amount)}</div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggle(r)}
                        data-testid={`recurring-toggle-${r.id}`}
                        className={`w-14 h-8 rounded-full transition-all relative ${
                          r.enabled ? "bg-gray-900/90" : "bg-white/25"
                        } border border-white/25`}
                        title={r.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      >
                        <span
                          className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                            r.enabled ? "left-7" : "left-1"
                          }`}
                        />
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          data-testid={`recurring-edit-${r.id}`}
                          className="w-10 h-10 rounded-full glass-icon-btn text-gray-800 flex items-center justify-center active:scale-95"
                          title="แก้ไข"
                        >
                          <Pencil size={18} />
                        </button>

                        <button
                          type="button"
                          onClick={() => remove(r.id)}
                          data-testid={`recurring-delete-${r.id}`}
                          className="w-10 h-10 rounded-full bg-red-500/10 text-red-700 flex items-center justify-center active:scale-95 border border-red-500/15"
                          title="ลบ"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
        ) : (
          <div className="ui-card border border-dashed border-white/30 text-center py-16">
            <div className="w-16 h-16 glass-chip rounded-full flex items-center justify-center mx-auto mb-3 text-gray-600">
              <Repeat size={32} />
            </div>
            <p className="text-gray-800 font-semibold">ยังไม่มี Recurring</p>
            <button onClick={openNew} className="mt-3 text-emerald-700 text-sm font-semibold" type="button">
              เพิ่มรายการประจำ
            </button>
          </div>
        )}
      </div>

      {open ? (
        <ModalShell title={editingId ? "แก้ไข Recurring" : "เพิ่ม Recurring"} onClose={() => setOpen(false)}>
          <div className="glass-panel border border-white/20 rounded-2xl p-1 flex mb-4">
            {["expense", "income"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setRType(t);
                  ensureCategoryInType(t);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                  rtype === t ? "bg-gray-900/90 text-white" : "text-gray-700 hover:bg-white/10"
                }`}
              >
                {t === "expense" ? "รายจ่าย" : "รายรับ"}
              </button>
            ))}
          </div>

          <label className="text-xs font-bold text-gray-700 mb-1 block">จำนวนเงิน</label>
          <input
            value={amount}
            onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))}
            inputMode="decimal"
            data-testid="recurring-amount-input"
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-semibold text-gray-900"
          />

          <label className="text-xs font-bold text-gray-700 mb-1 block mt-4">หมวดหมู่</label>
          <CategorySelect
            categories={catsForType || []}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full glass-input rounded-2xl px-4 py-3 bg-transparent outline-none focus:border-gray-900 text-sm font-semibold text-gray-900"
          />

          <label className="text-xs font-bold text-gray-700 mb-1 block mt-4">บัญชี</label>
          <AccountPicker
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            title="เลือกบัญชี"
            placeholder="เลือกบัญชี"
          />

          <label className="text-xs font-bold text-gray-700 mb-1 block mt-4">โน้ต</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="recurring-note-input"
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-semibold text-gray-900"
            placeholder="เช่น ค่าเช่า, Netflix"
          />

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">เริ่มวันที่</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="recurring-start-input"
                className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-semibold text-gray-900"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">ความถี่</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full glass-input rounded-2xl px-4 py-3 bg-transparent outline-none focus:border-gray-900 text-sm font-semibold text-gray-900"
              >
                <option value="monthly">รายเดือน</option>
                <option value="weekly">รายสัปดาห์</option>
              </select>
            </div>
          </div>

          <label className="text-xs font-bold text-gray-700 mb-1 block mt-4">Interval (ทุกกี่ครั้ง)</label>
          <input
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            type="number"
            min="1"
            className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-semibold text-gray-900"
            placeholder="1"
          />

          {/* Preview next due */}
          <div className="mt-4 glass-panel border border-white/20 rounded-2xl px-4 py-3">
            <div className="text-[12px] text-gray-700/70 font-semibold">Preview</div>
            <div className="text-sm text-gray-900 mt-1">
              รอบถัดไป:{" "}
              <span className="font-semibold">
                {getNextRecurringDueISO(
                  {
                    startDate,
                    lastGenerated: editingId ? (recurring || []).find((x) => x?.id === editingId)?.lastGenerated : null,
                    frequency,
                    interval,
                  },
                  todayISO
                )}
              </span>
            </div>
            <div className="text-[11px] text-gray-700/55 mt-1">
              * ระบบจะสร้างรายการ “ทุกครั้งที่กด Run” หรือเมื่อคุณกด Run Recurring Now ในหน้า More
            </div>
          </div>

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
              data-testid="recurring-save"
              className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-semibold flex items-center justify-center gap-2 active:scale-95"
            >
              <Check size={18} /> บันทึก
            </button>
          </div>

          {editingId ? (
            <button
              type="button"
              onClick={() => {
                const id = editingId;
                setOpen(false);
                showConfirm?.("ลบ Recurring", "ยืนยันลบรายการ Recurring นี้?", () => deleteRecurring(id), true);
              }}
              className="w-full mt-3 py-3 rounded-2xl bg-red-500/10 text-red-700 font-semibold flex items-center justify-center gap-2 border border-red-500/15"
            >
              <Trash2 size={18} /> ลบ Recurring
            </button>
          ) : null}
        </ModalShell>
      ) : null}
      </main>
    </div>
  );
}
