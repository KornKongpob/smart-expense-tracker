// src/components/QuickAddSheet.jsx
// Redesigned bottom-sheet for quick expense/income entry.
// Amount → Account → Category → Save.
// Includes Quick Scan shortcut and "รายละเอียดเพิ่ม" to open full form.

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { X, Check, ChevronRight, Camera, FileText, Search, ArrowRightLeft } from "lucide-react";
import { useAppStore } from "../store/store.jsx";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money";
import { formatCurrency, getCurrentLocalTimeHHmm, toISODate } from "../utils/format";
import { generateId } from "../utils/id";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

const EMPTY_CATEGORY_SELECTION = { mainCatId: "", subCatId: "" };

function visibleCategories(list = []) {
  return list.filter((c) => !(c?.deletedAt || c?.isDeleted));
}

function categorySelectionFrom(cat) {
  if (!cat?.id) return EMPTY_CATEGORY_SELECTION;
  const parent = String(cat.parentId || "").trim();
  return parent
    ? { mainCatId: parent, subCatId: cat.id }
    : { mainCatId: cat.id, subCatId: "" };
}

function recentCategoriesForType(transactions = [], categories = [], txType = "expense", limit = 6) {
  const out = [];
  const seen = new Set();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  for (let i = transactions.length - 1; i >= 0; i--) {
    const t = transactions[i];
    if (!t || t.isTransfer) continue;
    if (String(t.type || "").toLowerCase() !== txType) continue;
    const cid = String(t.categoryId || t.category || "").trim();
    if (!cid || seen.has(cid)) continue;
    const cat = catMap.get(cid);
    if (!cat) continue;
    seen.add(cid);
    out.push(cat);
    if (out.length >= limit) break;
  }

  return out;
}

function recentAccountForType(transactions = [], accounts = [], txType = "expense") {
  const accountIds = new Set(accounts.map((a) => String(a?.id || "")));

  for (let i = transactions.length - 1; i >= 0; i--) {
    const t = transactions[i];
    if (!t || t.isTransfer) continue;
    if (String(t.type || "").toLowerCase() !== txType) continue;
    const candidate = String(t.accountId || "").trim();
    if (candidate && accountIds.has(candidate)) return candidate;
  }

  return "";
}

