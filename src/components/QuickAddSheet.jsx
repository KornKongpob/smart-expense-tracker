// src/components/QuickAddSheet.jsx
// Lightweight bottom-sheet for quick expense/income entry.
// Amount + Category + Account → Save in one tap.
// "รายละเอียดเพิ่ม" opens the full AddTransactionView.

import { useState, useMemo, useEffect, useRef } from "react";
import { X, Check, ChevronRight, ArrowDownUp } from "lucide-react";
import { useAppStore } from "../store/store.jsx";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money";
import { formatCurrency, toISODate } from "../utils/format";
import { generateId } from "../utils/id";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

function CategoryChip({ cat, selected, onClick }) {
  const isActive = selected === cat.id;
  return (
    <button
      type="button"
      onClick={() => onClick(cat.id)}
      className={[
        "flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-sm font-extrabold transition-all active:scale-95",
        isActive
          ? "bg-indigo-600/15 border-indigo-600/25 text-indigo-800 shadow-sm"
          : "bg-white/60 border-gray-900/10 text-gray-800 hover:bg-white/80",
      ].join(" ")}
    >
      <span className="text-base leading-none">{cat.icon || "🏷️"}</span>
      <span className="truncate max-w-[80px]">{cat.name}</span>
    </button>
  );
}

export default function QuickAddSheet({ isOpen, onClose }) {
  const store = useAppStore();
  const { state } = store;

  useLockBodyScroll(isOpen);

  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");

  const amountRef = useRef(null);

  const accounts = useMemo(() => state.accounts || [], [state.accounts]);
  const categories = useMemo(() => {
    const list = type === "income"
      ? (state.categories?.income || [])
      : (state.categories?.expense || []);
    return list.filter((c) => !(c?.deletedAt || c?.isDeleted));
  }, [state.categories, type]);

  // Recent categories from transaction history
  const recentCats = useMemo(() => {
    const txs = state.transactions || [];
    const out = [];
    const seen = new Set();
    const catMap = new Map(categories.map((c) => [c.id, c]));

    for (let i = txs.length - 1; i >= 0; i--) {
      const t = txs[i];
      if (!t || t.isTransfer) continue;
      if (String(t.type || "").toLowerCase() !== type) continue;
      const cid = String(t.category || "").trim();
      if (!cid || seen.has(cid)) continue;
      const cat = catMap.get(cid);
      if (!cat) continue;
      seen.add(cid);
      out.push(cat);
      if (out.length >= 8) break;
    }

    // If fewer than 4 recent, pad with top categories
    if (out.length < 4) {
      for (const c of categories) {
        if (seen.has(c.id)) continue;
        if (String(c.parentId || "").trim()) continue; // main only
        out.push(c);
        seen.add(c.id);
        if (out.length >= 8) break;
      }
    }

    return out;
  }, [state.transactions, categories, type]);

  // Default to first account
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  // Auto-focus amount on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => amountRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setType("expense");
      setAmount("");
      setCategoryId("");
      setNote("");
      setAccountId(accounts?.[0]?.id || "");
    }
  }, [isOpen, accounts]);

  const handleSave = () => {
    const satang = parseMoneyToSatang(amount);
    if (!satang || satang <= 0) return;

    const cat = categoryId || (type === "income" ? "other_income" : "other");
    const acc = accountId || accounts?.[0]?.id || "";
    const now = Date.now();

    store.upsertTransaction({
      id: generateId(),
      type,
      amount: satang,
      category: cat,
      accountId: acc,
      date: toISODate(new Date()),
      note: note || "",
      isTransfer: false,
      transferId: null,
      ref: "",
      createdAt: now,
      updatedAt: now,
    });

    onClose();
  };

  const handleOpenFull = () => {
    onClose();
    // Small delay so sheet closes before full form opens
    setTimeout(() => store.startNewTransaction(), 150);
  };

  if (!isOpen) return null;

  const currentAccount = accounts.find((a) => a.id === accountId);

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Sheet */}
      <div className="relative w-full max-w-md glass-card rounded-t-3xl p-5 pb-safe animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-gray-900">บันทึกเร็ว</h3>
          <button
            type="button"
            onClick={onClose}
            className="ui-icon-btn"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex gap-2 mb-4">
          {["expense", "income"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setType(t); setCategoryId(""); }}
              className={[
                "flex-1 py-2.5 rounded-2xl text-sm font-extrabold border transition-all active:scale-[0.98]",
                type === t
                  ? t === "expense"
                    ? "bg-rose-600/15 border-rose-600/20 text-rose-800"
                    : "bg-emerald-600/15 border-emerald-600/20 text-emerald-800"
                  : "bg-white/50 border-gray-900/10 text-gray-700",
              ].join(" ")}
            >
              {t === "expense" ? "รายจ่าย" : "รายรับ"}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="mb-4">
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            className="ui-input text-center text-2xl font-black tracking-tight"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
          />
        </div>

        {/* Note (optional) */}
        <div className="mb-4">
          <input
            type="text"
            className="ui-input text-sm"
            placeholder="โน้ต (ไม่บังคับ)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
          />
        </div>

        {/* Category chips */}
        <div className="mb-4">
          <div className="text-xs font-extrabold text-gray-700/60 mb-2">หมวดหมู่</div>
          <div className="flex flex-wrap gap-2">
            {recentCats.map((cat) => (
              <CategoryChip
                key={cat.id}
                cat={cat}
                selected={categoryId}
                onClick={setCategoryId}
              />
            ))}
          </div>
        </div>

        {/* Account */}
        {accounts.length > 1 && (
          <div className="mb-5">
            <div className="text-xs font-extrabold text-gray-700/60 mb-2">บัญชี</div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountId(a.id)}
                  className={[
                    "shrink-0 px-3 py-2 rounded-2xl border text-sm font-extrabold transition-all active:scale-95",
                    accountId === a.id
                      ? "bg-indigo-600/15 border-indigo-600/25 text-indigo-800"
                      : "bg-white/60 border-gray-900/10 text-gray-800",
                  ].join(" ")}
                >
                  {a.icon || "💳"} {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleOpenFull}
            className="ui-btn ui-btn-secondary flex-1 text-sm"
          >
            รายละเอียดเพิ่ม <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!parseMoneyToSatang(amount)}
            className="ui-btn ui-btn-primary flex-1 text-sm"
          >
            <Check size={18} /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
