// src/components/QuickAddSheet.jsx
// Redesigned bottom-sheet for quick expense/income entry.
// Amount + Main Category → Subcategory → Account → Save.
// Includes Quick Scan shortcut and "รายละเอียดเพิ่ม" to open full form.

import { useState, useMemo, useEffect, useRef } from "react";
import { X, Check, ChevronRight, ChevronDown, Camera, FileText, Search } from "lucide-react";
import { useAppStore } from "../store/store.jsx";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money";
import { formatCurrency, toISODate } from "../utils/format";
import { generateId } from "../utils/id";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

export default function QuickAddSheet({ isOpen, onClose }) {
  const store = useAppStore();
  const { state } = store;

  useLockBodyScroll(isOpen);

  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [mainCatId, setMainCatId] = useState("");
  const [subCatId, setSubCatId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const amountRef = useRef(null);

  const accounts = useMemo(() => state.accounts || [], [state.accounts]);
  const allCats = useMemo(() => {
    const list = type === "income"
      ? (state.categories?.income || [])
      : (state.categories?.expense || []);
    return list.filter((c) => !(c?.deletedAt || c?.isDeleted));
  }, [state.categories, type]);

  // Main categories (no parent)
  const mainCats = useMemo(() => allCats.filter((c) => !String(c.parentId || "").trim()), [allCats]);

  // Sub categories for selected main
  const subCats = useMemo(() => {
    if (!mainCatId) return [];
    return allCats.filter((c) => String(c.parentId || "").trim() === mainCatId);
  }, [allCats, mainCatId]);

  // Recent categories from transaction history
  const recentCats = useMemo(() => {
    const txs = state.transactions || [];
    const out = [];
    const seen = new Set();
    const catMap = new Map(allCats.map((c) => [c.id, c]));
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
      if (out.length >= 6) break;
    }
    return out;
  }, [state.transactions, allCats, type]);

  // Effective category ID for saving
  const effectiveCatId = subCatId || mainCatId;

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return allCats.filter((c) => (c.name || "").toLowerCase().includes(q));
  }, [allCats, searchQuery]);

  // Default to first account
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  // Auto-focus amount on open
  useEffect(() => {
    if (isOpen) setTimeout(() => amountRef.current?.focus(), 200);
  }, [isOpen]);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setType("expense");
      setAmount("");
      setMainCatId("");
      setSubCatId("");
      setNote("");
      setSearchQuery("");
      setAccountId(accounts?.[0]?.id || "");
    }
  }, [isOpen, accounts]);

  // When main cat changes, reset sub
  useEffect(() => { setSubCatId(""); }, [mainCatId]);

  const handleSave = () => {
    const satang = parseMoneyToSatang(amount);
    if (!satang || satang <= 0) return;
    const cat = effectiveCatId || (type === "income" ? "other_income" : "other");
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
    setTimeout(() => store.startNewTransaction(), 150);
  };

  const handleQuickScan = () => {
    onClose();
    setTimeout(() => {
      store.startNewTransaction();
    }, 150);
  };

  if (!isOpen) return null;

  const selectedMain = mainCats.find((c) => c.id === mainCatId);

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />

      <div className="relative w-full max-w-md rounded-t-[28px] p-5 pb-safe animate-fade-in-up bg-white/95 backdrop-blur-2xl border-t border-white/40 shadow-[0_-20px_60px_rgba(0,0,0,0.15)] flex flex-col max-h-[90dvh]">
        {/* Drag handle */}
        <div className="flex justify-center mb-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header + Quick Scan */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h3 className="text-xl font-black text-gray-900 tracking-tight">บันทึกเร็ว</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleQuickScan}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-indigo-600/10 border border-indigo-600/15 text-indigo-700 text-xs font-extrabold active:scale-95 transition-all"
            >
              <Camera size={14} /> สแกน
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-2xl hover:bg-gray-100 active:scale-95 transition-all" aria-label="close">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 no-scrollbar pb-2">
          {/* Type toggle — pill style */}
          <div className="flex gap-1.5 p-1 rounded-2xl bg-gray-100 mb-5">
            {[
              { key: "expense", label: "รายจ่าย", color: "bg-rose-500 text-white shadow-sm" },
              { key: "income", label: "รายรับ", color: "bg-emerald-500 text-white shadow-sm" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setType(t.key); setMainCatId(""); setSubCatId(""); setSearchQuery(""); }}
                className={`flex-1 py-2 rounded-xl text-sm font-extrabold transition-all active:scale-[0.97] ${
                  type === t.key ? t.color : "text-gray-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Amount — large display */}
          <div className="mb-5">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-gray-400">฿</span>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                className="w-full pl-10 pr-4 py-4 rounded-2xl bg-gray-50 border border-gray-200 text-2xl font-black text-gray-900 tracking-tight text-right outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
              />
            </div>
          </div>

          {/* Note */}
          <div className="mb-5">
            <div className="relative">
              <FileText size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-bold text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
                placeholder="โน้ต (ไม่บังคับ)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
              />
            </div>
          </div>

          {/* Recent categories */}
          {recentCats.length > 0 && !mainCatId && !searchQuery && (
            <div className="mb-4">
              <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider mb-2">ล่าสุด</div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {recentCats.map((cat) => {
                  const isActive = effectiveCatId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        const parent = String(cat.parentId || "").trim();
                        if (parent) {
                          setMainCatId(parent);
                          setSubCatId(cat.id);
                        } else {
                          setMainCatId(cat.id);
                          setSubCatId("");
                        }
                      }}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-extrabold transition-all active:scale-95 ${
                        isActive
                          ? "bg-indigo-600/15 border-indigo-500/30 text-indigo-800 shadow-sm"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-base">{cat.icon || "🏷️"}</span>
                      <span className="truncate max-w-[70px]">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main categories */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                {mainCatId && selectedMain && !searchQuery ? (
                  <button type="button" onClick={() => { setMainCatId(""); setSubCatId(""); }} className="flex items-center gap-1 text-indigo-600 active:scale-95">
                    ← เลือกหมวดหลัก
                  </button>
                ) : (
                  "หมวดหมู่"
                )}
              </div>
              {!mainCatId && (
                <div className="relative w-32 sm:w-40">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหา..."
                    className="w-full pl-7 pr-2 py-1.5 rounded-xl bg-gray-100 border-none text-[11px] font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-400/20"
                  />
                </div>
              )}
            </div>

            {searchQuery ? (
              /* Search Results */
              <div className="max-h-[30vh] overflow-y-auto no-scrollbar">
                {searchResults.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {searchResults.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          const parent = String(cat.parentId || "").trim();
                          if (parent) {
                            setMainCatId(parent);
                            setSubCatId(cat.id);
                          } else {
                            setMainCatId(cat.id);
                            setSubCatId("");
                          }
                          setSearchQuery("");
                        }}
                        className={`flex flex-col items-center gap-1 p-2 rounded-2xl border transition-all active:scale-95 ${
                          effectiveCatId === cat.id ? "bg-indigo-600/10 border-indigo-500/20 text-indigo-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-lg">{cat.icon || "🏷️"}</span>
                        <span className="text-[10px] font-bold truncate w-full text-center">{cat.name}</span>
                        {cat.parentId && (
                          <span className="text-[9px] text-gray-400 truncate w-full text-center">
                            {mainCats.find((m) => m.id === cat.parentId)?.name || ""}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 text-center py-4">ไม่พบหมวดหมู่ที่ค้นหา</div>
                )}
              </div>
            ) : !mainCatId ? (
              /* All Main Categories Scrollable Grid */
              <div className="max-h-[30vh] overflow-y-auto no-scrollbar grid grid-cols-4 gap-2 pb-2">
                {mainCats.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setMainCatId(cat.id)}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    <span className="text-2xl">{cat.icon || "📦"}</span>
                    <span className="text-[10px] font-bold text-gray-700 truncate w-full text-center">{cat.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              /* Subcategory selection */
              <div>
                {/* Selected main */}
                <div className="flex items-center gap-2 mb-3 p-2.5 rounded-2xl bg-indigo-600/10 border border-indigo-500/20">
                  <span className="text-xl">{selectedMain?.icon || "📦"}</span>
                  <span className="text-sm font-extrabold text-indigo-800">{selectedMain?.name || ""}</span>
                  <Check size={14} className="ml-auto text-indigo-600" />
                </div>

                <div className="max-h-[30vh] overflow-y-auto no-scrollbar">
                  {subCats.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 pb-2">
                      {/* Use main category (no sub) */}
                      <button
                        type="button"
                        onClick={() => setSubCatId("")}
                        className={`flex flex-col items-center gap-1 p-2 rounded-2xl border transition-all active:scale-95 ${
                          !subCatId ? "bg-indigo-600/10 border-indigo-500/20 text-indigo-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-lg">{selectedMain?.icon || "📦"}</span>
                        <span className="text-[10px] font-bold truncate w-full text-center">ทั้งหมด</span>
                      </button>
                      {subCats.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSubCatId(cat.id)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-2xl border transition-all active:scale-95 ${
                            subCatId === cat.id ? "bg-indigo-600/10 border-indigo-500/20 text-indigo-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span className="text-lg">{cat.icon || "🏷️"}</span>
                          <span className="text-[10px] font-bold truncate w-full text-center">{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 text-center py-3">ไม่มีหมวดย่อย — จะใช้หมวดหลัก</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Account */}
          {accounts.length > 1 && (
            <div className="mb-2">
              <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider mb-2">บัญชี</div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccountId(a.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-extrabold transition-all active:scale-95 ${
                      accountId === a.id
                        ? "bg-indigo-600/10 border-indigo-500/20 text-indigo-800 shadow-sm"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-base">{a.icon || "💳"}</span> {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 shrink-0 pt-3 border-t border-gray-200/50 mt-1">
          <button
            type="button"
            onClick={handleOpenFull}
            className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            รายละเอียดเพิ่ม <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!parseMoneyToSatang(amount)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl text-sm font-extrabold transition-all active:scale-[0.98] ${
              parseMoneyToSatang(amount)
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <Check size={16} /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
