// src/views/AddTransactionView.jsx
import React, { useMemo, useRef, useState } from "react";
import {
  X,
  Trash2,
  Calendar,
  FileText,
  Camera,
  Loader,
  Eye,
  Edit2,
  Plus,
  Check,
  AlertTriangle,
  ArrowRightLeft,
  Trash,
  Sparkles,
} from "lucide-react";

import { useAppStore } from "../store/store";
import AmountField from "../components/AmountField";
import { scanReceiptOpenAI } from "../services/scanOpenAI";
import { formatCurrency, toISODate } from "../utils/format";
import { generateId, generateTransferId } from "../utils/id";
import { PRESET_COLORS } from "../constants/presets.jsx";
import { isDuplicateByRef, toMonthKey, calcSpentByCategoryInMonth, getBudget } from "../store/selectors";
import { groupReceiptItemsToCategory, sanitizeCategoryKey } from "../utils/receiptCategorizer";

const toArabicDigits = (s) => {
  const th = "๐๑๒๓๔๕๖๗๘๙";
  return String(s || "").replace(/[๐-๙]/g, (ch) => {
    const idx = th.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
};

const digitsOnly = (s) => toArabicDigits(String(s || "")).replace(/[^\d]/g, "");

function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function getAccountDigitsCandidate(a) {
  // ✅ ทำให้ robust: รองรับหลาย field เผื่อ store ของคุณชื่อไม่เหมือนกัน
  const raw =
    a?.accountNumber ??
    a?.number ??
    a?.accNumber ??
    a?.accountNo ??
    a?.bankAccount ??
    a?.cardNumber ??
    a?.last4 ??
    a?.lastDigits ??
    a?.ref ??
    a?.note ??
    a?.details ??
    "";
  return digitsOnly(raw);
}

function bestMatchAccountId(accounts, digits) {
  const d = digitsOnly(digits);
  if (!d || d.length < 3) return "";

  let best = { id: "", score: 0 };

  for (const a of accounts || []) {
    const n = getAccountDigitsCandidate(a);
    if (!n) continue;

    // match by suffix
    const aLast = n.slice(-Math.min(n.length, 12));
    const dLast = d.slice(-Math.min(d.length, 12));

    let score = 0;
    if (aLast.endsWith(dLast)) score = dLast.length;
    else if (dLast.endsWith(aLast)) score = aLast.length;

    if (score > best.score) best = { id: a.id, score };
  }

  // ✅ กัน false-positive: ต้อง match อย่างน้อย 3 หลัก
  return best.score >= 3 ? best.id : "";
}

function categoryNameFromKey(key) {
  const k = sanitizeCategoryKey(key);
  const map = {
    food: "อาหาร",
    transport: "เดินทาง",
    shopping: "ช้อปปิ้ง",
    bills: "บิล/น้ำไฟ",
    health: "สุขภาพ",
    entertainment: "บันเทิง",
    salary: "เงินเดือน",
    bonus: "โบนัส",
    investment: "ลงทุน",
    refund: "เงินคืน",
    other: "อื่นๆ",
    transfer: "Transfer",
  };
  return map[k] || String(key || "").trim() || "อื่นๆ";
}

function mapKnownCategoryId(type, key) {
  const k = sanitizeCategoryKey(key);
  if (!k) return type === "income" ? "other_income" : "other";

  const expenseMap = {
    food: "food",
    transport: "transport",
    shopping: "shopping",
    bills: "bills",
    health: "health",
    entertainment: "entertainment",
    other: "other",
    transfer: "transfer",
  };
  const incomeMap = {
    salary: "salary",
    bonus: "bonus",
    investment: "investment",
    refund: "refund",
    other: "other_income",
  };

  return type === "income" ? incomeMap[k] || "" : expenseMap[k] || "";
}

export default function AddTransactionView({ showAlert, showConfirm }) {
  const store = useAppStore();
  const { state, navigate, upsertTransaction, bulkUpsertTransactions, deleteTransaction, addCategory } = store;

  const initialData = store.getEditingTransaction();
  const isEditMode = !!initialData;

  const accounts = state.accounts || [];
  const categories = state.categories || { expense: [], income: [] };

  const expenseCats = categories.expense || [];
  const incomeCats = categories.income || [];

  const firstExpenseId = expenseCats?.[0]?.id || "";
  const firstIncomeId = incomeCats?.[0]?.id || "";

  // ===== transfer edit pair =====
  const transferPair = useMemo(() => {
    if (!initialData?.isTransfer || !initialData?.transferId) return null;
    const all = (state.transactions || []).filter((t) => t.transferId === initialData.transferId);
    const outTx = all.find((t) => t.type === "expense");
    const inTx = all.find((t) => t.type === "income");
    if (!outTx || !inTx) return null;
    return { outTx, inTx };
  }, [initialData?.isTransfer, initialData?.transferId, state.transactions]);

  // ===== modes =====
  const [entryMode, setEntryMode] = useState(isEditMode ? "manual" : "scan"); // scan | manual

  // ===== manual form states =====
  const initialType = initialData?.isTransfer ? "transfer" : initialData?.type || "expense";
  const [type, setType] = useState(initialType); // expense | income | transfer

  const [amountDigits, setAmountDigits] = useState(() => {
    const n = transferPair?.outTx?.amount ?? initialData?.amount ?? 0;
    return n ? String(Math.round(Math.abs(n))) : "";
  });

  const [categoryId, setCategoryId] = useState(() => {
    if (initialData?.isTransfer) return "transfer";
    return initialData?.category || (initialType === "income" ? firstIncomeId : firstExpenseId) || "";
  });

  const [accountId, setAccountId] = useState(initialData?.accountId || accounts?.[0]?.id || "");
  const [fromAccountId, setFromAccountId] = useState(transferPair?.outTx?.accountId || accounts?.[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(transferPair?.inTx?.accountId || accounts?.[0]?.id || "");
  const [date, setDate] = useState(initialData?.date ? String(initialData.date).slice(0, 10) : toISODate(new Date()));
  const [note, setNote] = useState(initialData?.note || "");
  const [ref, setRef] = useState(initialData?.ref || "");

  const amountNumber = useMemo(() => Number(digitsOnly(amountDigits || "0")) || 0, [amountDigits]);

  // ===== budget hint for manual expense =====
  const monthKey = useMemo(() => toMonthKey(date), [date]);

  const spentMap = useMemo(
    () => calcSpentByCategoryInMonth(state.transactions || [], monthKey),
    [state.transactions, monthKey]
  );

  const budgetHint = useMemo(() => {
    if (type !== "expense") return "";
    if (!categoryId) return "";
    const b = getBudget(state.budgets || [], monthKey, categoryId);
    if (!b || !b.limit) return "";
    const spent = spentMap.get(categoryId) || 0;
    const next = spent + amountNumber;
    const pct = Math.round((next / b.limit) * 100);
    if (pct >= b.alertPct) return `⚠️ งบ ${formatCurrency(b.limit)} • ใช้แล้ว ${formatCurrency(next)} (${pct}%)`;
    return `งบ ${formatCurrency(b.limit)} • ใช้แล้ว ${formatCurrency(next)} (${pct}%)`;
  }, [type, categoryId, state.budgets, monthKey, spentMap, amountNumber]);

  // ===== scan queue =====
  const fileInputRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [queue, setQueue] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const existingRefSet = useMemo(() => {
    const set = new Set();
    for (const t of state.transactions || []) {
      const r = String(t.ref || "").trim();
      if (r) set.add(r);
    }
    return set;
  }, [state.transactions]);

  const createdCatRef = useRef({ expense: new Map(), income: new Map() });

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
    createdCatRef.current = { expense: new Map(), income: new Map() };
  };

  const ensureCategory = (typeForCat, scannedCategory) => {
    const list = categories[typeForCat] || [];
    const key = sanitizeCategoryKey(scannedCategory);

    const mem = createdCatRef.current?.[typeForCat];
    if (mem && key && mem.has(key)) return mem.get(key);

    const knownId = mapKnownCategoryId(typeForCat, key);
    if (knownId && list.some((c) => c.id === knownId)) {
      if (mem && key) mem.set(key, knownId);
      return knownId;
    }

    const found = list.find((c) => c.id === key || key.includes(c.id) || c.name?.toLowerCase?.() === key);
    if (found) {
      if (mem && key) mem.set(key, found.id);
      return found.id;
    }

    let slug =
      key
        .replace(/[^a-z0-9ก-๙]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24) || `cat_${Date.now()}`;

    let id = slug;
    let i = 2;

    const createdIds = new Set([
      ...(createdCatRef.current?.expense?.values?.() || []),
      ...(createdCatRef.current?.income?.values?.() || []),
    ]);

    while (list.some((c) => c.id === id) || createdIds.has(id)) id = `${slug}_${i++}`;

    const color = PRESET_COLORS[hashString(id) % PRESET_COLORS.length];
    const newCat = { id, name: categoryNameFromKey(scannedCategory), icon: "🏷️", color };

    addCategory({ type: typeForCat, category: newCat });

    if (mem && key) mem.set(key, id);
    return id;
  };

  const updateQueueItem = (id, patch) => {
    setQueue((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const updateQueueGroup = (qid, gidx, patch) => {
    setQueue((prev) =>
      prev.map((x) => {
        if (x.id !== qid) return x;
        const groups = Array.isArray(x.groups) ? x.groups.slice() : [];
        if (!groups[gidx]) return x;
        groups[gidx] = { ...groups[gidx], ...patch };
        const sum = groups.reduce((s, g) => s + (Number(g.amount) || 0), 0);
        return { ...x, groups, amount: x.splitByCategory ? sum : x.amount };
      })
    );
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

  const handlePickFiles = () => {
    fileInputRef.current?.click();
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
            merchant: "",
            ref: "",
            categoryId: "",
            accountId: accounts?.[0]?.id || "",
            fromAccountId: accounts?.[0]?.id || "",
            toAccountId: accounts?.[0]?.id || "",
            duplicate: false,
            includeDuplicate: true,
            evidence: "",
            items: [],
            groups: [],
            splitByCategory: false,
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

          const merchant = String(result?.merchant || "").trim();
          const noteText = String(result?.note || "").trim();
          const mergedNote = noteText || merchant || "";

          const contextText = `${merchant} ${noteText} ${String(result?.evidence || "")}`.trim();
          const rref = String(result?.ref || "").trim();

          const fromDigits = digitsOnly(result?.from_account);
          const toDigits = digitsOnly(result?.to_account);

          let detectedAccountId = "";
          let detectedFromId = "";
          let detectedToId = "";

          if (txType === "transfer") {
            detectedFromId = bestMatchAccountId(accounts, fromDigits) || accounts?.[0]?.id || "";
            detectedToId = bestMatchAccountId(accounts, toDigits) || accounts?.[0]?.id || "";

            // ✅ กันเลือกบัญชีเดียวกัน (ถ้ามีหลายบัญชี)
            if (detectedFromId && detectedToId && detectedFromId === detectedToId) {
              detectedToId = accounts.find((a) => a.id !== detectedFromId)?.id || detectedToId;
            }
          } else {
            detectedAccountId =
              bestMatchAccountId(accounts, fromDigits) ||
              bestMatchAccountId(accounts, toDigits) ||
              accounts?.[0]?.id ||
              "";
          }

          // ===== multi-line items -> group by category
          const scannedItems = Array.isArray(result?.items) ? result.items : [];

          const fallbackKey =
            sanitizeCategoryKey(result?.category) || sanitizeCategoryKey(result?.category_key) || "other";

          let groups = [];
          let primaryKey = fallbackKey;

          if (txType === "expense" || txType === "income") {
            const grouped = groupReceiptItemsToCategory(txType, scannedItems, contextText, fallbackKey);
            primaryKey = grouped.primaryKey || fallbackKey;

            groups = (grouped.groups || []).map((g) => {
              const catId = ensureCategory(txType, g.key || "other");
              return {
                key: g.key || "other",
                categoryId: catId,
                amount: Math.round((Number(g.amount) || 0) * 100) / 100,
                names: Array.isArray(g.names) ? g.names.slice(0, 6) : [],
              };
            });
          }

          const groupSum = groups.reduce((s, g) => s + (Number(g.amount) || 0), 0);
          const aiTotal = Number.isFinite(Number(amount)) ? Number(amount) : 0;

          let splitByCategory = false;
          if (txType === "expense" && groups.length >= 2) {
            const g0 = groups[0]?.amount || 0;
            const g1 = groups[1]?.amount || 0;
            const total = groupSum || aiTotal || 1;
            const ratio2 = g1 / total;
            const ratio1 = g0 / total;
            splitByCategory = ratio2 >= 0.2 && ratio1 <= 0.88;
          }

          let detectedCategoryId = "";
          if (txType === "expense") detectedCategoryId = ensureCategory("expense", primaryKey || "other");
          if (txType === "income") detectedCategoryId = ensureCategory("income", primaryKey || "other");

          const dup = rref ? batchRefSet.has(rref) || isDuplicateByRef(state.transactions || [], rref) : false;
          if (rref) batchRefSet.add(rref);

          updateQueueItem(qid, {
            status: "ready",
            txType,
            amount: splitByCategory ? groupSum || aiTotal || null : Number.isFinite(amount) ? amount : groupSum || null,
            date: d,
            note: mergedNote,
            merchant,
            ref: rref,
            categoryId: detectedCategoryId,
            accountId: detectedAccountId || (accounts?.[0]?.id || ""),
            fromAccountId: detectedFromId || (accounts?.[0]?.id || ""),
            toAccountId: detectedToId || (accounts?.[0]?.id || ""),
            duplicate: dup,
            includeDuplicate: !dup,
            evidence: String(result?.evidence || "").slice(0, 240),
            items: scannedItems,
            groups,
            splitByCategory,
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
    const valid = queue.filter((q) => q.status === "ready" && q.amount && q.amount > 0 && q.includeDuplicate);
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
        if (q.fromAccountId === q.toAccountId)
          return showAlert?.("Transfer ห้ามเลือกบัญชีต้นทางและปลายทางเป็นบัญชีเดียวกัน");
      } else {
        if (!q.accountId) return showAlert?.("กรุณาเลือกบัญชีให้ครบ");

        if (q.txType === "expense" && q.splitByCategory && Array.isArray(q.groups) && q.groups.length) {
          for (const g of q.groups) {
            if (!g.categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่ให้ครบ (ในกลุ่มแยกหมวด)");
            if (!Number.isFinite(Number(g.amount)) || Number(g.amount) <= 0)
              return showAlert?.("ยอดเงินในกลุ่มแยกหมวดไม่ถูกต้อง");
          }
        } else {
          if (!q.categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่ให้ครบ");
        }
      }
    }

    const txs = [];
    for (const q of ready) {
      const d = String(q.date || toISODate(new Date())).slice(0, 10);
      const noteText = String(q.note || "").trim();
      const merchant = String(q.merchant || "").trim();
      const baseNote = noteText || merchant || "Scan";

      if (q.txType === "transfer") {
        const transferId = generateTransferId();

        txs.push({
          id: generateId(),
          type: "expense",
          amount: Number(q.amount),
          category: "transfer",
          accountId: q.fromAccountId,
          date: d,
          note: baseNote || "Transfer",
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
          note: baseNote || "Transfer",
          isTransfer: true,
          transferId,
          ref: q.ref || null,
          source: "scan",
        });

        continue;
      }

      if (q.txType === "expense" && q.splitByCategory && Array.isArray(q.groups) && q.groups.length >= 2) {
        const groups = q.groups
          .map((g) => ({ ...g, amount: Number(g.amount) || 0 }))
          .filter((g) => g.amount > 0);

        groups.sort((a, b) => b.amount - a.amount);

        groups.forEach((g, idx) => {
          const itemsTxt = Array.isArray(g.names) && g.names.length ? ` • ${g.names.join(", ")}` : "";
          const groupNote = `${baseNote} • ${categoryNameFromKey(g.key)}${itemsTxt}`.slice(0, 180);

          txs.push({
            id: generateId(),
            type: "expense",
            amount: g.amount,
            category: g.categoryId,
            accountId: q.accountId,
            date: d,
            note: groupNote,
            isTransfer: false,
            transferId: null,
            ref: idx === 0 ? (q.ref || null) : null,
            source: "scan",
          });
        });

        continue;
      }

      txs.push({
        id: generateId(),
        type: q.txType === "income" ? "income" : "expense",
        amount: Number(q.amount),
        category: q.categoryId,
        accountId: q.accountId,
        date: d,
        note: baseNote,
        isTransfer: false,
        transferId: null,
        ref: q.ref || null,
        source: "scan",
      });
    }

    bulkUpsertTransactions(txs);
    clearQueue();
  };

  // ===== manual save/delete =====
  const handleSaveManual = () => {
    if (!amountNumber || amountNumber <= 0) return showAlert?.("กรุณาระบุจำนวนเงินให้ถูกต้อง");

    const d = String(date || toISODate(new Date())).slice(0, 10);
    const noteText = String(note || "").trim();
    const refText = String(ref || "").trim() || null;

    // ✅ กรณี edit แล้วเดิมเป็น transfer แต่ผู้ใช้เลือกเป็น expense/income
    if (isEditMode && initialData?.isTransfer && type !== "transfer" && transferPair) {
      const keepId = initialData.id;
      const otherId = transferPair.outTx.id === keepId ? transferPair.inTx.id : transferPair.outTx.id;

      if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");
      if (!categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่");

      deleteTransaction(otherId);
      upsertTransaction({
        id: keepId,
        type: type === "income" ? "income" : "expense",
        amount: amountNumber,
        category: categoryId,
        accountId,
        date: d,
        note: noteText,
        isTransfer: false,
        transferId: null,
        ref: refText,
        source: "manual",
      });
      return;
    }

    // ✅ กรณี edit แล้วเดิมเป็น non-transfer แต่ผู้ใช้เปลี่ยนเป็น transfer
    if (isEditMode && !initialData?.isTransfer && type === "transfer") {
      if (!fromAccountId || !toAccountId) return showAlert?.("กรุณาเลือกบัญชีต้นทางและปลายทาง");
      if (fromAccountId === toAccountId) return showAlert?.("บัญชีต้นทาง/ปลายทางต้องไม่ใช่บัญชีเดียวกัน");

      const transferId = generateTransferId();
      const outId = initialData?.id || generateId();
      const inId = generateId();

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
          ref: refText,
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
          ref: refText,
          source: "transfer",
        },
      ]);
      return;
    }

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
          ref: refText,
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
          ref: refText,
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
      ref: refText,
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

  const selectedAccountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name || "",
    [accounts, accountId]
  );

  const setQueueTxType = (q, nextType) => {
    if (!q?.id) return;

    if (nextType === "transfer") {
      const fromId = q.fromAccountId || q.accountId || accounts?.[0]?.id || "";
      let toId = q.toAccountId || accounts.find((a) => a.id !== fromId)?.id || fromId;

      if (fromId && toId && fromId === toId) toId = accounts.find((a) => a.id !== fromId)?.id || toId;

      updateQueueItem(q.id, {
        txType: "transfer",
        categoryId: "transfer",
        splitByCategory: false,
        groups: [],
        accountId: q.accountId || accounts?.[0]?.id || "",
        fromAccountId: fromId,
        toAccountId: toId,
      });
      return;
    }

    // expense/income
    const list = nextType === "income" ? incomeCats : expenseCats;
    const fallbackCatId = list?.[0]?.id || ensureCategory(nextType, "other") || "";
    const nextCatId = list.some((c) => c.id === q.categoryId) ? q.categoryId : fallbackCatId;

    updateQueueItem(q.id, {
      txType: nextType,
      accountId: q.accountId || q.fromAccountId || q.toAccountId || accounts?.[0]?.id || "",
      categoryId: nextCatId,
      // income: ไม่แยกหมวด
      ...(nextType === "income" ? { splitByCategory: false, groups: [] } : {}),
    });
  };

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
                <div className="text-xs text-gray-800/60 mt-1">เลือกได้หลายรูป • รองรับแยกหมวดจากหลายบรรทัด</div>
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
                    canCreateFromQueue
                      ? "bg-indigo-600 text-white"
                      : "bg-white/30 text-gray-700/60 border border-white/20"
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
                  const hasGroups = Array.isArray(q.groups) && q.groups.length >= 2;

                  return (
                    <div key={q.id} className="glass-card rounded-3xl overflow-hidden">
                      <div className="p-4 flex gap-3">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/15 bg-white/20 shrink-0">
                          {q.previewUrl ? (
                            <img src={q.previewUrl} alt="preview" className="w-full h-full object-cover" />
                          ) : null}
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

                            {q.txType === "expense" && hasGroups ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/20">
                                Multi-category
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-sm font-extrabold text-gray-900 truncate">
                            {q.amount
                              ? formatCurrency(q.amount)
                              : q.status === "error"
                              ? "สแกนไม่สำเร็จ"
                              : "กำลังประมวลผล..."}
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
                          {/* ✅ Tx Type Switch (แก้ประเภทได้หลัง Scan) */}
                          <div className="glass-panel border border-white/20 p-1.5 rounded-2xl flex mb-3">
                            {[
                              { id: "expense", label: "รายจ่าย" },
                              { id: "income", label: "รายรับ" },
                              { id: "transfer", label: "Transfer" },
                            ].map((t) => (
                              <button
                                key={t.id}
                                onClick={() => setQueueTxType(q, t.id)}
                                className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all ${
                                  q.txType === t.id
                                    ? "bg-gray-900/90 text-white shadow-sm"
                                    : "text-gray-800/60 hover:bg-white/10"
                                }`}
                                type="button"
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>

                          {/* Duplicate toggle */}
                          {q.duplicate ? (
                            <div className="glass-panel border border-amber-500/20 rounded-2xl p-3 mb-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-amber-800">พบ Ref ซ้ำ</div>
                                <div className="text-[12px] text-amber-800/80">
                                  ระบบจะไม่สร้างรายการซ้ำโดยอัตโนมัติ (คุณสามารถเปิดเพื่อบันทึกซ้ำได้)
                                </div>
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

                          {/* Split toggle (expense only, when groups exist) */}
                          {q.txType === "expense" && Array.isArray(q.groups) && q.groups.length >= 2 ? (
                            <div className="glass-panel border border-emerald-500/20 rounded-2xl p-3 mb-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-emerald-800">แยกเป็นหลายหมวด</div>
                                <div className="text-[12px] text-emerald-800/80">
                                  ระบบจะสร้างหลายรายการตามหมวดจากหลายบรรทัดในบิล
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => updateQueueItem(q.id, { splitByCategory: !q.splitByCategory })}
                                className={`w-14 h-8 rounded-full transition-all relative border ${
                                  q.splitByCategory ? "bg-gray-900/90 border-white/20" : "bg-white/20 border-white/20"
                                }`}
                                title={q.splitByCategory ? "เปิด" : "ปิด"}
                              >
                                <span
                                  className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                                    q.splitByCategory ? "left-7" : "left-1"
                                  }`}
                                />
                              </button>
                            </div>
                          ) : null}

                          {/* Amount / Date */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="glass-panel border border-white/20 rounded-2xl p-3">
                              <div className="text-xs font-bold text-gray-900/70 mb-1">จำนวนเงิน</div>
                              <input
                                type="number"
                                value={q.amount ?? ""}
                                onChange={(e) =>
                                  updateQueueItem(q.id, { amount: Number(e.target.value || 0), splitByCategory: false })
                                }
                                className="w-full outline-none text-lg font-extrabold text-gray-900 bg-transparent"
                                placeholder="0"
                              />
                              <div className="text-[11px] text-gray-800/55 mt-1">* แก้ยอดตรงนี้จะปิดโหมดแยกหมวด</div>
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

                          {/* Accounts / Categories */}
                          <div className="mt-3">
                            {q.txType === "transfer" ? (
                              <div className="grid grid-cols-1 gap-3">
                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
                                    <ArrowRightLeft size={14} /> บัญชีต้นทาง
                                  </div>
                                  {renderAccountSelect(q.fromAccountId, (v) =>
                                    updateQueueItem(q.id, { fromAccountId: v })
                                  )}
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

                                {q.txType === "expense" && q.splitByCategory && Array.isArray(q.groups) && q.groups.length >= 2 ? (
                                  <div className="glass-panel border border-emerald-500/15 rounded-2xl p-3">
                                    <div className="text-xs font-bold text-gray-900/70 mb-2">แยกหมวดจากบรรทัดในบิล</div>
                                    <div className="space-y-2">
                                      {q.groups.map((g, idx) => (
                                        <div key={idx} className="rounded-2xl bg-white/10 border border-white/15 p-3">
                                          <div className="grid grid-cols-5 gap-2 items-start">
                                            <div className="col-span-3">
                                              <div className="text-[11px] text-gray-900/60 font-bold mb-1">หมวด</div>
                                              <select
                                                value={g.categoryId || ""}
                                                onChange={(e) =>
                                                  updateQueueGroup(q.id, idx, { categoryId: e.target.value })
                                                }
                                                className="w-full glass-input rounded-xl px-3 py-2 bg-white/30 outline-none focus:border-gray-900 text-xs font-extrabold text-gray-900"
                                              >
                                                <option value="" disabled>
                                                  เลือกหมวด
                                                </option>
                                                {expenseCats.map((c) => (
                                                  <option key={c.id} value={c.id}>
                                                    {c.icon} {c.name}
                                                  </option>
                                                ))}
                                              </select>
                                              <div className="text-[10px] text-gray-900/55 mt-1">
                                                tag: <span className="font-bold">{categoryNameFromKey(g.key)}</span>
                                              </div>
                                            </div>

                                            <div className="col-span-2">
                                              <div className="text-[11px] text-gray-900/60 font-bold mb-1">ยอด</div>
                                              <input
                                                type="number"
                                                value={g.amount ?? 0}
                                                onChange={(e) =>
                                                  updateQueueGroup(q.id, idx, { amount: Number(e.target.value || 0) })
                                                }
                                                className="w-full glass-input rounded-xl px-3 py-2 bg-white/30 outline-none focus:border-gray-900 text-xs font-extrabold text-gray-900"
                                              />
                                              <div className="text-[10px] text-gray-900/55 mt-1 truncate">
                                                {Array.isArray(g.names) && g.names.length ? `เช่น: ${g.names.join(", ")}` : "—"}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => navigate("categories")}
                                      className="mt-3 w-full py-2.5 rounded-2xl bg-white/25 border border-white/15 text-gray-900 font-extrabold text-xs active:scale-95"
                                    >
                                      จัดการหมวดหมู่
                                    </button>
                                  </div>
                                ) : (
                                  <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                    <div className="text-xs font-bold text-gray-900/70 mb-2">หมวดหมู่</div>
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

                                    <button
                                      type="button"
                                      onClick={() => navigate("categories")}
                                      className="mt-3 w-full py-2.5 rounded-2xl bg-white/25 border border-white/15 text-gray-900 font-extrabold text-xs active:scale-95"
                                    >
                                      จัดการหมวดหมู่
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {q.evidence ? (
                            <div className="mt-3 text-[11px] text-gray-900/60">
                              <span className="font-bold">Evidence:</span> {q.evidence}
                            </div>
                          ) : null}

                          {Array.isArray(q.items) && q.items.length ? (
                            <div className="mt-3 text-[11px] text-gray-900/55">
                              <span className="font-bold">Items:</span>{" "}
                              {q.items
                                .slice(0, 6)
                                .map((it) => String(it?.name || it?.title || it?.desc || "").trim())
                                .filter(Boolean)
                                .join(" • ")}
                              {q.items.length > 6 ? " • ..." : ""}
                            </div>
                          ) : null}
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

      {/* ===== MANUAL MODE (or EDIT MODE) ===== */}
      {entryMode === "manual" || isEditMode ? (
        <>
          {/* Type switch */}
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
                  if (t.id === "transfer") {
                    setCategoryId("transfer");
                    return;
                  }
                  if (t.id === "income") setCategoryId(firstIncomeId || categoryId || "");
                  else setCategoryId(firstExpenseId || categoryId || "");
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
              <div className="mt-3 text-[12px] text-gray-900/60">
                Transfer จะไม่ถูกนับเป็นรายรับ/รายจ่ายในสถิติ (เพื่อให้ยอดสุทธิไม่เพี้ยน)
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
                      {acc.image ? (
                        <span className="w-7 h-7 rounded-xl overflow-hidden bg-white/20 border border-white/15 shrink-0">
                          <img src={acc.image} alt="acc" className="w-full h-full object-cover" />
                        </span>
                      ) : (
                        <span className="text-xl">{acc.icon || "💳"}</span>
                      )}
                      <span className="text-sm font-extrabold">{acc.name}</span>
                      {isSelected ? <Check size={14} className="ml-1" /> : null}
                    </button>
                  );
                })}
              </div>

              {selectedAccountName ? (
                <div className="text-xs text-gray-900/55 ml-1">
                  เลือกบัญชี: <span className="font-extrabold text-gray-900">{selectedAccountName}</span>
                </div>
              ) : null}
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
                    <span className="text-[10px] font-extrabold text-gray-900/70 truncate w-full text-center">
                      {cat.name}
                    </span>
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
            canCreateFromQueue
              ? "bg-indigo-600 text-white shadow-indigo-200"
              : "bg-white/30 text-gray-700/60 border border-white/20"
          }`}
          type="button"
          disabled={!canCreateFromQueue}
        >
          <Check size={18} />
          สร้างรายการจากคิว
        </button>
      ) : null}
    </div>
  );
}