function StepLabel({ number, children }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-50 text-[10px] text-indigo-700">{number}</span>
      <span>{children}</span>
    </div>
  );
}

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
  const wasOpenRef = useRef(false);

  const accounts = useMemo(() => state.accounts || [], [state.accounts]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [String(a?.id || ""), a])), [accounts]);
  const categoriesByType = useMemo(() => ({
    income: visibleCategories(state.categories?.income || []),
    expense: visibleCategories(state.categories?.expense || []),
  }), [state.categories]);

  const allCats = useMemo(() => {
    return type === "income" ? categoriesByType.income : categoriesByType.expense;
  }, [categoriesByType, type]);

  const defaultAccountByType = useMemo(() => ({
    expense: recentAccountForType(state.transactions || [], accounts, "expense") || accounts?.[0]?.id || "",
    income: recentAccountForType(state.transactions || [], accounts, "income") || accounts?.[0]?.id || "",
  }), [accounts, state.transactions]);

  const defaultCategoryByType = useMemo(() => ({
    expense: categorySelectionFrom(recentCategoriesForType(state.transactions || [], categoriesByType.expense, "expense", 1)[0]),
    income: categorySelectionFrom(recentCategoriesForType(state.transactions || [], categoriesByType.income, "income", 1)[0]),
  }), [categoriesByType, state.transactions]);

  // Main categories (no parent)
  const mainCats = useMemo(() => allCats.filter((c) => !String(c.parentId || "").trim()), [allCats]);

  // Sub categories for selected main
  const subCats = useMemo(() => {
    if (!mainCatId) return [];
    return allCats.filter((c) => String(c.parentId || "").trim() === mainCatId);
  }, [allCats, mainCatId]);

  // Recent categories from transaction history
  const recentCats = useMemo(() => {
    return recentCategoriesForType(state.transactions || [], allCats, type, 6);
  }, [state.transactions, allCats, type]);

  // Effective category ID for saving
  const effectiveCatId = subCatId || mainCatId;
  const parsedAmount = parseMoneyToSatang(amount);
  const selectedAccount = accountById.get(String(accountId || "")) || null;
  const selectedCategory = allCats.find((c) => String(c?.id || "") === String(effectiveCatId || "")) || null;
  const typeLabel = type === "income" ? "รายรับ" : "รายจ่าย";
  const summaryAmount = parsedAmount > 0 ? formatCurrency(parsedAmount) : "฿0.00";
  const summaryText = `${typeLabel} ${summaryAmount} • หมวด ${selectedCategory?.name || "ยังไม่เลือก"} • บัญชี ${selectedAccount?.name || "ยังไม่เลือก"}`;
  const saveDisabledReason = !parsedAmount || parsedAmount <= 0
    ? "กรอกยอดเงินก่อนบันทึก"
    : !accountId
      ? "เลือกบัญชีก่อนบันทึก"
      : !effectiveCatId
        ? "เลือกหมวดหมู่ก่อนบันทึก"
        : "";
  const canSave = !saveDisabledReason;

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return allCats.filter((c) => (c.name || "").toLowerCase().includes(q));
  }, [allCats, searchQuery]);

  const applyDefaultsForType = useCallback((txType) => {
    const selection = defaultCategoryByType[txType] || EMPTY_CATEGORY_SELECTION;
    setAccountId(defaultAccountByType[txType] || "");
    setMainCatId(selection.mainCatId);
    setSubCatId(selection.subCatId);
  }, [defaultAccountByType, defaultCategoryByType]);

  // Default to the most recently used account for this transaction type.
  useEffect(() => {
    if (!accountId && defaultAccountByType[type]) setAccountId(defaultAccountByType[type]);
  }, [accountId, defaultAccountByType, type]);

  // Auto-focus amount on open
  useEffect(() => {
    if (isOpen) setTimeout(() => amountRef.current?.focus(), 200);
  }, [isOpen]);

  // Reset form when opening
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setType("expense");
    setAmount("");
    setNote("");
    setSearchQuery("");
    applyDefaultsForType("expense");
  }, [isOpen, applyDefaultsForType]);

  const handleSave = () => {
    if (!canSave) return;
    const satang = parsedAmount;
    const cat = effectiveCatId;
    const acc = accountId;
    const now = Date.now();
    store.upsertTransaction({
      id: generateId(),
      type,
      amount: satang,
      category: cat,
      accountId: acc,
      date: toISODate(new Date()),
      time: getCurrentLocalTimeHHmm(),
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
    setTimeout(() => store.startNewTransaction({ entryMode: "manual" }), 150);
  };

  const handleQuickScan = () => {
    onClose();
    setTimeout(() => {
      store.startNewTransaction({ entryMode: "scan", scanUploadKind: "receipt" });
    }, 150);
  };

  const handleQuickTransfer = () => {
    onClose();
    setTimeout(() => {
      store.startNewTransaction({ entryMode: "manual", txType: "transfer" });
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
          <h3 className="text-xl font-semibold text-gray-900 tracking-tight">บันทึกเร็ว</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleQuickScan}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-indigo-600/10 border border-indigo-600/15 text-indigo-700 text-xs font-semibold active:scale-95 transition-all"
            >
              <Camera size={14} /> สแกน
            </button>
            <button
              type="button"
              onClick={handleQuickTransfer}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold active:scale-95 transition-all"
            >
              <ArrowRightLeft size={14} /> Transfer
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-2xl hover:bg-gray-100 active:scale-95 transition-all" aria-label="close">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 no-scrollbar pb-2">
          {/* Type toggle — pill style */}
          <div className="flex gap-1.5 p-1 rounded-2xl bg-gray-100 mb-4">
            {[
              { key: "expense", label: "รายจ่าย", color: "bg-rose-500 text-white shadow-sm" },
              { key: "income", label: "รายรับ", color: "bg-emerald-500 text-white shadow-sm" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setType(t.key);
                  setSearchQuery("");
                  applyDefaultsForType(t.key);
                }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] ${
                  type === t.key ? t.color : "text-gray-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Amount — large display */}
          <div className="mb-4">
            <StepLabel number="1">ยอดเงิน</StepLabel>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-gray-400">฿</span>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                className="w-full pl-10 pr-4 py-4 rounded-2xl bg-gray-50 border border-gray-200 text-2xl font-semibold text-gray-900 tracking-tight text-right outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
              />
            </div>
          </div>

          {/* Account */}
          <div className="mb-4">
            <StepLabel number="2">บัญชี</StepLabel>
            {accounts.length ? (
              <div className="flex gap-2 overflow-x-auto no-scrollbar touch-pan-x-scroll">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccountId(a.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border text-xs font-semibold transition-all active:scale-95 ${
                      accountId === a.id
                        ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-800 shadow-sm"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-base">{a.icon || "💳"}</span> {a.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                เพิ่มบัญชีก่อนบันทึกรายการ
              </div>
            )}
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

          <StepLabel number="3">หมวดหมู่</StepLabel>

          {/* Recent categories */}
          {recentCats.length > 0 && !mainCatId && !searchQuery && (
            <div className="mb-4">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">ใช้บ่อย/ล่าสุด</div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 touch-pan-x-scroll">
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
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-semibold transition-all active:scale-95 ${
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
          <div className="mb-2">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {mainCatId && selectedMain && !searchQuery ? (
                  <button type="button" onClick={() => { setMainCatId(""); setSubCatId(""); }} className="flex items-center gap-1 text-indigo-600 active:scale-95 px-2 py-1 bg-indigo-50 rounded-lg">
                    ← เลือกหมวดหลัก
                  </button>
                ) : (
                  "หมวดหมู่"
                )}
              </div>
              {!mainCatId && (
                <div className="relative w-[160px] sm:w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาหมวดหมู่..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-gray-100 border border-transparent text-xs font-bold text-gray-900 outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10 transition-all"
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
                    onClick={() => {
                      setMainCatId(cat.id);
                      setSubCatId("");
                    }}
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
                  <span className="text-sm font-semibold text-indigo-800">{selectedMain?.name || ""}</span>
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
        </div>

        {/* Actions */}
        <div className="shrink-0 pt-3 border-t border-gray-200/50 mt-1">
          <StepLabel number="4">บันทึก</StepLabel>
          <div className="mb-2 rounded-2xl bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">
            {summaryText}
          </div>
          {saveDisabledReason ? (
            <div className="mb-2 text-xs font-semibold text-amber-700">{saveDisabledReason}</div>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleOpenFull}
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              รายละเอียดเพิ่ม <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] ${
                canSave
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Check size={16} /> บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
