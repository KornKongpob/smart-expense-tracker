import { useMemo, useState } from "react";
import { ChevronRight, Plus, Trash2, Play } from "lucide-react";
import { useAppStore } from "../store/store";

export default function RecurringView({ showAlert, showConfirm }) {
  const { state, actions } = useAppStore();

  const accounts = state.accounts || [];
  const cats = state.categories.expense || [];

  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(cats[0]?.id || "other");
  const [note, setNote] = useState("");

  const list = useMemo(() => state.recurring || [], [state.recurring]);

  const add = () => {
    const amt = Number(amount);
    if (!name.trim()) return showAlert?.("ใส่ชื่อ recurring");
    if (!Number.isFinite(amt) || amt <= 0) return showAlert?.("จำนวนเงินไม่ถูกต้อง");
    if (!accountId) return showAlert?.("เลือกบัญชี");
    if (!categoryId) return showAlert?.("เลือกหมวด");

    actions.addRecurring({ name: name.trim(), amount: amt, accountId, categoryId, note: note.trim() });
    setOpen(false);
    setName("");
    setAmount("0");
    setNote("");
  };

  const del = (id) => {
    showConfirm?.("ลบ recurring", "ยืนยันลบรายการประจำนี้?", () => actions.deleteRecurring(id), true);
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <header className="mb-6 flex items-center gap-3">
        <button
          onClick={() => actions.navigate("more")}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-600"
          type="button"
        >
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-gray-900">Recurring</h1>
          <p className="text-gray-500 text-sm">กด Run เพื่อสร้างรายการจาก recurring</p>
        </div>

        <button
          onClick={() => actions.runRecurringNow()}
          className="w-11 h-11 bg-gray-900 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95"
          type="button"
          aria-label="run"
        >
          <Play size={18} />
        </button>

        <button
          onClick={() => setOpen(true)}
          className="w-11 h-11 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-900 shadow-sm active:scale-95"
          type="button"
          aria-label="add"
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="space-y-3">
        {list.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-bold text-gray-900 truncate">{r.name}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">
                {r.note || ""}
              </div>
            </div>
            <button
              onClick={() => del(r.id)}
              className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center active:scale-95"
              type="button"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}

        {!list.length ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
            ยังไม่มี recurring
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm animate-fade-in-up">
            <h3 className="text-xl font-bold mb-4">เพิ่ม Recurring</h3>

            <label className="text-xs font-bold text-gray-500 mb-1 block">ชื่อ</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 mb-3" />

            <label className="text-xs font-bold text-gray-500 mb-1 block">จำนวนเงิน</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" className="w-full border border-gray-200 rounded-xl px-3 py-2 mb-3" />

            <label className="text-xs font-bold text-gray-500 mb-1 block">บัญชี</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 mb-3">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            <label className="text-xs font-bold text-gray-500 mb-1 block">หมวดหมู่</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 mb-3">
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label className="text-xs font-bold text-gray-500 mb-1 block">โน้ต</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 mb-5" />

            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold" type="button">
                ยกเลิก
              </button>
              <button onClick={add} className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold" type="button">
                เพิ่ม
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
