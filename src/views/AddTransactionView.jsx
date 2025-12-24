// src/views/AddTransactionView.jsx
import React, { useMemo, useRef, useState } from "react";
import { X, Trash2, Calendar, FileText, Camera, Loader, Eye, Edit2, Plus, Check, AlertTriangle, ArrowRightLeft, Trash, Sparkles, Wand2 } from "lucide-react";

import { useAppStore } from "../store/store";
import AmountField from "../components/AmountField";
import { scanReceiptOpenAI } from "../services/scanOpenAI";
import { formatCurrency, toISODate } from "../utils/format";
import { generateId, generateTransferId } from "../utils/id";
import { isDuplicateByRef, toMonthKey, calcSpentByCategoryInMonth, getBudget } from "../store/selectors";

import { EMOJI_PRESETS, PRESET_COLORS } from "../constants/presets.jsx";

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-sm glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Collect possible digit strings from an account object (robust across different field names). */
function getAccountDigitCandidates(acc) {
  const fields = [
    acc?.accountNumber,
    acc?.accountNo,
    acc?.number,
    acc?.no,
    acc?.last4,
    acc?.lastDigits,
    acc?.digits,
    acc?.ref,
    acc?.note,
    acc?.name,
  ];

  const out = [];
  for (const f of fields) {
    const d = digitsOnly(f);
    if (d && d.length >= 3) out.push(d);
  }
  return Array.from(new Set(out));
}

/** Score by suffix match length (>=3). Bigger is better. */
function suffixMatchScore(aDigits, targetDigits) {
  const a = digitsOnly(aDigits);
  const t = digitsOnly(targetDigits);
  if (!a || !t) return 0;

  const maxK = Math.min(a.length, t.length, 12);
  for (let k = maxK; k >= 3; k--) {
    const aSuf = a.slice(-k);
    const tSuf = t.slice(-k);
    if (aSuf === tSuf) return k;
  }

  if (a.endsWith(t)) return Math.min(12, t.length);
  if (t.endsWith(a)) return Math.min(12, a.length);

  return 0;
}

function bestMatchAccountId(accounts, digits) {
  const d = digitsOnly(digits);
  if (!d || d.length < 3) return "";

  let best = { id: "", score: 0 };

  for (const acc of accounts || []) {
    const candidates = getAccountDigitCandidates(acc);
    for (const cand of candidates) {
      const score = suffixMatchScore(cand, d);
      if (score > best.score) best = { id: acc.id, score };
    }
  }

  return best.id;
}

// ---------- Keyword matching ----------
const normKw = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");

function buildScanTextForMatching(result) {
  const parts = [];
  if (result?.merchant) parts.push(String(result.merchant));
  if (result?.note) parts.push(String(result.note));
  if (result?.category) parts.push(String(result.category));
  if (result?.evidence) parts.push(String(result.evidence));
  if (Array.isArray(result?.keywords)) parts.push(result.keywords.join(" "));
  if (Array.isArray(result?.items)) parts.push(result.items.map((it) => it?.name).filter(Boolean).join(" "));
  return normKw(parts.join(" "));
}

function pickCategoryByKeywords({ cats, scanText }) {
  const text = normKw(scanText);
  if (!text) return { catId: "", hits: [] };

  let best = { id: "", score: 0, hits: [] };

  for (const c of cats || []) {
    const kws = (c.keywords || []).map(normKw).filter(Boolean);
    if (!kws.length) continue;

    let score = 0;
    const hits = [];
    for (const kw of kws) {
      if (!kw) continue;
      if (text.includes(kw)) {
        score += Math.min(10, Math.max(2, kw.length));
        hits.push(kw);
      }
    }

    if (score > best.score) best = { id: c.id, score, hits };
  }

  return { catId: best.id, hits: best.hits };
}

