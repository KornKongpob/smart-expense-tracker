// src/views/RecurringView.jsx
import { useState } from "react";
import { ChevronRight, Plus, Trash2, Check, X, Repeat } from "lucide-react";
import { useAppStore } from "../store/store";
import { toISODate } from "../utils/format";

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

export default function RecurringView({ showAlert, showConfirm }) {
  const { state, navigate, upsertRecurring, deleteRecurring, runRecurringNow } = useAppStore();

  const accounts = state.accounts || [];
  const expenseCats = state.categories?.expense || [];
  const incomeCats = state.categories?.income || [];
  const recurring = state.recurring || [];

  const [open, setOpen] = useState(false);

  const [rtype, setRType] = useState("expense");
  const [amount, setAmount] = useState("0");
  const [categoryId, setCategoryId] = useState(expenseCats?.[0]?.id || "other");
  const [accountId, setAccountId] = useState(accounts?.[0]?.id || "");
  const [note, setNote] = useState("Recurring");
  const [startDate, setStartDate] = useState(toISODate(new Date()));
  const [frequency, setFrequency] = useState("monthly");
  const [interval, setInterval] = useState("1");

  const openNew = () => {
    setRType("expense");
    setAmount("0");
    setCategoryId(expenseCats?.[0]?.id || "other");
    setAccountId(accounts?.[0]?.id || "");
    setNote("Recurring");
    setStartDate(toISODate(new Date()));
    setFrequency("monthly");
    setInterval("1");
    setOpen(true);
  };

  const save = () => {
    const amt = Number(amount);
    const itv = Number(interval);

    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");
    if (!Number.isFinite(amt) || amt <= 0) return showAlert?.("จำนวนเงินไม่ถูกต้อง");
    if (!categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!Number.isFinite(itv) || itv <= 0) return showAlert?.("interval ไม่ถูกต้อง");

    upsertRecurring({
      enabled: true,
      type: rtype,
      amount: amt,
      categoryId,
      accountId,
      note: String(note || "").trim() || "Recurring",
      startDate,
      frequency,
      interval: itv,
      lastGenerated: null,
    });

    setOpen(false);
    showAlert?.("บันทึก Recurring แล้ว");
  };

  const remove = (id) => showConfirm?.("ลบ Recurring", "ยืนยันลบรายการ Recurring นี้?", () => deleteRecurring(id), true);

  const toggle = (r) => upsertRecurring({ ...r, enabled: !r.enabled });

  const runNow = () => {
    const n = runRecurringNow?.() ?? 0;
    showAlert?.(`สร้างรายการตาม Recurring เพิ่มแล้ว ${n} รายการ`);
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("more")}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-600"
            type="button"
          >
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Recurring</h1>
            <p className="text-gray-500 text-sm">สร้างรายการอัตโนมัติรายสัปดาห์/รายเดือน</p>
          </div>
        </div>

        <button
          onClick={openNew}
          className="w-11 h-11 bg-gray-900 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95"
          type="button"
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-extrabold text-gray-900 flex items-center gap-2">
            <Repeat size={18} className="text-emerald-700" />
            Generate Now
          </div>
          <div className="text-xs text-gray-500 mt-1">กดเพื่อสร้างรายการที่ถึงรอบแล้วทันที</div>
        </div>
        <button type="button" onClick={runNow} className="px-4 py-3 rounded-2xl bg-emerald-600 text-white font-extrabold active:scale-95">
          Run
        </button>
      </div>

      <div className="space-y-3">
        {recurring.length ? (
          recurring.map((r) => {
            const cat =
              (r.type === "income" ? incomeCats : expenseCats).find((c) => c.id === r.categoryId) || {
                name: r.categoryId,
                icon: "🏷️",
                color: "#ccc",
              };
            const acc = accounts.find((a) => a.id === r.accountId);
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: `${cat.color}20` }}
                    >
                      {cat.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-gray-900 truncate">{r.note || "Recurring"}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {r.type.toUpperCase()} • {cat.name} • {acc ? acc.name : r.accountId}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {r.frequency} ทุก {r.interval} • เริ่ม {r.startDate}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggle(r)}
                      className={`w-14 h-8 rounded-full transition-all relative ${r.enabled ? "bg-gray-900" : "bg-gray-200"}`}
                    >
                      <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${r.enabled ? "left-7" : "left-1"}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center active:scale-95"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-lg font-extrabold text-gray-900">{r.amount}</div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
              <Repeat size={32} />
            </div>
            <p className="text-gray-500 font-extrabold">ยังไม่มี Recurring</p>
            <button onClick={openNew} className="mt-3 text-emerald-700 text-sm font-extrabold" type="button">
              เพิ่มรายการประจำ
            </button>
          </div>
        )}
      </div>

      {open ? (
        <ModalShell title="เพิ่ม Recurring" onClose={() => setOpen(false)}>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-1 flex mb-4">
            {["expense", "income"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setRType(t);
                  setCategoryId((t === "income" ? incomeCats : expenseCats)?.[0]?.id || "other");
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold ${
                  rtype === t ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-white"
                }`}
              >
                {t === "expense" ? "รายจ่าย" : "รายรับ"}
              </button>
            ))}
          </div>

          <label className="text-xs font-bold text-gray-500 mb-1 block">จำนวนเงิน</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold"
          />

          <label className="text-xs font-bold text-gray-500 mb-1 block mt-4">หมวดหมู่</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-white outline-none focus:border-gray-900 text-sm font-extrabold"
          >
            {(rtype === "income" ? incomeCats : expenseCats).map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>

          <label className="text-xs font-bold text-gray-500 mb-1 block mt-4">บัญชี</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-white outline-none focus:border-gray-900 text-sm font-extrabold"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>

          <label className="text-xs font-bold text-gray-500 mb-1 block mt-4">โน้ต</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold"
            placeholder="เช่น ค่าเช่า, Netflix"
          />

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">เริ่มวันที่</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">ความถี่</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-white outline-none focus:border-gray-900 text-sm font-extrabold"
              >
                <option value="monthly">รายเดือน</option>
                <option value="weekly">รายสัปดาห์</option>
              </select>
            </div>
          </div>

          <label className="text-xs font-bold text-gray-500 mb-1 block mt-4">Interval (ทุกกี่ครั้ง)</label>
          <input
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            type="number"
            min="1"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:border-gray-900 font-extrabold"
            placeholder="1"
          />

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
        </ModalShell>
      ) : null}
    </div>
  );
}