export default function AddTransactionView({ showAlert, showConfirm }) {
  const store = useAppStore();
  const {
    state,
    navigate,
    upsertTransaction,
    bulkUpsertTransactions,
    deleteTransaction,
    addCategory,
  } = store;

  const initialData = store.getEditingTransaction?.();
  const isEditMode = !!initialData;

  const accounts = state.accounts || [];
  const categories = state.categories || { expense: [], income: [] };
  const expenseCats = categories.expense || [];
  const incomeCats = categories.income || [];

  const transferPair = useMemo(() => {
    if (!initialData?.isTransfer || !initialData?.transferId) return null;
    const all = (state.transactions || []).filter((t) => t.transferId === initialData.transferId);
    const outTx = all.find((t) => t.type === "expense");
    const inTx = all.find((t) => t.type === "income");
    if (!outTx || !inTx) return null;
    return { outTx, inTx };
  }, [initialData?.isTransfer, initialData?.transferId, state.transactions]);

  const [entryMode, setEntryMode] = useState(isEditMode ? "manual" : "scan"); // scan | manual

  const initialType = initialData?.isTransfer ? "transfer" : initialData?.type || "expense";
  const [type, setType] = useState(initialType); // expense | income | transfer

  const [amountDigits, setAmountDigits] = useState(() => {
    const n = transferPair?.outTx?.amount ?? initialData?.amount ?? 0;
    return n ? String(Math.round(Math.abs(n))) : "";
  });

  const [categoryId, setCategoryId] = useState(() => {
    if (initialData?.isTransfer) return "transfer";
    return initialData?.category || "";
  });

  const [accountId, setAccountId] = useState(initialData?.accountId || accounts?.[0]?.id || "");
  const [fromAccountId, setFromAccountId] = useState(transferPair?.outTx?.accountId || accounts?.[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(transferPair?.inTx?.accountId || accounts?.[0]?.id || "");

  const [date, setDate] = useState(initialData?.date ? String(initialData.date).slice(0, 10) : toISODate(new Date()));
  const [note, setNote] = useState(initialData?.note || "");
  const [ref, setRef] = useState(initialData?.ref || "");

  const amountNumber = useMemo(() => Number(digitsOnly(amountDigits || "0")) || 0, [amountDigits]);

  const monthKey = useMemo(() => toMonthKey(date), [date]);
  const spentMap = useMemo(() => calcSpentByCategoryInMonth(state.transactions || [], monthKey), [state.transactions, monthKey]);

  const budgetHint = useMemo(() => {
    if (type !== "expense") return "";
    if (!categoryId) return "";
    const b = getBudget(state.budgets || [], monthKey, categoryId);
    if (!b || !b.limit) return "";
    const spent = spentMap.get(categoryId) || 0;
    const next = spent + amountNumber;
    const pct = Math.round((next / b.limit) * 100);
    if (pct >= (b.alertPct || 90)) return `⚠️ งบ ${formatCurrency(b.limit)} • ใช้แล้ว ${formatCurrency(next)} (${pct}%)`;
    return `งบ ${formatCurrency(b.limit)} • ใช้แล้ว ${formatCurrency(next)} (${pct}%)`;
  }, [type, categoryId, state.budgets, monthKey, spentMap, amountNumber]);

  const fileInputRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [queue, setQueue] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  // ===== Create category modal (scan) =====
  const [createCatOpen, setCreateCatOpen] = useState(false);
  const [createCatType, setCreateCatType] = useState("expense"); // expense|income
  const [createCatTargetQueueId, setCreateCatTargetQueueId] = useState("");
  const [createCatName, setCreateCatName] = useState("");
  const [createCatIcon, setCreateCatIcon] = useState("🏷️");
  const [createCatColor, setCreateCatColor] = useState(PRESET_COLORS?.[0] || "#6366f1");

  const existingRefSet = useMemo(() => {
    const set = new Set();
    for (const t of state.transactions || []) {
      const r = String(t.ref || "").trim();
      if (r) set.add(r);
    }
    return set;
  }, [state.transactions]);

  const cleanupQueuePreviews = () => {
    for (const it of queue) {
      if (it.previewUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch {}
      }
    }
  };

  const clearQueue = () => {
    cleanupQueuePreviews();
    setQueue([]);
    setExpandedId(null);
    setScanStatus("");
  };

  const updateQueueItem = (id, patch) => {
    setQueue((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removeQueueItem = (id) => {
    setQueue((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.previewUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch {}
      }
      return prev.filter((x) => x.id !== id);
    });
    if (expandedId === id) setExpandedId(null);
  };

  const handlePickFiles = () => fileInputRef.current?.click();

  const applyQueueTypeChange = (qid, nextType) => {
    setQueue((prev) =>
      prev.map((q) => {
        if (q.id !== qid) return q;

        const txType = nextType;

        if (txType !== "transfer") {
          const list = txType === "income" ? incomeCats : expenseCats;
          const safeCat = list.some((c) => c.id === q.categoryId) ? q.categoryId : "";
          const safeAcc = accounts.some((a) => a.id === q.accountId) ? q.accountId : accounts?.[0]?.id || "";
          return { ...q, txType, categoryId: safeCat, accountId: safeAcc };
        }

        const fromId = accounts.some((a) => a.id === q.fromAccountId) ? q.fromAccountId : accounts?.[0]?.id || "";
        const toId = accounts.some((a) => a.id === q.toAccountId) ? q.toAccountId : accounts?.[0]?.id || "";
        return { ...q, txType: "transfer", fromAccountId: fromId, toAccountId: toId };
      })
    );
  };

  const openCreateCategoryFromScan = ({ queueId, txType }) => {
    const t = txType === "income" ? "income" : "expense";
    setCreateCatTargetQueueId(queueId);
    setCreateCatType(t);
    setCreateCatName("");
    setCreateCatIcon("🏷️");
    setCreateCatColor(PRESET_COLORS?.[0] || "#6366f1");
    setCreateCatOpen(true);
  };

  const doCreateCategory = () => {
    const name = String(createCatName || "").trim();
    if (!name) return showAlert?.("กรุณาใส่ชื่อหมวดหมู่");

    const cats = createCatType === "income" ? incomeCats : expenseCats;

    let base = slugify(name);
    if (!base) base = `cat_${Date.now()}`;

    let id = base;
    let i = 2;
    while (cats.some((c) => c.id === id)) id = `${base}_${i++}`;

    addCategory?.({
      type: createCatType,
      category: { id, name, icon: createCatIcon, color: createCatColor },
    });

    // ✅ apply to the scan queue item (and align txType with the created category type)
    if (createCatTargetQueueId) {
      setQueue((prev) =>
        prev.map((q) => {
          if (q.id !== createCatTargetQueueId) return q;
          if (q.txType === "transfer") return q; // ignore transfer
          return {
            ...q,
            txType: createCatType,
            categoryId: id,
          };
        })
      );
    }

    setCreateCatOpen(false);
    showAlert?.("สร้างหมวดหมู่ใหม่แล้ว");
  };

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";

    if (!files.length) {
      showAlert?.("ไม่พบรูปที่เลือก");
      return;
    }

    setEntryMode("scan");
    setIsScanning(true);
    setScanStatus("เตรียมสแกน...");

    const batchRefSet = new Set(existingRefSet);

    try {
      for (const file of files) {
        const qid = generateId();
        const previewUrl = URL.createObjectURL(file);

        setQueue((prev) => [
          ...prev,
          {
            id: qid,
            fileName: file.name,
            previewUrl,
            status: "scanning",
            error: "",
            txType: "expense",
            amount: null,
            date: toISODate(new Date()),
            note: "",
            ref: "",
            categoryId: "",
            accountId: accounts?.[0]?.id || "",
            fromAccountId: accounts?.[0]?.id || "",
            toAccountId: accounts?.[0]?.id || "",
            duplicate: false,
            includeDuplicate: true,
            evidence: "",
            scanText: "",
            keywordMatch: { catId: "", hits: [] },
          },
        ]);

        try {
          setScanStatus(`กำลังอ่าน: ${file.name}`);
          const result = await scanReceiptOpenAI(file, {
            onStatus: (s) => setScanStatus(s || `กำลังอ่าน: ${file.name}`),
          });

          const txType =
            result?.tx_type === "transfer" ? "transfer" : result?.tx_type === "income" ? "income" : "expense";

          const amount =
            typeof result?.amount === "number" ? result.amount : result?.amount != null ? Number(result.amount) : null;
          const d = result?.date ? String(result.date).slice(0, 10) : toISODate(new Date());

          const mergedNote = String(result?.note || result?.merchant || "").trim();
          const rref = String(result?.ref || "").trim();

          const fromDigits = digitsOnly(result?.from_account);
          const toDigits = digitsOnly(result?.to_account);

          let detectedAccountId = "";
          let detectedFromId = "";
          let detectedToId = "";

          if (txType === "transfer") {
            detectedFromId = bestMatchAccountId(accounts, fromDigits) || accounts?.[0]?.id || "";
            detectedToId = bestMatchAccountId(accounts, toDigits) || accounts?.[0]?.id || "";
          } else {
            detectedAccountId =
              bestMatchAccountId(accounts, fromDigits) ||
              bestMatchAccountId(accounts, toDigits) ||
              accounts?.[0]?.id ||
              "";
          }

          const scanText = buildScanTextForMatching(result);

          let detectedCategoryId = "";
          let keywordMatch = { catId: "", hits: [] };

          if (txType === "expense") {
            keywordMatch = pickCategoryByKeywords({ cats: expenseCats, scanText });
            if (keywordMatch.catId) detectedCategoryId = keywordMatch.catId;
          }
          if (txType === "income") {
            keywordMatch = pickCategoryByKeywords({ cats: incomeCats, scanText });
            if (keywordMatch.catId) detectedCategoryId = keywordMatch.catId;
          }

          const dup = rref ? batchRefSet.has(rref) || isDuplicateByRef(state.transactions || [], rref) : false;
          if (rref) batchRefSet.add(rref);

          updateQueueItem(qid, {
            status: "ready",
            txType,
            amount: Number.isFinite(amount) ? amount : null,
            date: d,
            note: mergedNote,
            ref: rref,
            categoryId: detectedCategoryId,
            accountId: detectedAccountId || (accounts?.[0]?.id || ""),
            fromAccountId: detectedFromId || (accounts?.[0]?.id || ""),
            toAccountId: detectedToId || (accounts?.[0]?.id || ""),
            duplicate: dup,
            includeDuplicate: !dup,
            evidence: String(result?.evidence || "").slice(0, 200),
            scanText,
            keywordMatch,
            error: "",
          });
        } catch (err) {
          const msg = String(err?.message || err);
          updateQueueItem(qid, { status: "error", error: msg || "scan_failed" });
        }
      }
    } finally {
      setIsScanning(false);
      setScanStatus("");
    }
  };

  const canCreateFromQueue = useMemo(() => {
    const valid = queue.filter((q) => {
      if (q.status !== "ready") return false;
      if (!q.amount || q.amount <= 0) return false;
      if (!q.includeDuplicate) return false;

      if (q.txType === "transfer") return !!q.fromAccountId && !!q.toAccountId && q.fromAccountId !== q.toAccountId;
      return !!q.accountId && !!q.categoryId;
    });
    return valid.length > 0;
  }, [queue]);

  const createTransactionsFromQueue = () => {
    const ready = queue.filter((q) => q.status === "ready" && q.amount && q.amount > 0 && q.includeDuplicate);

    if (!ready.length) {
      showAlert?.("ไม่มีรายการที่พร้อมสร้าง (หรือถูกติ๊กว่าเป็นรายการซ้ำ)");
      return;
    }

    for (const q of ready) {
      if (q.txType === "transfer") {
        if (!q.fromAccountId || !q.toAccountId) return showAlert?.("Transfer ต้องเลือกบัญชีต้นทาง/ปลายทาง");
        if (q.fromAccountId === q.toAccountId) return showAlert?.("Transfer ห้ามเลือกบัญชีต้นทางและปลายทางเป็นบัญชีเดียวกัน");
      } else {
        if (!q.accountId) return showAlert?.("กรุณาเลือกบัญชีให้ครบ");
        if (!q.categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่ให้ครบ");
      }
    }

    const txs = [];
    for (const q of ready) {
      const d = String(q.date || toISODate(new Date())).slice(0, 10);
      const noteText = String(q.note || "").trim();

      if (q.txType === "transfer") {
        const transferId = generateTransferId();

        txs.push({
          id: generateId(),
          type: "expense",
          amount: Number(q.amount),
          category: "transfer",
          accountId: q.fromAccountId,
          date: d,
          note: noteText || "Transfer",
          isTransfer: true,
          transferId,
          ref: q.ref || null,
          source: "scan",
        });

        txs.push({
          id: generateId(),
          type: "income",
          amount: Number(q.amount),
          category: "transfer",
          accountId: q.toAccountId,
          date: d,
          note: noteText || "Transfer",
          isTransfer: true,
          transferId,
          ref: q.ref || null,
          source: "scan",
        });
      } else {
        txs.push({
          id: generateId(),
          type: q.txType === "income" ? "income" : "expense",
          amount: Number(q.amount),
          category: q.categoryId,
          accountId: q.accountId,
          date: d,
          note: noteText || "Scan",
          isTransfer: false,
          transferId: null,
          ref: q.ref || null,
          source: "scan",
        });
      }
    }

    bulkUpsertTransactions(txs);
    clearQueue();
  };

  const handleSaveManual = () => {
    if (!amountNumber || amountNumber <= 0) return showAlert?.("กรุณาระบุจำนวนเงินให้ถูกต้อง");

    const d = String(date || toISODate(new Date())).slice(0, 10);
    const noteText = String(note || "").trim();

    if (type === "transfer") {
      if (!fromAccountId || !toAccountId) return showAlert?.("กรุณาเลือกบัญชีต้นทางและปลายทาง");
      if (fromAccountId === toAccountId) return showAlert?.("บัญชีต้นทาง/ปลายทางต้องไม่ใช่บัญชีเดียวกัน");

      const transferId = transferPair?.outTx?.transferId || generateTransferId();
      const outId = transferPair?.outTx?.id || generateId();
      const inId = transferPair?.inTx?.id || generateId();

      bulkUpsertTransactions([
        {
          id: outId,
          type: "expense",
          amount: amountNumber,
          category: "transfer",
          accountId: fromAccountId,
          date: d,
          note: noteText || "Transfer",
          isTransfer: true,
          transferId,
          ref: String(ref || "").trim() || null,
          source: "transfer",
        },
        {
          id: inId,
          type: "income",
          amount: amountNumber,
          category: "transfer",
          accountId: toAccountId,
          date: d,
          note: noteText || "Transfer",
          isTransfer: true,
          transferId,
          ref: String(ref || "").trim() || null,
          source: "transfer",
        },
      ]);
      return;
    }

    if (!categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");

    upsertTransaction({
      id: initialData?.id,
      type: type === "income" ? "income" : "expense",
      amount: amountNumber,
      category: categoryId,
      accountId,
      date: d,
      note: noteText,
      isTransfer: false,
      transferId: null,
      ref: String(ref || "").trim() || null,
      source: "manual",
    });
  };

  const handleDelete = () => {
    if (!initialData?.id) return;

    if (initialData.isTransfer && transferPair) {
      showConfirm?.(
        "ลบ Transfer",
        "ต้องการลบ Transfer นี้ใช่ไหม? (จะลบทั้งขาออก/ขาเข้า)",
        () => {
          deleteTransaction(transferPair.outTx.id);
          deleteTransaction(transferPair.inTx.id);
        },
        true
      );
      return;
    }

    showConfirm?.("ลบรายการ", "ต้องการลบรายการนี้ใช่ไหม?", () => deleteTransaction(initialData.id), true);
  };

  const handleClose = () => {
    if (!isEditMode && queue.length) {
      showConfirm?.(
        "ทิ้งคิวสแกน?",
        "คุณมีรายการในคิวที่ยังไม่สร้าง ต้องการทิ้งทั้งหมดหรือไม่?",
        () => {
          clearQueue();
          navigate("dashboard");
        },
        true
      );
      return;
    }
    navigate("dashboard");
  };

  const renderAccountSelect = (value, onChange) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full glass-input rounded-2xl px-4 py-3 outline-none focus:border-gray-900 text-sm font-extrabold text-gray-900 bg-white/30"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.icon} {a.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-full glass-icon-btn flex items-center justify-center text-gray-800 active:scale-95 leading-none"
          type="button"
          aria-label="close"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-extrabold text-gray-900">
          {isEditMode ? (initialData.isTransfer ? "แก้ไข Transfer" : "แก้ไขรายการ") : "เพิ่มรายการ"}
        </h2>

        {isEditMode ? (
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/15 flex items-center justify-center text-red-700 active:scale-95 leading-none"
            type="button"
            aria-label="delete"
          >
            <Trash2 size={20} />
          </button>
        ) : (
          <button
            onClick={clearQueue}
            className={`w-10 h-10 rounded-full flex items-center justify-center leading-none active:scale-95 transition-all ${
              queue.length ? "bg-gray-900/90 text-white shadow-lg" : "glass-icon-btn text-gray-400 opacity-60"
            }`}
            type="button"
            title="ล้างคิว"
            aria-label="ล้างคิว"
            disabled={!queue.length}
          >
            <Trash size={18} />
          </button>
        )}
      </div>

      {/* Mode Tabs (new only) */}
      {!isEditMode ? (
        <div className="glass-panel border border-white/20 p-1.5 rounded-2xl flex mb-5">
          <button
            onClick={() => setEntryMode("scan")}
            className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition-all ${
              entryMode === "scan" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-800/60 hover:bg-white/10"
            }`}
            type="button"
          >
            สแกนหลายรูป
          </button>
          <button
            onClick={() => setEntryMode("manual")}
            className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition-all ${
              entryMode === "manual" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-800/60 hover:bg-white/10"
            }`}
            type="button"
          >
            กรอกเอง
          </button>
        </div>
      ) : null}

      {/* ===== SCAN MODE ===== */}
      {!isEditMode && entryMode === "scan" ? (
        <>
          <div className="glass-card rounded-3xl p-5 mb-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-600" />
                  Scan ใบเสร็จ / Slip
                </div>
              </div>

              <button
                type="button"
                onClick={handlePickFiles}
                className="px-4 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold text-sm active:scale-95 disabled:opacity-60"
                disabled={isScanning}
              >
                <span className="inline-flex items-center gap-2">
                  {isScanning ? <Loader size={18} className="animate-spin" /> : <Camera size={18} />}
                  เลือกรูป
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
                disabled={isScanning}
              />
            </div>

            {isScanning || scanStatus ? (
              <div className="mt-4 glass-panel border border-white/20 rounded-2xl p-3 text-sm text-gray-900 flex items-center gap-2">
                <Loader size={16} className="animate-spin text-gray-900" />
                <span className="truncate">{scanStatus || "กำลังสแกน..."}</span>
              </div>
            ) : null}
          </div>

          {/* Queue */}
          {queue.length ? (
            <div className="mb-28">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-gray-900">
                  Review Queue <span className="text-gray-800/50">({queue.length})</span>
                </h3>

                <button
                  type="button"
                  onClick={createTransactionsFromQueue}
                  className={`px-4 py-2 rounded-xl font-extrabold text-sm active:scale-95 ${
                    canCreateFromQueue ? "bg-indigo-600 text-white" : "bg-white/30 text-gray-700/60 border border-white/20"
                  }`}
                  disabled={!canCreateFromQueue}
                >
                  สร้างรายการ
                </button>
              </div>

              <div className="space-y-3">
                {queue.map((q) => {
                  const isOpen = expandedId === q.id;
                  const badge = q.txType === "transfer" ? "Transfer" : q.txType === "income" ? "Income" : "Expense";

                  const needCategory = q.txType !== "transfer" && !q.categoryId;

                  return (
                    <div key={q.id} className="glass-card rounded-3xl overflow-hidden">
                      <div className="p-4 flex gap-3">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/15 bg-white/20 shrink-0">
                          {q.previewUrl ? <img src={q.previewUrl} alt="preview" className="w-full h-full object-cover" /> : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-white/30 text-gray-900 border border-white/15">
                              {badge}
                            </span>

                            {q.status === "scanning" ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-indigo-500/15 text-indigo-700 border border-indigo-500/20">
                                Scanning...
                              </span>
                            ) : null}

                            {q.status === "error" ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-red-500/10 text-red-700 border border-red-500/15">
                                Error
                              </span>
                            ) : null}

                            {q.duplicate ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-amber-500/15 text-amber-800 inline-flex items-center gap-1 border border-amber-500/20">
                                <AlertTriangle size={12} /> Duplicate Ref
                              </span>
                            ) : null}

                            {q.keywordMatch?.catId ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-800 inline-flex items-center gap-1 border border-emerald-500/20">
                                <Wand2 size={12} /> Auto
                              </span>
                            ) : null}

                            {needCategory ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-rose-500/10 text-rose-700 border border-rose-500/15">
                                ต้องเลือกหมวด
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-sm font-extrabold text-gray-900 truncate">
                            {q.amount ? formatCurrency(q.amount) : q.status === "error" ? "สแกนไม่สำเร็จ" : "กำลังประมวลผล..."}
                          </div>

                          <div className="mt-1 text-xs text-gray-800/60 truncate">
                            {q.note || q.fileName}
                            {q.ref ? <span className="ml-2 text-gray-800/50">• Ref {q.ref}</span> : null}
                          </div>

                          {q.status === "error" ? (
                            <div className="mt-2 text-xs text-red-700 break-words">{q.error}</div>
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedId((v) => (v === q.id ? null : q.id))}
                            className="w-10 h-10 rounded-full glass-icon-btn text-gray-900 flex items-center justify-center active:scale-95 leading-none disabled:opacity-50"
                            title="แก้ไข"
                            disabled={q.status !== "ready"}
                          >
                            <Edit2 size={18} />
                          </button>

                          <button
                            type="button"
                            onClick={() => removeQueueItem(q.id)}
                            className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/15 text-red-700 flex items-center justify-center active:scale-95 leading-none"
                            title="ลบจากคิว"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      {/* Expand */}
                      {isOpen && q.status === "ready" ? (
                        <div className="p-4 border-t border-white/15 bg-white/10">
                          {q.duplicate ? (
                            <div className="glass-panel border border-amber-500/20 rounded-2xl p-3 mb-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-amber-800">พบ Ref ซ้ำ</div>
                                <div className="text-[12px] text-amber-800/80">สามารถเปิดเพื่อบันทึกซ้ำได้</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => updateQueueItem(q.id, { includeDuplicate: !q.includeDuplicate })}
                                className={`w-14 h-8 rounded-full transition-all relative border ${
                                  q.includeDuplicate ? "bg-gray-900/90 border-white/20" : "bg-white/20 border-white/20"
                                }`}
                              >
                                <span
                                  className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                                    q.includeDuplicate ? "left-7" : "left-1"
                                  }`}
                                />
                              </button>
                            </div>
                          ) : null}

                          <div className="glass-panel border border-white/20 rounded-2xl p-3 mb-3">
                            <div className="text-xs font-bold text-gray-900/70 mb-2">ประเภท Transaction</div>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { id: "expense", label: "Expense" },
                                { id: "income", label: "Income" },
                                { id: "transfer", label: "Transfer" },
                              ].map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => applyQueueTypeChange(q.id, t.id)}
                                  className={`py-2 rounded-xl text-xs font-extrabold transition-all border ${
                                    q.txType === t.id
                                      ? "bg-gray-900/90 text-white border-white/10"
                                      : "bg-white/20 text-gray-900 border-white/15 hover:bg-white/25"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="glass-panel border border-white/20 rounded-2xl p-3">
                              <div className="text-xs font-bold text-gray-900/70 mb-1">จำนวนเงิน</div>
                              <input
                                type="number"
                                value={q.amount ?? ""}
                                onChange={(e) => updateQueueItem(q.id, { amount: Number(e.target.value || 0) })}
                                className="w-full outline-none text-lg font-extrabold text-gray-900 bg-transparent"
                                placeholder="0"
                              />
                            </div>

                            <div className="glass-panel border border-white/20 rounded-2xl p-3">
                              <div className="text-xs font-bold text-gray-900/70 mb-1">วันที่</div>
                              <input
                                type="date"
                                value={q.date || toISODate(new Date())}
                                onChange={(e) => updateQueueItem(q.id, { date: e.target.value })}
                                className="w-full outline-none text-sm font-extrabold text-gray-900 bg-transparent"
                              />
                            </div>
                          </div>

                          <div className="mt-3 glass-panel border border-white/20 rounded-2xl p-3">
                            <div className="text-xs font-bold text-gray-900/70 mb-1">โน้ต</div>
                            <input
                              value={q.note || ""}
                              onChange={(e) => updateQueueItem(q.id, { note: e.target.value })}
                              className="w-full outline-none text-sm font-extrabold text-gray-900 bg-transparent"
                              placeholder="เช่น ร้าน, รายละเอียด"
                            />
                          </div>

                          <div className="mt-3 glass-panel border border-white/20 rounded-2xl p-3">
                            <div className="text-xs font-bold text-gray-900/70 mb-1">Ref (ถ้ามี)</div>
                            <input
                              value={q.ref || ""}
                              onChange={(e) => updateQueueItem(q.id, { ref: e.target.value })}
                              className="w-full outline-none text-sm font-extrabold text-gray-900 bg-transparent"
                              placeholder="Ref / TRX / เลขที่รายการ"
                            />
                          </div>

                          <div className="mt-3">
                            {q.txType === "transfer" ? (
                              <div className="grid grid-cols-1 gap-3">
                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
                                    <ArrowRightLeft size={14} /> บัญชีต้นทาง
                                  </div>
                                  {renderAccountSelect(q.fromAccountId, (v) => updateQueueItem(q.id, { fromAccountId: v }))}
                                </div>

                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
                                    <ArrowRightLeft size={14} /> บัญชีปลายทาง
                                  </div>
                                  {renderAccountSelect(q.toAccountId, (v) => updateQueueItem(q.id, { toAccountId: v }))}
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-3">
                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="text-xs font-bold text-gray-900/70 mb-2">บัญชี</div>
                                  {renderAccountSelect(q.accountId, (v) => updateQueueItem(q.id, { accountId: v }))}
                                </div>

                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-bold text-gray-900/70">หมวดหมู่</div>
                                    <button
                                      type="button"
                                      onClick={() => openCreateCategoryFromScan({ queueId: q.id, txType: q.txType })}
                                      className="text-xs font-extrabold text-indigo-700 glass-chip px-3 py-1 rounded-full active:scale-95"
                                    >
                                      <Plus size={14} className="inline-block -mt-0.5 mr-1" />
                                      สร้างหมวดใหม่
                                    </button>
                                  </div>

                                  <select
                                    value={q.categoryId || ""}
                                    onChange={(e) => updateQueueItem(q.id, { categoryId: e.target.value })}
                                    className="w-full glass-input rounded-2xl px-4 py-3 bg-white/30 outline-none focus:border-gray-900 text-sm font-extrabold text-gray-900"
                                  >
                                    <option value="" disabled>
                                      เลือกหมวดหมู่
                                    </option>
                                    {(q.txType === "income" ? incomeCats : expenseCats).map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.icon} {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-14 glass-card rounded-3xl border border-white/15">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-500">
                <Camera size={32} />
              </div>
              <p className="text-gray-900 font-extrabold">ยังไม่มีรูปในคิว</p>
              <p className="text-gray-900/60 text-sm mt-1">กด “เลือกรูป” เพื่อเริ่มสแกน</p>
            </div>
          )}
        </>
      ) : null}

      {/* ===== MANUAL MODE / EDIT MODE ===== */}
      {entryMode === "manual" || isEditMode ? (
        <>
          <div className="glass-panel border border-white/20 p-1.5 rounded-2xl flex mb-5">
            {[
              { id: "expense", label: "รายจ่าย" },
              { id: "income", label: "รายรับ" },
              { id: "transfer", label: "Transfer" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setType(t.id);
                  if (t.id === "transfer") setCategoryId("transfer");
                }}
                className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition-all ${
                  type === t.id ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-800/60 hover:bg-white/10"
                }`}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>

          <AmountField value={amountDigits} onChange={setAmountDigits} variant={type} label="จำนวนเงิน" helper={budgetHint} />

          {type === "transfer" ? (
            <div className="glass-card rounded-3xl p-5 mb-6">
              <div className="text-xs font-bold text-gray-900/60 uppercase mb-3 flex items-center gap-2">
                <ArrowRightLeft size={14} /> Transfer Accounts
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-extrabold text-gray-900/70 mb-2">บัญชีต้นทาง</div>
                  {renderAccountSelect(fromAccountId, setFromAccountId)}
                </div>
                <div>
                  <div className="text-xs font-extrabold text-gray-900/70 mb-2">บัญชีปลายทาง</div>
                  {renderAccountSelect(toAccountId, setToAccountId)}
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-900/55 mb-3 uppercase ml-1">บัญชีที่ใช้</h3>
              <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
                {accounts.map((acc) => {
                  const isSelected = accountId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      onClick={() => setAccountId(acc.id)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-max active:scale-95 ${
                        isSelected
                          ? "bg-gray-900/90 text-white border-white/10 shadow-lg"
                          : "glass-chip text-gray-900 border border-white/15 hover:bg-white/10"
                      }`}
                      type="button"
                    >
                      <span className="text-xl">{acc.icon || "💳"}</span>
                      <span className="text-sm font-extrabold">{acc.name}</span>
                      {isSelected ? <Check size={14} className="ml-1" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {type !== "transfer" ? (
            <>
              <h3 className="text-xs font-bold text-gray-900/55 mb-3 uppercase ml-1">หมวดหมู่</h3>
              <div className="grid grid-cols-4 gap-3 mb-6">
                {(type === "income" ? incomeCats : expenseCats).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex flex-col items-center p-3 rounded-2xl transition-all active:scale-95 border ${
                      categoryId === cat.id
                        ? "glass-card ring-2 ring-gray-900/80 border-white/20"
                        : "glass-chip border-white/15 hover:bg-white/10"
                    }`}
                    type="button"
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2"
                      style={{ backgroundColor: `${cat.color}20` }}
                    >
                      {cat.icon}
                    </div>
                    <span className="text-[10px] font-extrabold text-gray-900/70 truncate w-full text-center">{cat.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="glass-card rounded-3xl overflow-hidden mb-24">
            <div className="flex items-center border-b border-white/15 p-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-gray-900/50 mr-3">
                <Calendar size={20} />
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 outline-none text-gray-900 bg-transparent font-extrabold"
              />
            </div>

            <div className="flex items-center border-b border-white/15 p-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-gray-900/50 mr-3">
                <FileText size={20} />
              </div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="โน้ต (ชื่อร้าน/รายละเอียด)"
                className="flex-1 outline-none text-gray-900 bg-transparent font-extrabold"
              />
            </div>

            <div className="flex items-center p-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-gray-900/50 mr-3">
                <Eye size={20} />
              </div>
              <input
                type="text"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="Ref / TRX / เลขที่รายการ (ถ้ามี)"
                className="flex-1 outline-none text-gray-900 bg-transparent font-extrabold"
              />
            </div>
          </div>

          <button
            onClick={handleSaveManual}
            className="fixed bottom-6 left-4 right-4 bg-gray-900/90 text-white py-4 rounded-2xl font-extrabold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
            type="button"
          >
            {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
            {isEditMode ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
          </button>
        </>
      ) : null}

      {/* Fixed Create from queue (scan mode) */}
      {!isEditMode && entryMode === "scan" && queue.length ? (
        <button
          onClick={createTransactionsFromQueue}
          className={`fixed bottom-6 left-4 right-4 py-4 rounded-2xl font-extrabold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
            canCreateFromQueue ? "bg-indigo-600 text-white shadow-indigo-200" : "bg-white/30 text-gray-700/60 border border-white/20"
          }`}
          type="button"
          disabled={!canCreateFromQueue}
        >
          <Check size={18} />
          สร้างรายการจากคิว
        </button>
      ) : null}

      {/* ✅ Create category modal (FULL like CategoriesView) */}
      {createCatOpen ? (
        <ModalShell title="สร้างหมวดหมู่ใหม่" onClose={() => setCreateCatOpen(false)}>
          {/* type switch (same idea as CategoriesView tab) */}
          <div className="glass-panel p-1 rounded-xl flex mb-4">
            <button
              onClick={() => setCreateCatType("expense")}
              className={`flex-1 py-2 rounded-lg text-sm font-extrabold ${
                createCatType === "expense" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-600"
              }`}
              type="button"
            >
              รายจ่าย
            </button>
            <button
              onClick={() => setCreateCatType("income")}
              className={`flex-1 py-2 rounded-lg text-sm font-extrabold ${
                createCatType === "income" ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-600"
              }`}
              type="button"
            >
              รายรับ
            </button>
          </div>

          <label className="text-xs font-bold text-gray-700 mb-1 block">ชื่อหมวดหมู่</label>
          <input
            value={createCatName}
            onChange={(e) => setCreateCatName(e.target.value)}
            className="w-full glass-input rounded-xl p-3 outline-none focus:border-gray-900 mb-4 font-bold text-gray-900"
            placeholder="เช่น กาแฟ, ค่าเช่า"
          />

          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-700 mb-1 block">ไอคอน</label>
              <div className="w-full glass-panel rounded-xl p-3 text-center text-2xl h-[52px] flex items-center justify-center">
                {createCatIcon}
              </div>
            </div>

            <div className="flex-1">
              <label className="text-xs font-bold text-gray-700 mb-1 block">สี</label>
              <div className="flex gap-1 flex-wrap">
                {(PRESET_COLORS || []).slice(0, 8).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCreateCatColor(c)}
                    className={`w-6 h-6 rounded-full ${createCatColor === c ? "ring-2 ring-offset-1 ring-gray-700" : ""}`}
                    style={{ backgroundColor: c }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>

          <label className="text-xs font-bold text-gray-700 mb-1 block">เลือกไอคอน</label>
          <div className="flex-1 overflow-y-auto glass-panel rounded-xl p-2 mb-4 max-h-[260px]">
            <div className="grid grid-cols-6 gap-2">
              {(EMOJI_PRESETS || []).map((e, idx) => (
                <button
                  key={idx}
                  onClick={() => setCreateCatIcon(e)}
                  className={`text-xl p-2 rounded-lg hover:bg-white/10 transition-all ${
                    createCatIcon === e ? "bg-white/20 ring-1 ring-gray-900" : ""
                  }`}
                  type="button"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-auto">
            <button
              onClick={() => setCreateCatOpen(false)}
              className="flex-1 py-3 text-gray-800 font-extrabold glass-chip rounded-xl active:scale-95"
              type="button"
            >
              ยกเลิก
            </button>
            <button
              onClick={doCreateCategory}
              className="flex-1 py-3 text-white font-extrabold bg-gray-900/90 rounded-xl shadow-lg active:scale-95"
              type="button"
            >
              สร้าง
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
