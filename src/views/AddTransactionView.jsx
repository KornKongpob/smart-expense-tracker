// src/views/AddTransactionView.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { bestMatchAccountCandidate, bestMatchAccountId, getAccountDigitCandidates, matchFromToAccounts } from "../utils/accountMatch";
import { createPortal } from "react-dom";
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
  CreditCard,
  Inbox,
  Layers,
} from "lucide-react";

import { useAppStore } from "../store/store";
import AmountField from "../components/AmountField";
import { scanReceiptOpenAI } from "../services/scanOpenAI";
import { putBlob, getBlobUrl } from "../services/blobStore";
import { formatCurrency, toISODate } from "../utils/format";
import { parseMoneyToSatang, formatMoneyInputFromSatang, sanitizeMoneyInput } from "../utils/money";
import { generateId, generateTransferId, generateSplitGroupId } from "../utils/id";
import { useBlobUrl } from "../utils/useBlobUrl";
import { PRESET_COLORS } from "../constants/presets.jsx";
import {
  isDuplicateByRef,
  findFuzzyDuplicate,
  toMonthKey,
  calcSpentByCategoryInMonth,
  getBudget,
  calcAccountBalance,
} from "../store/selectors";
import { splitReceiptItemsToLines, sanitizeCategoryKey } from "../utils/receiptCategorizer";
import { deriveAutomationPatch } from "../utils/rulesEngine";
import {
  resolveMerchantCanonical,
  deriveMerchantAutofillPatch,
} from "../utils/merchantDictionary";

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

// ===== image helpers =====
function isImageSrc(v) {
  const s = String(v || "").trim();
  return s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://");
}

function getAccountVisual(acc) {
  if (!acc) return { kind: "emoji", value: "💳" };
  const img = acc.image && isImageSrc(acc.image) ? acc.image : null;
  if (img) return { kind: "img", src: img };

  const icon = String(acc.icon || "").trim();
  if (isImageSrc(icon)) return { kind: "img", src: icon };
  return { kind: "emoji", value: icon || "💳" };
}

function isCreditAccount(acc) {
  const t = String(acc?.type || "").toLowerCase().trim();
  if (t === "credit") return true;
  // fallback: if it has creditLimit field, treat as credit-like
  if (Number(acc?.creditLimit || 0) > 0) return true;
  return false;
}

// ===== modal dropdown (shows real image + no overlap issues) =====
function AccountDropdown({
  accounts,
  value,
  onChange,
  placeholder = "เลือกบัญชี",
  title = "เลือกบัญชี",
  filterFn,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const filtered = useMemo(() => {
    const arr = Array.isArray(accounts) ? accounts : [];
    return typeof filterFn === "function" ? arr.filter(filterFn) : arr;
  }, [accounts, filterFn]);

  // ถ้า value ไม่อยู่ใน filtered (เช่น filterFn เปลี่ยน) ให้ยังพยายามหาใน accounts ทั้งหมดเพื่อโชว์ชื่อถูกต้อง
  const selected = useMemo(() => {
    const all = Array.isArray(accounts) ? accounts : [];
    return all.find((a) => a.id === value) || null;
  }, [accounts, value]);

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: Math.min(window.innerHeight - 16, r.bottom + 8),
      left: Math.max(8, Math.min(window.innerWidth - r.width - 8, r.left)),
      width: r.width,
    });
  };

  // ✅ อัปเดตตำแหน่งตอนเปิด + จับ scroll/resize แบบ capture (แก้ซ้อน/คลิกไม่ได้)
  useEffect(() => {
    if (!open) return;
    updatePos();

    const onWin = () => updatePos();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);

    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ✅ Lock scroll + ESC ปิด dropdown
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const layer = open ? (
    <div
      className="fixed inset-0 z-[9999]"
      onMouseDown={() => setOpen(false)}
      onTouchStart={() => setOpen(false)}
      style={{ touchAction: "none" }}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/45" />

      {/* desktop anchored dropdown */}
      <div
        className="hidden sm:block fixed z-[10000] overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b">
          <div className="text-sm font-medium">{title}</div>
        </div>
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">ไม่พบบัญชี</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange?.(a.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                  a.id === value ? "bg-gray-50" : ""
                }`}
              >
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-gray-500">
                  {a.type} • {a.currency}
                  {a.digits ? ` • •••• ${a.digits}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* mobile bottom sheet */}
      <div
        className="sm:hidden fixed left-0 right-0 bottom-0 z-[10000] rounded-t-3xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{ touchAction: "pan-y" }}
      >
        <div className="px-4 pt-3 pb-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200" />
          <div className="mt-2 text-sm font-medium">{title}</div>
        </div>
        <div className="max-h-[60vh] overflow-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">ไม่พบบัญชี</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange?.(a.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-3 rounded-xl hover:bg-gray-50 ${
                  a.id === value ? "bg-gray-50" : ""
                }`}
              >
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-gray-500">
                  {a.type} • {a.currency}
                  {a.digits ? ` • •••• ${a.digits}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-2xl border px-4 py-3 text-sm"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border px-4 py-3 text-left"
      >
        <div className="text-sm font-medium">
          {selected ? selected.name : placeholder}
        </div>
        {selected && (
          <div className="text-xs text-gray-500">
            {selected.type} • {selected.currency}
            {selected.digits ? ` • •••• ${selected.digits}` : ""}
          </div>
        )}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(layer, document.body)
        : null}
    </div>
  );
}

/** ===== merchant memory helpers ===== */
function normalizeMerchantKey(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "";
  return t
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\wก-๙\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMerchantFromNote(note) {
  const t = String(note || "").trim();
  if (!t) return "";
  const parts = t.split("•").map((x) => x.trim()).filter(Boolean);
  return parts[0] || t.slice(0, 48);
}

function appendEvidenceToNote(note, evidence, maxLen = 180) {
  const base = String(note || "").trim();
  const ev = String(evidence || "").trim();
  if (!ev) return base;

  const baseLower = base.toLowerCase();
  const evLower = ev.toLowerCase();
  if (baseLower.includes(evLower.slice(0, 24))) return base;

  const suffix = ` • ${ev}`;
  const out = (base ? base + suffix : ev).trim();
  if (out.length <= maxLen) return out;

  if (!base) return out.slice(0, maxLen);

  const room = Math.max(0, maxLen - (base.length + 3));
  if (room <= 12) return base.slice(0, maxLen);
  return `${base} • ${ev.slice(0, room)}`.trim();
}

function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** ===== account matching helpers (centralized in src/utils/accountMatch.js) ===== */

function categoryNameFromKey(key) {
  const k = sanitizeCategoryKey(key);
  const map = {
    food: "อาหาร",
    drinks: "เครื่องดื่ม",
    coffee: "กาแฟ/ชา",
    dining: "กินนอกบ้าน",
    groceries: "ของกิน/ของใช้",
    transport: "เดินทาง",
    fuel: "น้ำมันรถ",
    shopping: "ช้อปปิ้ง",
    bills: "บิล/น้ำไฟ",
    phone_internet: "มือถือ/อินเทอร์เน็ต",
    subscriptions: "สมาชิก/Subscription",
    health: "สุขภาพ",
    fitness: "ออกกำลังกาย",
    beauty: "ความงาม",
    home: "บ้าน",
    education: "การเรียน",
    entertainment: "บันเทิง",
    salary: "เงินเดือน",
    bonus: "โบนัส",
    investment: "ลงทุน",
    refund: "เงินคืน",
    other: "อื่นๆ",
    mixed: "หลายหมวด",
    transfer: "Transfer",
  };
  return map[k] || String(key || "").trim() || "อื่นๆ";
}

function mapKnownCategoryId(type, key) {
  const k = sanitizeCategoryKey(key);
  if (!k) return type === "income" ? "other_income" : "other";

  const expenseMap = {
    food: "food",
    drinks: "drinks",
    coffee: "coffee",
    dining: "dining",
    groceries: "groceries",
    transport: "transport",
    fuel: "fuel",
    shopping: "shopping",
    bills: "bills",
    phone_internet: "phone_internet",
    subscriptions: "subscriptions",
    health: "health",
    fitness: "fitness",
    beauty: "beauty",
    home: "home",
    education: "education",
    entertainment: "entertainment",
    mixed: "mixed",
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

function looksLikeCreditPaymentText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("ชำระ") ||
    t.includes("ชำระยอด") ||
    t.includes("บัตรเครดิต") ||
    t.includes("credit card") ||
    t.includes("card payment") ||
    t.includes("payment") ||
    t.includes("pay bill") ||
    t.includes("pay card")
  );
}

function looksLikeTransferText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("โอน") ||
    t.includes("transfer") ||
    t.includes("พร้อมเพย์") ||
    t.includes("promptpay") ||
    t.includes("trx") ||
    t.includes("transaction") ||
    t.includes("ref") ||
    t.includes("เลขที่รายการ")
  );
}

function looksLikeIncomeText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("เงินเข้า") ||
    t.includes("รับโอน") ||
    t.includes("โอนเข้า") ||
    t.includes("deposit") ||
    t.includes("credited") ||
    t.includes("receive") ||
    t.includes("received") ||
    t.includes("incoming") ||
    t.includes("refund") ||
    t.includes("salary") ||
    t.includes("เงินเดือน")
  );
}

function looksLikeExpenseText(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("โอนออก") ||
    t.includes("ชำระ") ||
    t.includes("ชำระยอด") ||
    t.includes("จ่าย") ||
    t.includes("debit") ||
    t.includes("paid") ||
    t.includes("withdraw") ||
    t.includes("withdrawal") ||
    t.includes("purchase") ||
    t.includes("ซื้อ") ||
    t.includes("ถอน")
  );
}

/**
 * Enhance model-detected tx type using:
 * - Whether from/to accounts are recognized in the user's account list
 * - Credit-account direction (deposit -> credit) to detect credit card payments
 * - Lightweight keyword hints for income vs expense when only one side is recognized
 */
function enhanceScannedTxType({
  currentType,
  aiTxType,
  matchedFromId,
  matchedToId,
  matchedFromAcc,
  matchedToAcc,
  contextText,
}) {
  if (currentType === "credit_payment") return "credit_payment";

  const internalFrom = !!matchedFromAcc;
  const internalTo = !!matchedToAcc;

  const fromIsCredit = internalFrom && isCreditAccount(matchedFromAcc);
  const toIsCredit = internalTo && isCreditAccount(matchedToAcc);

  const twoInternal =
    internalFrom && internalTo && matchedFromId && matchedToId && matchedFromId !== matchedToId;

  // If we can validate both sides as internal accounts, it's a transfer (or credit payment).
  if (twoInternal) {
    if (toIsCredit && !fromIsCredit) return "credit_payment";
    return "transfer";
  }

  // If text strongly indicates paying a credit card and destination looks like credit, prefer credit_payment.
  if (looksLikeCreditPaymentText(contextText) && toIsCredit && !fromIsCredit) return "credit_payment";

  // If model says transfer but we can't validate both sides, infer direction:
  // - internalFrom only  => likely expense (money leaving your account)
  // - internalTo only    => likely income (money entering your account)
  if (currentType === "transfer") {
    if (internalFrom && !internalTo) return looksLikeIncomeText(contextText) ? "income" : "expense";
    if (!internalFrom && internalTo) return looksLikeExpenseText(contextText) ? "expense" : "income";
    return "transfer";
  }

  // Direction consistency fixes:
  // - If destination is internal but source isn't, it's likely income.
  if (currentType === "expense" && !internalFrom && internalTo) return "income";
  // - If source is internal but destination isn't, it's likely expense.
  if (currentType === "income" && internalFrom && !internalTo) return "expense";

  return currentType || aiTxType || "expense";
}

export default function AddTransactionView({ showAlert, showConfirm }) {
  const store = useAppStore();
  const {
    state,
    navigate,
    upsertTransaction,
    bulkUpsertTransactions,
    deleteTransaction,
    deleteManyTransactions,
    addCategory,
    addScanInboxItems,
    learnMerchant,
  } = store;

  const initialData = store.getEditingTransaction();
  const isEditMode = !!initialData;

  const accounts = state.accounts || [];
  const categories = state.categories || { expense: [], income: [] };

  // ===== transfer edit pair =====
  const transferPair = useMemo(() => {
    if (!initialData?.isTransfer || !initialData?.transferId) return null;
    const all = (state.transactions || []).filter((t) => t.transferId === initialData.transferId);
    const outTx = all.find((t) => t.type === "expense");
    const inTx = all.find((t) => t.type === "income");
    if (!outTx || !inTx) return null;
    return { outTx, inTx };
  }, [initialData?.isTransfer, initialData?.transferId, state.transactions]);

  const transferKindForEdit = useMemo(() => {
    if (!transferPair) return null;

    const explicit =
      String(transferPair?.outTx?.transferKind || transferPair?.inTx?.transferKind || "")
        .trim()
        .toLowerCase() || "";

    if (explicit === "credit_payment") return "credit_payment";

    // infer by account types (to = credit, from = non-credit)
    const fromAcc = accounts.find((a) => a.id === transferPair?.outTx?.accountId) || null;
    const toAcc = accounts.find((a) => a.id === transferPair?.inTx?.accountId) || null;

    if (fromAcc && toAcc && isCreditAccount(toAcc) && !isCreditAccount(fromAcc)) return "credit_payment";

    return "transfer";
  }, [transferPair, accounts]);

  const isEditingTransferLike = !!(isEditMode && initialData?.isTransfer);
  const isEditingCreditPayment = isEditingTransferLike && transferKindForEdit === "credit_payment";

  // ===== attachment (persisted in IndexedDB) =====
  const initialAttachmentId = useMemo(() => {
    const direct = String(initialData?.attachmentId || "").trim();
    if (direct) return direct;
    const out = String(transferPair?.outTx?.attachmentId || "").trim();
    if (out) return out;
    const inn = String(transferPair?.inTx?.attachmentId || "").trim();
    return inn || "";
  }, [initialData, transferPair]);

  const attachmentUrl = useBlobUrl(initialAttachmentId);

  // ===== modes =====
  const [entryMode, setEntryMode] = useState(isEditMode ? "manual" : "scan"); // scan | manual

  // ===== manual form states =====
  const initialType = useMemo(() => {
    if (initialData?.isTransfer) return transferKindForEdit === "credit_payment" ? "credit_payment" : "transfer";
    return initialData?.type || "expense";
  }, [initialData?.isTransfer, initialData?.type, transferKindForEdit]);

  const [type, setType] = useState(initialType); // expense | income | transfer | credit_payment

  // keep type synced in edit mode if inferred kind changes (e.g., accounts loaded)
  useEffect(() => {
    if (!isEditMode) return;
    setType(initialType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType]);

  // NOTE: canonical storage is satang (integer). AmountField expects a THB-major string (e.g., "125.25").
  // So when pre-filling edit forms, convert satang -> THB string.
  const [amountDigits, setAmountDigits] = useState(() => {
    const n = transferPair?.outTx?.amount ?? initialData?.amount ?? 0;
    return n ? formatMoneyInputFromSatang(Math.abs(Number(n))) : "";
  });

  // Keep amount field synced when the edited record changes.
  useEffect(() => {
    if (!isEditMode) return;
    if (isSplitMode) return; // split uses splitTotalDigits instead
    const n = transferPair?.outTx?.amount ?? initialData?.amount ?? 0;
    setAmountDigits(n ? formatMoneyInputFromSatang(Math.abs(Number(n))) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, initialData?.id]);

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

  // ===== split group (edit / manual) =====
  const splitGroupTransactions = useMemo(() => {
    const gid = String(initialData?.splitGroupId || "").trim();
    if (!gid) return [];
    return (state.transactions || []).filter((t) => String(t?.splitGroupId || "").trim() === gid && !t?.isTransfer);
  }, [initialData?.splitGroupId, state.transactions]);

  const isEditingSplitGroup = useMemo(() => {
    if (!isEditMode) return false;
    if (initialData?.isTransfer) return false;
    const gid = String(initialData?.splitGroupId || "").trim();
    if (!gid) return false;
    const childCount = (splitGroupTransactions || []).filter((t) => !t?.isSplitParent).length;
    return childCount >= 2;
  }, [isEditMode, initialData?.isTransfer, initialData?.splitGroupId, splitGroupTransactions.length]);

  const makeEmptySplitLine = () => ({
    txId: "",
    amountDigits: "",
    categoryId: "",
    lineNote: "",
  });

  const [isSplitMode, setIsSplitMode] = useState(isEditingSplitGroup);
  const [splitLabel, setSplitLabel] = useState(String(initialData?.splitLabel || ""));

  const [splitLines, setSplitLines] = useState(() => {
    if (isEditingSplitGroup && splitGroupTransactions.length) {
      const sorted = [...splitGroupTransactions].filter((t) => !t?.isSplitParent).sort((a, b) => {
        const ai = Number(a?.splitIndex || 0);
        const bi = Number(b?.splitIndex || 0);
        if (ai && bi) return ai - bi;
        return (b?.amount || 0) - (a?.amount || 0);
      });
      return sorted.map((t) => ({
        txId: String(t?.id || ""),
        amountDigits: t?.amount != null ? formatMoneyInputFromSatang(Math.abs(Number(t.amount))) : "",
        categoryId: String(t?.category || ""),
        lineNote: String(t?.note || ""),
      }));
    }
    // new / non-split edit: start with 2 lines to encourage splitting
    const seed = initialData && !initialData?.isTransfer ? {
      txId: String(initialData?.id || ""),
      amountDigits: initialData?.amount != null ? formatMoneyInputFromSatang(Math.abs(Number(initialData.amount))) : "",
      categoryId: String(initialData?.category || ""),
      lineNote: String(initialData?.note || ""),
    } : makeEmptySplitLine();
    return [seed, makeEmptySplitLine()];
  });

  // Keep split states synced when switching editing target
  useEffect(() => {
    if (type === "transfer" || type === "credit_payment") {
      setIsSplitMode(false);
      return;
    }
    if (!isEditMode) return;

    if (isEditingSplitGroup) {
      setIsSplitMode(true);
      const sorted = [...splitGroupTransactions].filter((t) => !t?.isSplitParent).sort((a, b) => {
        const ai = Number(a?.splitIndex || 0);
        const bi = Number(b?.splitIndex || 0);
        if (ai && bi) return ai - bi;
        return (b?.amount || 0) - (a?.amount || 0);
      });
      const parentInGroup = (splitGroupTransactions || []).find((t) => !!t?.isSplitParent);
      setSplitLabel(String(parentInGroup?.splitLabel || sorted?.[0]?.splitLabel || initialData?.splitLabel || ""));
      setSplitLines(
        sorted.map((t) => ({
          txId: String(t?.id || ""),
          amountDigits: t?.amount != null ? formatMoneyInputFromSatang(Math.abs(Number(t.amount))) : "",
          categoryId: String(t?.category || ""),
          lineNote: String(t?.note || ""),
        }))
      );
    } else {
      setSplitLabel(String(initialData?.splitLabel || ""));
      setSplitLines([
        {
          txId: String(initialData?.id || ""),
          amountDigits: initialData?.amount != null ? formatMoneyInputFromSatang(Math.abs(Number(initialData.amount))) : "",
          categoryId: String(initialData?.category || ""),
          lineNote: String(initialData?.note || ""),
        },
        makeEmptySplitLine(),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, initialData?.id, isEditingSplitGroup, type]);

  const splitTotalNumber = useMemo(() => {
    if (!isSplitMode) return 0;
    return (splitLines || []).reduce((sum, l) => sum + parseMoneyToSatang(l?.amountDigits || ""), 0);
  }, [isSplitMode, splitLines]);

  const splitTotalDigits = useMemo(() => {
    if (!isSplitMode) return amountDigits;
    return splitTotalNumber ? formatMoneyInputFromSatang(splitTotalNumber) : "";
  }, [isSplitMode, splitTotalNumber, amountDigits]);

  const updateSplitLine = (index, patch) => {
    setSplitLines((ls) => (ls || []).map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addSplitLine = () => setSplitLines((ls) => [...(ls || []), makeEmptySplitLine()]);

  const removeSplitLine = (index) => {
    setSplitLines((ls) => {
      const next = (ls || []).filter((_, i) => i !== index);
      return next.length ? next : [makeEmptySplitLine(), makeEmptySplitLine()];
    });
  };

  const toggleSplitMode = () => {
    if (type === "transfer" || type === "credit_payment") return;
    setIsSplitMode((prev) => {
      const next = !prev;
      if (next) {
        // turning ON: seed first line from current single tx fields (when possible)
        setCategoryId("");
        setSplitLines((ls) => {
          const curr = Array.isArray(ls) && ls.length ? ls : [makeEmptySplitLine(), makeEmptySplitLine()];
          const first = curr[0] || makeEmptySplitLine();
          const seededFirst = {
            ...first,
            txId: first.txId || (isEditMode ? String(initialData?.id || "") : ""),
            amountDigits: first.amountDigits || amountDigits || "",
            categoryId: first.categoryId || String(categoryId || ""),
            lineNote: first.lineNote || "",
          };
          const second = curr[1] || makeEmptySplitLine();
          return [seededFirst, second, ...curr.slice(2)];
        });
      } else {
        // turning OFF: pull back to single tx from first line
        const first = (splitLines || [])[0];
        if (first) {
          if (String(first.amountDigits || "").trim()) setAmountDigits(String(first.amountDigits));
          if (String(first.categoryId || "").trim()) setCategoryId(String(first.categoryId));
          if (String(first.lineNote || "").trim()) setNote(String(first.lineNote));
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (type === "transfer" || type === "credit_payment") {
      setIsSplitMode(false);
    }
  }, [type]);

  const amountNumber = useMemo(() => parseMoneyToSatang(amountDigits), [amountDigits]);

  // ===== budget hint for manual expense =====
  const monthKey = useMemo(() => toMonthKey(date), [date]);

  const spentMap = useMemo(
    () => calcSpentByCategoryInMonth(state.transactions || [], monthKey),
    [state.transactions, monthKey]
  );

  const budgetHint = useMemo(() => {
    if (isSplitMode) return "";
    if (type !== "expense") return "";
    if (!categoryId) return "";
    const b = getBudget(state.budgets || [], monthKey, categoryId);
    if (!b || !b.limit) return "";
    const spent = spentMap.get(categoryId) || 0;
    const next = spent + amountNumber;
    const pct = Math.round((next / b.limit) * 100);
    if (pct >= b.alertPct) return `⚠️ งบ ${formatCurrency(b.limit)} • ใช้แล้ว ${formatCurrency(next)} (${pct}%)`;
    return `งบ ${formatCurrency(b.limit)} • ใช้แล้ว ${formatCurrency(next)} (${pct}%)`;
  }, [isSplitMode, type, categoryId, state.budgets, monthKey, spentMap, amountNumber]);

  // ===== scan queue =====
  const fileInputRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [queue, setQueue] = useState([]); // queue items
  const [expandedId, setExpandedId] = useState(null);

  // scan batch
  const scanBatchIdRef = useRef(0);
  const [dupDecisionOpen, setDupDecisionOpen] = useState(false);
const existingRefSet = useMemo(() => {
    const set = new Set();
    for (const t of state.transactions || []) {
      const r = String(t.ref || "").trim();
      if (r) set.add(r);
    }
    return set;
  }, [state.transactions]);

  const expenseCats = categories.expense || [];
  const incomeCats = categories.income || [];

  // ✅ กันการสร้าง category ซ้ำใน "batch scan" เดียวกัน
  const createdCatRef = useRef({ expense: new Map(), income: new Map() });

  // ====== merchant/category memory (from history) ======
  const categoryMemory = useMemo(() => {
    const txs = state.transactions || [];

    const merchantScores = new Map(); // `${type}|${merchantKey}` -> Map(catId->score)
    const digitsScores = new Map(); // `${type}|${lastDigitsKey}` -> Map(catId->score)

    const addScore = (map, key, catId, w = 1) => {
      if (!key || !catId) return;
      if (!map.has(key)) map.set(key, new Map());
      const m = map.get(key);
      m.set(catId, (m.get(catId) || 0) + (Number.isFinite(w) ? w : 1));
    };

    const pickBest = (map, key) => {
      const m = map.get(key);
      if (!m) return "";
      let best = "";
      let bestV = -1;
      for (const [cat, v] of m.entries()) {
        if (v > bestV) {
          bestV = v;
          best = cat;
        }
      }
      return best;
    };

    for (const t of txs) {
      const txType = t?.type === "income" ? "income" : t?.type === "expense" ? "expense" : "";
      if (!txType) continue;

      const catId = String(t?.category || "").trim();
      if (!catId) continue;

      const amt = Math.abs(Number(t?.amount) || 0) || 1;

      const merchantText = String(t?.merchant || extractMerchantFromNote(t?.note) || "").trim();
      const mKey = normalizeMerchantKey(merchantText);
      if (mKey) addScore(merchantScores, `${txType}|${mKey}`, catId, amt);

      const dRaw =
        digitsOnly(t?.counterparty_digits) ||
        digitsOnly(t?.to_account) ||
        digitsOnly(t?.from_account) ||
        digitsOnly(t?.toAccount) ||
        digitsOnly(t?.fromAccount) ||
        "";

      if (dRaw && dRaw.length >= 4) {
        const dKey = dRaw.slice(-6);
        addScore(digitsScores, `${txType}|${dKey}`, catId, amt);
      }
    }

    const existsInList = (txType, catId, expenseCats2, incomeCats2) => {
      if (!catId) return false;
      const list = txType === "income" ? incomeCats2 : expenseCats2;
      return list.some((c) => c.id === catId);
    };

    const suggestCategoryId = (txType, merchant, fromDigits, toDigits, expenseCats2, incomeCats2) => {
      if (txType !== "expense" && txType !== "income") return "";
      const mKey = normalizeMerchantKey(merchant);
      const d = digitsOnly(toDigits || fromDigits);
      const dKey = d && d.length >= 4 ? d.slice(-6) : "";

      if (mKey) {
        const c1 = pickBest(merchantScores, `${txType}|${mKey}`);
        if (existsInList(txType, c1, expenseCats2, incomeCats2)) return c1;
      }

      if (dKey) {
        const c2 = pickBest(digitsScores, `${txType}|${dKey}`);
        if (existsInList(txType, c2, expenseCats2, incomeCats2)) return c2;
      }

      return "";
    };

    return { suggestCategoryId };
  }, [state.transactions]);

  const cleanupQueuePreviews = () => {
    for (const it of queue) {
      // Only revoke in-memory previews. Persisted (blobStore) URLs must NOT be revoked here,
      // otherwise attachments will break later when viewing Inbox/Transactions.
      if (it?.previewUrlSource === "temp" && it.previewUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch {
          // ignore
        }
      }
    }
  };

  const clearQueue = () => {
    cleanupQueuePreviews();
    setQueue([]);
    setExpandedId(null);
    setScanStatus("");
    setDupDecisionOpen(false);
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

  // Apply derived automation patch onto a queue item patch, while keeping fields consistent.
  const applyAutomationToQueuePatch = (basePatch, autoPatch) => {
    let next = { ...basePatch, ...(autoPatch || {}) };

    const t = next.txType;
    const defaultAcc = accounts?.[0]?.id || "";

    // Normalize based on type
    if (t === "transfer" || t === "credit_payment") {
      next.categoryId = "transfer";
      next.splitByCategory = false;
      next.groups = [];
      next.fromAccountId = next.fromAccountId || next.accountId || defaultAcc;
      next.toAccountId = next.toAccountId || defaultAcc;

      // credit_payment hint: prefer toAccount = credit, fromAccount = non-credit
      if (t === "credit_payment") {
        const credit = (accounts || []).find((a) => a?.type === "credit");
        const nonCredit = (accounts || []).find((a) => a?.type !== "credit");
        const toAcc = (accounts || []).find((a) => a?.id === next.toAccountId);
        const fromAcc = (accounts || []).find((a) => a?.id === next.fromAccountId);
        if (credit && toAcc?.type !== "credit") next.toAccountId = credit.id;
        if (nonCredit && fromAcc?.type === "credit") next.fromAccountId = nonCredit.id;
      }
    } else {
      // expense / income
      next.accountId = next.accountId || defaultAcc;
      if (t === "income") {
        next.splitByCategory = false;
        next.groups = [];
      }
      // Ensure categoryId exists at least to prevent blank UI
      if (!next.categoryId || next.categoryId === "transfer") {
        next.categoryId = ensureCategory(t === "income" ? "income" : "expense", "other");
      }
    }

    // Ignore inappropriate category in transfer types
    if (t === "transfer" || t === "credit_payment") next.categoryId = "transfer";

    return next;
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
      if (it?.previewUrlSource === "temp" && it?.previewUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((x) => x.id !== id);
    });
    if (expandedId === id) setExpandedId(null);
  };

  // Remove many queue items at once (used by inbox/duplicate flows)
  const removeQueueItems = (ids) => {
    const setIds = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
    if (!setIds.size) return;

    setQueue((prev) => {
      const next = [];
      for (const it of prev) {
        if (setIds.has(it.id)) {
          if (it?.previewUrlSource === "temp" && it?.previewUrl?.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(it.previewUrl);
            } catch {
              // ignore
            }
          }
          continue;
        }
        next.push(it);
      }
      return next;
    });

    if (expandedId && setIds.has(expandedId)) setExpandedId(null);
  };

  // ===== credit card payment helpers (manual/scan) =====
  const creditAccounts = useMemo(() => accounts.filter(isCreditAccount), [accounts]);
  const nonCreditAccounts = useMemo(() => accounts.filter((a) => !isCreditAccount(a)), [accounts]);

  const creditDebtById = useMemo(() => {
    const m = new Map();
    for (const a of creditAccounts) {
      const bal = calcAccountBalance(accounts, state.transactions || [], a.id);
      m.set(a.id, Math.max(0, -Number(bal || 0)));
    }
    return m;
  }, [creditAccounts, accounts, state.transactions]);

  const selectedToAcc = useMemo(() => accounts.find((a) => a.id === toAccountId) || null, [accounts, toAccountId]);
  const creditDebt = useMemo(() => {
    if (!selectedToAcc) return 0;
    if (!isCreditAccount(selectedToAcc)) return 0;
    return creditDebtById.get(selectedToAcc.id) || 0;
  }, [selectedToAcc, creditDebtById]);

  // auto-fix accounts when choose credit_payment
  useEffect(() => {
    if (type !== "credit_payment") return;

    const toAcc = accounts.find((a) => a.id === toAccountId) || null;
    const fromAcc = accounts.find((a) => a.id === fromAccountId) || null;

    const firstCredit = creditAccounts?.[0]?.id || "";
    const firstNonCredit = nonCreditAccounts?.[0]?.id || accounts?.[0]?.id || "";

    if (firstCredit && (!toAcc || !isCreditAccount(toAcc))) {
      setToAccountId(firstCredit);
    }
    if (firstNonCredit && fromAcc && isCreditAccount(fromAcc)) {
      setFromAccountId(firstNonCredit);
    }
  }, [type, accounts, creditAccounts, nonCreditAccounts, fromAccountId, toAccountId]);

  const applyPayFull = () => {
    if (!selectedToAcc || !isCreditAccount(selectedToAcc)) {
      showAlert?.("กรุณาเลือกบัญชีบัตรเครดิตก่อน");
      return;
    }
    if (!creditDebt || creditDebt <= 0) {
      showAlert?.("บัตรนี้ไม่มียอดค้างชำระ");
      return;
    }
    setAmountDigits(formatMoneyInputFromSatang(Math.abs(Number(creditDebt))));
    // เติม note แบบไม่ทับของเดิมถ้ามีแล้ว
    setNote((prev) => {
      const p = String(prev || "").trim();
      if (p) return p;
      return `ชำระบัตรเครดิต • ${selectedToAcc.name || "Credit Card"}`;
    });
  };

  const applyPayFullForQueue = (qid, toAccId) => {
    const debt = creditDebtById.get(toAccId) || 0;
    if (!debt || debt <= 0) return;
    updateQueueItem(qid, { amount: Math.round(debt), splitByCategory: false });
  };

  // ✅ เปลี่ยนประเภทใน Queue (หลัง scan)
  // ✅ รองรับ credit_payment
  const handleQueueTypeChange = (qid, nextType) => {
    setQueue((prev) =>
      prev.map((x) => {
        if (x.id !== qid) return x;

        const fallbackAcc = accounts?.[0]?.id || "";
        const merchant = String(x.merchant || x.note || "").trim();
        const fromDigits = String(x.fromDigits || "").trim();
        const toDigits = String(x.toDigits || "").trim();

        if (nextType === "transfer") {
          return {
            ...x,
            txType: "transfer",
            splitByCategory: false,
            groups: [],
            categoryId: "transfer",
            fromAccountId: x.fromAccountId || x.accountId || fallbackAcc,
            toAccountId: x.toAccountId || fallbackAcc,
            suggestedCategoryId: "",
            suggestedReason: "",
          };
        }

        if (nextType === "credit_payment") {
          const pickedFrom =
            (!x.fromAccountId || isCreditAccount(accounts.find((a) => a.id === x.fromAccountId))) &&
            nonCreditAccounts?.[0]?.id
              ? nonCreditAccounts[0].id
              : x.fromAccountId || x.accountId || nonCreditAccounts?.[0]?.id || fallbackAcc;

          const pickedTo =
            isCreditAccount(accounts.find((a) => a.id === x.toAccountId)) && x.toAccountId
              ? x.toAccountId
              : creditAccounts?.[0]?.id || x.toAccountId || fallbackAcc;

          return {
            ...x,
            txType: "credit_payment",
            splitByCategory: false,
            groups: [],
            categoryId: "transfer",
            fromAccountId: pickedFrom,
            toAccountId: pickedTo,
            accountId: x.accountId || pickedFrom || fallbackAcc,
            suggestedCategoryId: "",
            suggestedReason: "",
            note: x.note || x.merchant ? x.note : "ชำระบัตรเครดิต",
          };
        }

        // expense/income
        const suggested =
          categoryMemory?.suggestCategoryId?.(nextType, merchant, fromDigits, toDigits, expenseCats, incomeCats) || "";

        let nextCategoryId = suggested || x.categoryId || "";
        if (!nextCategoryId || nextCategoryId === "transfer") {
          nextCategoryId = ensureCategory(nextType, "other");
        }

        // auto pick single accountId by best match digits
        const candFrom = bestMatchAccountCandidate(accounts, fromDigits);
        const candTo = bestMatchAccountCandidate(accounts, toDigits);

        let pickedAccountId = "";
        if (candFrom.score === 0 && candTo.score === 0) {
          pickedAccountId = x.accountId || x.fromAccountId || x.toAccountId || fallbackAcc;
        } else if (candFrom.score > candTo.score) {
          pickedAccountId = candFrom.id;
        } else if (candTo.score > candFrom.score) {
          pickedAccountId = candTo.id;
        } else {
          pickedAccountId = candFrom.id || candTo.id || x.accountId || x.fromAccountId || fallbackAcc;
        }

        return {
          ...x,
          txType: nextType,
          splitByCategory: false,
          groups: nextType === "expense" ? x.groups : [],
          categoryId: nextCategoryId,
          accountId: pickedAccountId || fallbackAcc,
          suggestedCategoryId: suggested || "",
          suggestedReason: suggested
            ? merchant
              ? `จำจากร้านเดิม: ${merchant}`
              : toDigits || fromDigits
              ? `จำจากเลขเดิม: ${String(toDigits || fromDigits).slice(-6)}`
              : "จำจากประวัติ"
            : "",
        };
      })
    );
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

    const batchId = Date.now();
    scanBatchIdRef.current = batchId;

    const batchRefSet = new Set(existingRefSet);
    // ✅ Keep a light pool of already-scanned (same batch) items for fuzzy duplicate detection
    const batchFuzzyPool = [];

    try {
      for (const file of files) {
        const qid = generateId();
        // Persist attachment in IndexedDB (offline-first)
        const attachmentId = `att_${qid}`;

        // Provide immediate preview while we persist
        const tmpUrl = URL.createObjectURL(file);
        let previewUrl = tmpUrl;
        let previewUrlSource = "temp"; // temp = in-memory object URL, idb = persisted (blobStore)

        try {
          await putBlob(attachmentId, file);
          const persistedUrl = await getBlobUrl(attachmentId);
          if (persistedUrl) {
            previewUrl = persistedUrl;
            previewUrlSource = "idb";
            try {
              URL.revokeObjectURL(tmpUrl);
            } catch {
              // ignore
            }
          }
        } catch {
          // If IndexedDB fails (private mode / quota), keep in-memory preview.
        }

        setQueue((prev) => [
          ...prev,
          {
            id: qid,
            batchId,
            fileName: file.name,
            previewUrl,
            previewUrlSource,
            attachmentId,
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
            fromDigits: "",
            toDigits: "",
            suggestedCategoryId: "",
            suggestedReason: "",
          },
        ]);

        try {
          setScanStatus(`กำลังอ่าน: ${file.name}`);
          const result = await scanReceiptOpenAI(file, {
            onStatus: (s) => setScanStatus(s || `กำลังอ่าน: ${file.name}`),
          });

          const aiTxType =
            result?.tx_type === "transfer" ? "transfer" : result?.tx_type === "income" ? "income" : "expense";

          const amount =
            typeof result?.amount === "number" ? result.amount : result?.amount != null ? Number(result.amount) : null;

          const amountSatang = amount != null ? parseMoneyToSatang(amount) : null;

          const d = result?.date ? String(result.date).slice(0, 10) : toISODate(new Date());

          const merchant = String(result?.merchant || "").trim();
          const noteText = String(result?.note || "").trim();
          const mergedNote = noteText || merchant || "";

          const evidenceText = String(result?.evidence || "").trim();

          const contextText = `${merchant} ${noteText} ${evidenceText}`.trim();
          const rref = String(result?.ref || "").trim();

          const fromDigits = digitsOnly(result?.from_account);
          const toDigits = digitsOnly(result?.to_account);

          // map account ids by digits (support both account digits and card digits)
          const matchedFromId = bestMatchAccountId(accounts, fromDigits);
          const matchedToId = bestMatchAccountId(accounts, toDigits);
          const matchedFromAcc = matchedFromId ? accounts.find((a) => a.id === matchedFromId) : null;
          const matchedToAcc = matchedToId ? accounts.find((a) => a.id === matchedToId) : null;

          const hasTwoSides = !!(matchedFromId && matchedToId && matchedFromId !== matchedToId);
// ===== Robust doc type + tx type resolution (Hybrid Pipeline) =====
const rawDocType = String(result?.doc_type ?? result?.docType ?? "").toLowerCase().trim();

const hasLineItems =
  Array.isArray(result?.items) &&
  result.items.some((it) => {
    const n = String(it?.name || it?.title || it?.desc || "").trim();
    const amt =
      Number(it?.line_total) ||
      Number(it?.total) ||
      Number(it?.amount) ||
      Number(it?.lineTotal) ||
      0;
    return !!n && Number.isFinite(amt) && amt > 0;
  });

// Prefer model doc_type, but if we clearly see priced line items, treat it as a receipt.
const docType = (() => {
  if (hasLineItems) return "receipt";
  if (rawDocType) return rawDocType;
  if (aiTxType === "transfer" || aiTxType === "credit_payment") return "transfer_slip";
  return "unknown";
})();

// ===== Resolve final tx type (conservative; prevents misclassifying receipts as transfers) =====
let finalTxType = aiTxType;

if (docType === "receipt") {
  // Receipts are not internal transfers. Default to expense unless model strongly says income.
  finalTxType = aiTxType === "income" ? "income" : "expense";
} else if (docType === "transfer_slip" || docType === "bill_payment") {
  // "transfer" is only for INTERNAL movement between user's accounts.
  if (matchedFromId && matchedToId && matchedFromId !== matchedToId) {
    const isCreditPay =
      (matchedToAcc && isCreditAccount(matchedToAcc) && matchedFromAcc && !isCreditAccount(matchedFromAcc)) ||
      looksLikeCreditPaymentText(contextText);

    finalTxType = isCreditPay ? "credit_payment" : "transfer";
  } else if (matchedFromId && !matchedToId) {
    // outgoing payment to external counterparty
    finalTxType = "expense";
  } else if (!matchedFromId && matchedToId) {
    // incoming money into a known account
    finalTxType = "income";
  } else {
    // unknown accounts: slips are more likely to be expenses than internal transfers
    finalTxType = aiTxType === "income" ? "income" : "expense";
  }
} else {
  // Unknown: keep lightweight heuristics, but never allow transfer if we have line items.
  let tmp = aiTxType;

  if (
    looksLikeCreditPaymentText(contextText) &&
    matchedToAcc &&
    isCreditAccount(matchedToAcc) &&
    matchedFromAcc &&
    !isCreditAccount(matchedFromAcc)
  ) {
    tmp = "credit_payment";
  } else if (aiTxType !== "income" && hasTwoSides && looksLikeTransferText(contextText)) {
    tmp = "transfer";
  }

  finalTxType = enhanceScannedTxType({
    currentType: tmp,
    aiTxType,
    matchedFromId,
    matchedToId,
    matchedFromAcc,
    matchedToAcc,
    contextText,
  });

  if (hasLineItems && (finalTxType === "transfer" || finalTxType === "credit_payment")) {
    finalTxType = "expense";
  }
}

// ===== Decide which account fields to populate =====
let detectedAccountId = "";
let detectedFromId = "";
let detectedToId = "";

if (finalTxType === "transfer" || finalTxType === "credit_payment") {
  detectedFromId = matchedFromId || nonCreditAccounts?.[0]?.id || accounts?.[0]?.id || "";
  detectedToId = matchedToId || creditAccounts?.[0]?.id || accounts?.[0]?.id || "";

  // If credit_payment but we couldn't match from/to properly, fallback to "best" kinds
  if (finalTxType === "credit_payment") {
    const fromAcc = accounts.find((a) => a.id === detectedFromId) || null;
    const toAcc = accounts.find((a) => a.id === detectedToId) || null;
    const fallbackFrom = nonCreditAccounts?.[0]?.id || accounts?.[0]?.id || "";
    const fallbackTo = creditAccounts?.[0]?.id || detectedToId || "";

    if (!fromAcc || isCreditAccount(fromAcc)) detectedFromId = fallbackFrom;
    if (!toAcc || !isCreditAccount(toAcc)) detectedToId = fallbackTo;
  }
} else {
  detectedAccountId = matchedFromId || matchedToId || accountId || accounts?.[0]?.id || "";
}

// Hybrid guardrail:
// - transfer slips / bill payments must NOT produce line-item breakdown
// - receipts MAY produce line-item breakdown (items may still be empty)
let scannedItems = Array.isArray(result?.items) ? result.items : [];
if (
  docType === "transfer_slip" ||
  docType === "bill_payment" ||
  finalTxType === "transfer" ||
  finalTxType === "credit_payment"
) {
  scannedItems = [];
}


          const fallbackKey =
            sanitizeCategoryKey(result?.category) || sanitizeCategoryKey(result?.category_key) || "other";

          let groups = [];
          let primaryKey = fallbackKey;

          // ✅ Receipt items (expense): create per-item lines (ignore 0฿ promo lines)
          if (finalTxType === "expense") {
            const lines = splitReceiptItemsToLines("expense", scannedItems, contextText, fallbackKey);
            if (lines.length) primaryKey = lines[0]?.key || fallbackKey;

            groups = (lines || [])
              .map((ln) => {
                const catId = ensureCategory("expense", ln.key || "other");
                return {
                  key: ln.key || "other",
                  categoryId: catId,
                  amount: parseMoneyToSatang(ln.amount),
                  note: String(ln.name || "").trim(),
                };
              })
              .filter((g) => Number(g?.amount || 0) > 0);
          }

          // ✅ Income slips normally have no item lines
          if (finalTxType === "income") {
            primaryKey = fallbackKey;
            groups = [];
          }

          const groupSum = groups.reduce((s, g) => s + (Number(g.amount) || 0), 0);
          const aiTotal = amountSatang != null ? amountSatang : 0;
          let splitByCategory = finalTxType === "expense" && groups.length >= 2;

          const scanWarnings = [];
          const scanFlags = result?.flags || null;
          const scanConfidence = result?.confidence || null;

          if (scanFlags?.needs_human_review) scanWarnings.push("NEEDS_HUMAN_REVIEW");
          if (scanFlags?.has_zero_price_lines) scanWarnings.push("HAS_ZERO_PRICE_LINES");
          if (scanFlags?.has_discount_lines) scanWarnings.push("HAS_DISCOUNT_LINES");

          if (finalTxType === "expense" && (docType === "receipt" || docType === "unknown") && amountSatang != null && groupSum > 0) {
            const diff = Math.abs(groupSum - amountSatang);
            if (diff >= 200) scanWarnings.push("TOTAL_MISMATCH");
          }


          let detectedCategoryId = "";
          if (finalTxType === "expense") detectedCategoryId = ensureCategory("expense", primaryKey || "other");
          if (finalTxType === "income") detectedCategoryId = ensureCategory("income", primaryKey || "other");

          let suggestedCategoryId = "";
          let suggestedReason = "";
          if ((finalTxType === "expense" || finalTxType === "income") && !splitByCategory) {
            // Prefer Merchant Library if we already learned a strong mapping
            try {
              const merchants = state?.merchants || [];
              const canon = resolveMerchantCanonical(merchant || mergedNote, merchants);
              const md = deriveMerchantAutofillPatch(
                {
                  merchant: canon || merchant || mergedNote,
                  txType: finalTxType,
                  categoryId: "other",
                  accountId: "",
                },
                merchants
              );

              const list = finalTxType === "income" ? incomeCats : expenseCats;
              const mdCat = String(md?.categoryId || "");
              if (mdCat && list?.some((c) => String(c?.id) === mdCat)) {
                suggestedCategoryId = mdCat;
                suggestedReason = canon ? `Merchant Library: ${canon}` : "Merchant Library";
                detectedCategoryId = mdCat;
              }
            } catch {
              // ignore
            }

            if (suggestedCategoryId) {
              // already filled by Merchant Library
            } else {
            const sug =
              categoryMemory?.suggestCategoryId?.(
                finalTxType,
                merchant || mergedNote,
                fromDigits,
                toDigits,
                expenseCats,
                incomeCats
              ) || "";
            if (sug) {
              suggestedCategoryId = sug;
              suggestedReason = merchant
                ? `จำจากร้านเดิม: ${merchant}`
                : toDigits || fromDigits
                ? `จำจากเลขเดิม: ${String(toDigits || fromDigits).slice(-6)}`
                : "จำจากประวัติ";
              detectedCategoryId = sug;
            }
            }
          }

          const dupByRef = rref ? batchRefSet.has(rref) || isDuplicateByRef(state.transactions || [], rref) : false;
          if (rref) batchRefSet.add(rref);


          const pickedAmount = (() => {
            const a = amountSatang != null && amountSatang > 0 ? amountSatang : null;
            const g = groupSum && groupSum > 0 ? groupSum : null;
            const t = aiTotal && aiTotal > 0 ? aiTotal : null;

            if (finalTxType === "transfer" || finalTxType === "credit_payment") return a ?? t ?? g;
            if (splitByCategory) return a ?? g ?? t;
            return a ?? g ?? t;
          })();

          let patch = {
            status: "ready",
            txType: finalTxType,
            amount: pickedAmount,
            date: d,
            note: mergedNote,
            merchant,
            ref: rref,
            categoryId: finalTxType === "transfer" || finalTxType === "credit_payment" ? "transfer" : detectedCategoryId,
            accountId: detectedAccountId || (accounts?.[0]?.id || ""),
            fromAccountId: detectedFromId || (accounts?.[0]?.id || ""),
            toAccountId: detectedToId || (accounts?.[0]?.id || ""),
            duplicate: dupByRef,
            includeDuplicate: !dupByRef,
            evidence: evidenceText.slice(0, 240),
            docType,
            scanWarnings,
            scanMeta: {
              docType,
              flags: scanFlags || null,
              confidence: scanConfidence || null,
              model: result?._model || null,
              endpointUsed: result?._endpointUsed || null,
            },
            items: scannedItems,
            groups,
            splitByCategory: finalTxType === "transfer" || finalTxType === "credit_payment" ? false : splitByCategory,
            error: "",
            fromDigits,
            toDigits,
            suggestedCategoryId,
            suggestedReason,
          };

          // ✅ Ensure split groups have a stable group id + label for Inbox & UI grouping
          if (
            patch.splitByCategory &&
            Array.isArray(patch.groups) &&
            patch.groups.length >= 2
          ) {
            patch.splitGroupId = String(patch.splitGroupId || "").trim() || generateSplitGroupId();
            patch.splitLabel =
              String(patch.splitLabel || merchant || mergedNote || "Split")
                .trim()
                .slice(0, 80) || "Split";
          }

          // ✅ Advanced automation rules: run after scan and auto-fill fields
          try {
            const bankText = `${fromName || ""} ${toName || ""}`.trim();
            const autoCtx = {
              text: `${merchant || ""} ${mergedNote || ""} ${bankText} ${evidenceText || ""}`,
              rawText: evidenceText || "",
              merchant,
              note: mergedNote,
              evidence: evidenceText,
              ref: rref,
              amount: patch.amount,
              fromDigits,
              toDigits,
            };
            const autoPatch = deriveAutomationPatch(state?.rules || [], autoCtx);
            if (autoPatch && Object.keys(autoPatch).length) {
              patch = applyAutomationToQueuePatch(patch, autoPatch);
            }
          } catch {
            // ignore automation errors
          }

          // ✅ Smart Merchant Dictionary
          // - normalize merchant (e.g., "7-11 (branch...)" -> "7-ELEVEN")
          // - optionally auto-fill category/account from learned prefs
          try {
            const merchants = state?.merchants || [];
            const canon = resolveMerchantCanonical(patch.merchant || merchant || mergedNote, merchants);
            if (canon) patch = { ...patch, merchant: canon };

            const hadStrongAccountMatch =
              !!bestMatchAccountId(accounts, fromDigits) ||
              !!bestMatchAccountId(accounts, toDigits) ||
              !!accountId;
            const accountForAutofill = !hadStrongAccountMatch ? "" : patch.accountId;

            const mdPatch = deriveMerchantAutofillPatch(
              {
                merchant: patch.merchant,
                txType: patch.txType,
                categoryId: patch.categoryId,
                accountId: accountForAutofill,
              },
              merchants
            );

            const beforeCat = patch.categoryId;
            const beforeAcc = patch.accountId;
            patch = { ...patch, ...mdPatch };

            // show a hint only when the dictionary actually fills something
            if (
              (mdPatch?.categoryId && mdPatch.categoryId !== beforeCat) ||
              (mdPatch?.accountId && mdPatch.accountId !== beforeAcc)
            ) {
              patch.suggestedCategoryId = mdPatch?.categoryId || patch.suggestedCategoryId;
              patch.suggestedReason = patch.merchant ? `Merchant Library: ${patch.merchant}` : "Merchant Library";
            }
          } catch {
            // ignore merchant dictionary errors
          }

          // ✅ Fuzzy duplicate detection (date proximity + amount closeness + merchant/ref/digits)
          try {
            const pool = [...(state.transactions || []), ...batchFuzzyPool];
            const fuzzy = findFuzzyDuplicate(pool, {
              ...patch,
              id: qid,
              // normalize possible reference keys
              ref: patch.ref || rref,
              referenceId: patch.ref || rref,
            });

            const dupFuzzy = !!fuzzy?.isDuplicate;
            const finalDup = !!dupByRef || dupFuzzy;

            patch = {
              ...patch,
              duplicate: finalDup,
              includeDuplicate: !finalDup,
              duplicateInfo: finalDup
                ? dupByRef
                  ? { kind: "ref", matchId: fuzzy?.matchId || null, score: 1, reasons: ["ref exact match"] }
                  : {
                      kind: "fuzzy",
                      matchId: fuzzy?.matchId || null,
                      score: fuzzy?.score || 0,
                      reasons: fuzzy?.reasons || [],
                    }
                : null,
            };
          } catch {
            // ignore fuzzy errors
          }

          // add to batch pool so next files can fuzzy-match within the same batch
          batchFuzzyPool.push({
            id: qid,
            txType: patch.txType,
            type: patch.txType,
            amount: patch.amount,
            date: patch.date,
            merchant: patch.merchant,
            note: patch.note,
            ref: patch.ref,
            referenceId: patch.ref,
            accountId: patch.accountId,
            fromAccountId: patch.fromAccountId,
            toAccountId: patch.toAccountId,
            fromDigits: patch.fromDigits,
            toDigits: patch.toDigits,
            isTransfer: patch.txType === "transfer" || patch.txType === "credit_payment",
          });

          updateQueueItem(qid, patch);
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
    // ✅ Allow "Save now" as long as there is at least one ready item.
    // Duplicates will be blocked until the user explicitly confirms.
    return (queue || []).some((q) => q.status === "ready" && q.amount && q.amount > 0);
  }, [queue]);

  const canSendToInbox = useMemo(() => {
    return (queue || []).some((q) => q.status === "ready");
  }, [queue]);

  
  const duplicateReadyCount = useMemo(() => {
    return (queue || []).filter((q) => q.status === "ready" && q.duplicate).length;
  }, [queue]);

  const sendQueueToInbox = () => {
    const ready = (queue || []).filter((q) => q.status === "ready");
    if (!ready.length) {
      showAlert?.("ไม่มีรายการที่พร้อมส่งเข้า Inbox");
      return false;
    }

    const createdAt = Date.now();
    const serializable = ready.map((q) => {
      const { previewUrl, previewUrlSource, batchId, status, error, ...rest } = q || {};
      const type = rest?.type || rest?.txType || "expense";
      const referenceId = rest?.referenceId || rest?.ref || "";
      return {
        ...rest,
        id: rest?.id || generateId(),
        createdAt,
        status: "pending",
        type,
        referenceId,
      };
    });

    addScanInboxItems(serializable);
    clearQueue();
    setDupDecisionOpen(false);
    navigate("inbox");
    showAlert?.(`ส่งเข้า Inbox ${serializable.length} รายการแล้ว`);
    return true;
  };

  // Send only duplicate-ready items to Inbox (used when user chose "Save now" but wants to handle duplicates later)
  const sendDuplicateQueueToInbox = () => {
    const dups = (queue || []).filter((q) => q.status === "ready" && !!q.duplicate);
    if (!dups.length) {
      showAlert?.("ไม่มีรายการซ้ำให้ส่งเข้า Inbox");
      return false;
    }

    const createdAt = Date.now();
    const serializable = dups.map((q) => {
      const { previewUrl, previewUrlSource, batchId, status, error, ...rest } = q || {};
      const type = rest?.type || rest?.txType || "expense";
      const referenceId = rest?.referenceId || rest?.ref || "";
      return {
        ...rest,
        id: rest?.id || generateId(),
        createdAt,
        status: "pending",
        type,
        referenceId,
      };
    });

    addScanInboxItems(serializable);
    removeQueueItems(dups.map((q) => q.id));
    setDupDecisionOpen(false);
    navigate("inbox");
    showAlert?.(`ส่งรายการซ้ำเข้า Inbox ${serializable.length} รายการแล้ว`);
    return true;
  };

  const handlePostScanSaveNow = () => {
    if (duplicateReadyCount > 0) {
      // ✅ Save non-duplicates immediately, then ask what to do with duplicates.
      createTransactionsFromQueue({ scope: "nonDuplicates", duplicateMode: "includeAll", navigateToDashboard: false });
      setDupDecisionOpen(true);
      return;
    }
    createTransactionsFromQueue();
  };

  const handleDupDecision = (action) => {
    if (action === "send") {
      sendDuplicateQueueToInbox();
      return;
    }

    if (action === "skip") {
      const dupIds = (queue || []).filter((q) => q.status === "ready" && !!q.duplicate).map((q) => q.id);
      if (dupIds.length) removeQueueItems(dupIds);
      setDupDecisionOpen(false);
      showAlert?.(`ข้ามรายการซ้ำ ${dupIds.length} รายการแล้ว`);
      navigate("dashboard");
      return;
    }

    // default: save duplicates
    const ok = createTransactionsFromQueue({ scope: "duplicates", duplicateMode: "includeAll", navigateToDashboard: true });
    if (ok) setDupDecisionOpen(false);
  };

  const createTransactionsFromQueue = (
    {
      duplicateMode = "respect", // respect | includeAll | excludeAll
      scope = "all", // all | duplicates | nonDuplicates
      navigateToDashboard = true,
    } = {}
  ) => {
    let base = (queue || []).filter((q) => q.status === "ready" && q.amount && q.amount > 0);

    if (scope === "duplicates") base = base.filter((q) => !!q.duplicate);
    if (scope === "nonDuplicates") base = base.filter((q) => !q.duplicate);
    const ready = base.filter((q) => {
      if (duplicateMode === "includeAll") return true;
      if (duplicateMode === "excludeAll") return !q.duplicate;
      return !!q.includeDuplicate;
    });

    if (!ready.length) {
      if (scope === "duplicates") return showAlert?.("ไม่มีรายการซ้ำที่ต้องบันทึก");
      if (scope === "nonDuplicates") return showAlert?.("ไม่มีรายการที่ไม่ซ้ำให้บันทึก");
      return showAlert?.("ไม่มีรายการที่พร้อมสร้าง (หรือถูกติ๊กว่าเป็นรายการซ้ำ)");
    }

    for (const q of ready) {
      if (q.txType === "transfer" || q.txType === "credit_payment") {
        if (!q.fromAccountId || !q.toAccountId) return showAlert?.("ต้องเลือกบัญชีต้นทาง/ปลายทางให้ครบ");
        if (q.fromAccountId === q.toAccountId)
          return showAlert?.("ห้ามเลือกบัญชีต้นทางและปลายทางเป็นบัญชีเดียวกัน");

        if (q.txType === "credit_payment") {
          const fromAcc = accounts.find((a) => a.id === q.fromAccountId) || null;
          const toAcc = accounts.find((a) => a.id === q.toAccountId) || null;
          if (!toAcc || !isCreditAccount(toAcc)) return showAlert?.("ชำระบัตร: บัญชีปลายทางต้องเป็นบัตรเครดิต");
          if (fromAcc && isCreditAccount(fromAcc)) return showAlert?.("ชำระบัตร: บัญชีต้นทางควรเป็นบัญชีปกติ (ไม่ใช่บัตร)");
        }
      } else {
        if (!q.accountId) return showAlert?.("กรุณาเลือกบัญชีให้ครบ");

        if (q.txType === "expense" && q.splitByCategory && Array.isArray(q.groups) && q.groups.length) {
          // ✅ Ignore zero/invalid lines: only create split transactions for amount > 0
          const positives = q.groups
            .map((g) => ({ ...g, amount: Number(g.amount) || 0 }))
            .filter((g) => g.amount > 0);

          if (positives.length < 2) {
            return showAlert?.("Split จะสร้างเฉพาะบรรทัดที่ยอดมากกว่า 0 และต้องเหลืออย่างน้อย 2 บรรทัด");
          }

          for (const g of positives) {
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
      const baseNoteRaw = noteText || merchant || "Scan";

      const baseNote = appendEvidenceToNote(baseNoteRaw, q.evidence, 180);

      if (q.txType === "transfer" || q.txType === "credit_payment") {
        const transferId = generateTransferId();
        const kind = q.txType === "credit_payment" ? "credit_payment" : "transfer";
        const defaultNote =
          kind === "credit_payment"
            ? `ชำระบัตรเครดิต • ${(accounts.find((a) => a.id === q.toAccountId)?.name || "Credit Card").trim()}`
            : "Transfer";

        txs.push({
          id: generateId(),
          type: "expense",
          amount: Number(q.amount),
          category: "transfer",
          accountId: q.fromAccountId,
          date: d,
          note: baseNote || defaultNote,
          isTransfer: true,
          transferId,
          ref: q.ref || null,
          source: "scan",
          transferKind: kind,
          attachmentId: q.attachmentId || null,

          merchant: merchant || null,
          evidence: String(q.evidence || "").slice(0, 240) || null,
          from_account: String(q.fromDigits || "").trim() || null,
          to_account: String(q.toDigits || "").trim() || null,
          counterparty_digits: String(q.toDigits || q.fromDigits || "").trim() || null,
        });

        txs.push({
          id: generateId(),
          type: "income",
          amount: Number(q.amount),
          category: "transfer",
          accountId: q.toAccountId,
          date: d,
          note: baseNote || defaultNote,
          isTransfer: true,
          transferId,
          ref: q.ref || null,
          source: "scan",
          transferKind: kind,
          attachmentId: q.attachmentId || null,

          merchant: merchant || null,
          evidence: String(q.evidence || "").slice(0, 240) || null,
          from_account: String(q.fromDigits || "").trim() || null,
          to_account: String(q.toDigits || "").trim() || null,
          counterparty_digits: String(q.toDigits || q.fromDigits || "").trim() || null,
        });

        continue;
      }

      if (q.txType === "expense" && q.splitByCategory && Array.isArray(q.groups) && q.groups.length >= 2) {
        // ✅ Per-item split: create 1 parent transaction (total) + N child transactions (breakdown)
        // - ignores 0฿ promo lines (already filtered)
        // - budgets/reports count only children; parent is for UI only
        const groups = (q.groups || [])
          .map((g) => ({ ...g, amount: Number(g.amount) || 0 }))
          .filter((g) => g.amount > 0);

        // keep original order (OCR order); if splitIndex exists, respect it
        groups.sort((a, b) => {
          const ai = Number(a?.splitIndex || 0);
          const bi = Number(b?.splitIndex || 0);
          if (ai && bi && ai !== bi) return ai - bi;
          return 0;
        });

        const splitGroupId = String(q?.splitGroupId || "").trim() || generateSplitGroupId();
        const splitCount = groups.length;
        const groupLabel = String(q?.splitLabel || merchant || baseNoteRaw || "Split").trim().slice(0, 80) || "Split";

        const parentId = generateId();

        const childSum = groups.reduce((s, g) => s + (Number(g.amount) || 0), 0);
        let parentAmount = Number(q.amount) || 0;
        if (!parentAmount || parentAmount <= 0) parentAmount = childSum;

        // Try reconcile tiny rounding differences by adjusting the last line
        let diff = parentAmount - childSum;
        if (diff !== 0 && groups.length) {
          const last = groups[groups.length - 1];
          const nextAmt = (Number(last.amount) || 0) + diff;
          if (nextAmt > 0) {
            last.amount = nextAmt;
            diff = 0;
          }
        }
        // If still mismatch and we can't adjust safely, prefer childSum for consistent UI total
        if (diff !== 0) parentAmount = groups.reduce((s, g) => s + (Number(g.amount) || 0), 0);

        // ✅ Parent category for split receipts:
        // - If children have multiple categories → parent = "mixed" (UI-only parent)
        // - If children all same category → use that category
        const uniqueCats = Array.from(
          new Set(groups.map((g) => String(g?.categoryId || "").trim()).filter(Boolean))
        );
        const parentCategory = (uniqueCats.length > 1 ? ensureCategory("expense", "mixed") : uniqueCats[0]) ||
          String(q.categoryId || ensureCategory("expense", "mixed")).trim();

        // Parent (UI only)
        txs.push({
          id: parentId,
          type: "expense",
          amount: parentAmount,
          category: parentCategory,
          accountId: q.accountId,
          date: d,
          note: baseNote,
          isTransfer: false,
          transferId: null,
          ref: q.ref || null,
          source: "scan",
          attachmentId: q.attachmentId || null,

          splitGroupId,
          splitCount,
          splitLabel: groupLabel,
          isSplit: true,
          isSplitParent: true,

          merchant: merchant || null,
          evidence: String(q.evidence || "").slice(0, 240) || null,
          from_account: String(q.fromDigits || "").trim() || null,
          to_account: String(q.toDigits || "").trim() || null,
          counterparty_digits: String(q.toDigits || q.fromDigits || "").trim() || null,
        });

        // Children (real transactions)
        groups.forEach((g, idx) => {
          const itemName = String(g?.note || "").trim() || categoryNameFromKey(g.key);

          txs.push({
            id: generateId(),
            type: "expense",
            amount: Number(g.amount) || 0,
            category: g.categoryId,
            accountId: q.accountId,
            date: d,
            // ✅ Explicit item name for child line (also mirrored into note for compatibility)
            itemName,
            note: itemName,
            isTransfer: false,
            transferId: null,
            ref: null,
            source: "scan",
            attachmentId: q.attachmentId || null,

            splitGroupId,
            splitIndex: idx + 1,
            splitCount,
            splitLabel: groupLabel,
            isSplit: true,
            isSplitChild: true,
            splitParentId: parentId,

            merchant: merchant || null,
            evidence: String(q.evidence || "").slice(0, 240) || null,
            from_account: String(q.fromDigits || "").trim() || null,
            to_account: String(q.toDigits || "").trim() || null,
            counterparty_digits: String(q.toDigits || q.fromDigits || "").trim() || null,
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
        attachmentId: q.attachmentId || null,

        merchant: merchant || null,
        evidence: String(q.evidence || "").slice(0, 240) || null,
        from_account: String(q.fromDigits || "").trim() || null,
        to_account: String(q.toDigits || "").trim() || null,
        counterparty_digits: String(q.toDigits || q.fromDigits || "").trim() || null,
      });
    }

    bulkUpsertTransactions(txs, { navigateToDashboard });

    // ✅ Smart Merchant Dictionary: learn mapping from confirmed saved transactions
    try {
      for (const tx of txs) {
        const t = String(tx?.type || "").toLowerCase();
        if (t !== "expense" && t !== "income") continue;
        const m = String(tx?.merchant || "").trim();
        if (!m) continue;
        learnMerchant?.({ merchant: m, txType: t, categoryId: String(tx?.category || ""), accountId: String(tx?.accountId || "") });
      }
    } catch {
      // ignore
    }

    // ✅ remove only the queue items we actually saved (so duplicates can remain blocked/pending)
    removeQueueItems(ready.map((q) => q.id));

    showAlert?.(`บันทึก ${txs.length} รายการแล้ว`);
    return true;
  };

  // ===== manual save/delete =====
  const handleSaveManual = () => {
    const d = String(date || toISODate(new Date())).slice(0, 10);
    const noteText = String(note || "").trim();
    const refText = String(ref || "").trim();

    if (type === "transfer" || type === "credit_payment") {
      if (!amountNumber || amountNumber <= 0) return showAlert?.("กรุณาระบุจำนวนเงินให้ถูกต้อง");
      if (!fromAccountId || !toAccountId) return showAlert?.("กรุณาเลือกบัญชีต้นทางและปลายทาง");
      if (fromAccountId === toAccountId) return showAlert?.("บัญชีต้นทาง/ปลายทางต้องไม่ใช่บัญชีเดียวกัน");

      const fromAcc = accounts.find((a) => a.id === fromAccountId) || null;
      const toAcc = accounts.find((a) => a.id === toAccountId) || null;

      if (type === "credit_payment") {
        if (!creditAccounts.length) return showAlert?.("ยังไม่มีบัญชีประเภทบัตรเครดิตในระบบ");
        if (!toAcc || !isCreditAccount(toAcc)) return showAlert?.("ชำระบัตร: บัญชีปลายทางต้องเป็นบัตรเครดิต");
        if (fromAcc && isCreditAccount(fromAcc)) return showAlert?.("ชำระบัตร: บัญชีต้นทางควรเป็นบัญชีปกติ (ไม่ใช่บัตร)");
      }

      const transferId = transferPair?.outTx?.transferId || generateTransferId();
      const outId = transferPair?.outTx?.id || generateId();
      const inId = transferPair?.inTx?.id || generateId();

      const kind = type === "credit_payment" ? "credit_payment" : "transfer";
      const defaultNote =
        kind === "credit_payment"
          ? `ชำระบัตรเครดิต • ${(toAcc?.name || "Credit Card").trim()}`
          : "Transfer";

      bulkUpsertTransactions([
        {
          id: outId,
          type: "expense",
          amount: amountNumber,
          category: "transfer",
          accountId: fromAccountId,
          date: d,
          note: noteText || defaultNote,
          isTransfer: true,
          transferId,
          ref: String(ref || "").trim() || null,
          source: kind,
          transferKind: kind,
          attachmentId: initialAttachmentId || null,
        },
        {
          id: inId,
          type: "income",
          amount: amountNumber,
          category: "transfer",
          accountId: toAccountId,
          date: d,
          note: noteText || defaultNote,
          isTransfer: true,
          transferId,
          ref: String(ref || "").trim() || null,
          source: kind,
          transferKind: kind,
          attachmentId: initialAttachmentId || null,
        },
      ]);
      return;
    }

    // ✅ Split transactions (expense/income) - 1 parent + N children
    if (isSplitMode) {
      if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");

      const cleanedLines = (splitLines || [])
        .map((l) => ({
          txId: String(l?.txId || "").trim(),
          categoryId: String(l?.categoryId || "").trim(),
          amount: parseMoneyToSatang(l?.amountDigits),
          lineNote: String(l?.lineNote || "").trim(),
        }))
        .filter((l) => l.amount > 0 || l.categoryId || l.lineNote || l.txId);

      if (cleanedLines.length < 2) return showAlert?.("Split ต้องมีอย่างน้อย 2 บรรทัด (ยอดเงิน > 0)");
      for (const l of cleanedLines) {
        if (!l.categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่ให้ครบ (ในรายการ Split)");
        if (!Number.isFinite(l.amount) || l.amount <= 0) return showAlert?.("กรุณาระบุยอดเงินให้ถูกต้อง (ในรายการ Split)");
      }

      const splitGroupId = String(initialData?.splitGroupId || "").trim() || generateSplitGroupId();
      const splitCount = cleanedLines.length;
      const groupLabel = String(splitLabel || "").trim().slice(0, 80) || null;

      // existing group (for edit) may already have a parent
      const existingParent = (splitGroupTransactions || []).find((t) => !!t?.isSplitParent) || (initialData?.isSplitParent ? initialData : null);
      const parentId = String(existingParent?.id || "").trim() || (initialData?.isSplitParent ? String(initialData.id) : "") || generateId();

      const childrenTotal = cleanedLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      // ✅ For split groups, parent category is mixed if children span multiple categories
      const uniqueCats = Array.from(new Set(cleanedLines.map((l) => String(l?.categoryId || "").trim()).filter(Boolean)));
      const parentCategory = String(
        existingParent?.category ||
        (uniqueCats.length > 1 ? ensureCategory("expense", "mixed") : uniqueCats[0]) ||
        ensureCategory("expense", "mixed")
      ).trim() || "mixed";

      const parentTx = {
        id: parentId,
        type: type === "income" ? "income" : "expense",
        amount: childrenTotal,
        category: parentCategory,
        accountId,
        date: d,
        note: noteText || groupLabel || "Split",
        isTransfer: false,
        transferId: null,
        ref: refText || null,
        source: "manual",
        attachmentId: initialAttachmentId || null,

        splitGroupId,
        splitCount,
        splitLabel: groupLabel,
        isSplit: true,
        isSplitParent: true,
      };

      const childTxs = cleanedLines.map((l, idx) => {
        const itemName = l.lineNote || noteText || null;
        return {
          id: l.txId || generateId(),
          type: type === "income" ? "income" : "expense",
          amount: l.amount,
          category: l.categoryId,
          accountId,
          date: d,
          itemName: itemName || null,
          note: itemName,
          isTransfer: false,
          transferId: null,
          ref: null,
          source: "manual",
          attachmentId: initialAttachmentId || null,

          splitGroupId,
          splitIndex: idx + 1,
          splitCount,
          splitLabel: groupLabel,
          isSplit: true,
          isSplitChild: true,
          splitParentId: parentId,
        };
      });

      // delete removed lines (when editing an existing split group)
      const existingChildIds = new Set(
        (splitGroupTransactions || [])
          .filter((t) => !t?.isSplitParent)
          .map((t) => String(t?.id || ""))
          .filter(Boolean)
      );
      const nextIds = new Set(childTxs.map((t) => String(t.id)));
      const removedIds = [...existingChildIds].filter((id) => !nextIds.has(id));

      if (removedIds.length) {
        deleteManyTransactions(removedIds, { navigateToDashboard: false });
      }

      bulkUpsertTransactions([parentTx, ...childTxs], { navigateToDashboard: true });
      return;
    }

    if (!categoryId) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");

    if (!amountNumber || amountNumber <= 0) return showAlert?.("กรุณาระบุจำนวนเงินให้ถูกต้อง");

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
      ref: refText || null,
      source: "manual",
      attachmentId: initialAttachmentId || null,
    });
  };

  const handleDelete = () => {
    if (!initialData?.id) return;

    if (initialData.isTransfer && transferPair) {
      showConfirm?.(
        isEditingCreditPayment ? "ลบชำระบัตร" : "ลบ Transfer",
        "ต้องการลบรายการนี้ใช่ไหม? (จะลบทั้งขาออก/ขาเข้า)",
        () => {
          deleteTransaction(transferPair.outTx.id);
          deleteTransaction(transferPair.inTx.id);
        },
        true
      );
      return;
    }

    const gid = String(initialData?.splitGroupId || "").trim();
    if (gid) {
      const groupIds = (state.transactions || [])
        .filter((t) => String(t?.splitGroupId || "").trim() === gid && !t?.isTransfer)
        .map((t) => String(t?.id || ""))
        .filter(Boolean);

      if (groupIds.length >= 2) {
        showConfirm?.(
          "ลบ Split Group",
          "ต้องการลบรายการแบบ Split ทั้งกลุ่มใช่ไหม?",
          () => deleteManyTransactions(groupIds, { navigateToDashboard: true }),
          true
        );
        return;
      }
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

  return (
    <div
      className="pb-28 pt-6 px-4 min-h-dvh overflow-x-hidden"
      style={{
        overflowX: "hidden",
        touchAction: "pan-y",
      }}
    >
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
          {isEditMode
            ? initialData.isTransfer
              ? isEditingCreditPayment
                ? "แก้ไขชำระบัตร"
                : "แก้ไข Transfer"
              : "แก้ไขรายการ"
            : "เพิ่มรายการ"}
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
                <div className="text-xs text-gray-800/60 mt-1">
                  เลือกได้หลายรูป • แนบ evidence ลง note อัตโนมัติ • จำหมวดจากร้าน/เลขบัญชีเดิมได้ • เปลี่ยนประเภทได้ •
                  โอนเข้าบัตรเครดิตจะถูกจัดเป็น “ชำระบัตร”
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
                  const badge =
                    q.txType === "credit_payment"
                      ? "ชำระบัตร"
                      : q.txType === "transfer"
                      ? "Transfer"
                      : q.txType === "income"
                      ? "Income"
                      : "Expense";
                  const hasGroups = Array.isArray(q.groups) && q.groups.length >= 2;

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

                            {q.txType === "expense" && hasGroups ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/20">
                                Multi-category
                              </span>
                            ) : null}

                            {q.suggestedCategoryId ? (
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-sky-500/15 text-sky-700 border border-sky-500/20">
                                Suggested
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

                          {q.status === "error" ? <div className="mt-2 text-xs text-red-700 break-words">{q.error}</div> : null}

                          {q.suggestedReason ? (
                            <div className="mt-1 text-[11px] text-sky-800/70 truncate">{q.suggestedReason}</div>
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
                          {/* Type switch */}
                          <div className="glass-panel border border-white/20 rounded-2xl p-3 mb-3">
                            <div className="text-xs font-bold text-gray-900/70 mb-2">ประเภทของรายการ</div>
                            <div className="flex gap-2">
                              {[
                                { id: "expense", label: "Expense" },
                                { id: "income", label: "Income" },
                                { id: "transfer", label: "Transfer" },
                                { id: "credit_payment", label: "ชำระบัตร" },
                              ].map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => handleQueueTypeChange(q.id, t.id)}
                                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${
                                    q.txType === t.id
                                      ? "bg-gray-900/90 text-white shadow-sm"
                                      : "bg-white/20 text-gray-900/70 border border-white/15"
                                  }`}
                                  title="เปลี่ยนประเภทได้ หาก AI เลือกผิด"
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                            <div className="text-[11px] text-gray-900/55 mt-2">
                              - “ชำระบัตร” จะสร้าง 2 legs เหมือน Transfer แต่จัดชนิดเป็นการจ่ายยอดบัตร (กันซ้ำกับรายการรูด) <br />
                              - เปลี่ยน Transfer → Expense แล้วระบบจะ auto เลือกบัญชีเดี่ยวให้จากเลขบัญชีในสลิป (เลือก match ที่สุด)
                            </div>
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
                                type="text"
                                inputMode="decimal"
                                value={q.amount != null ? formatMoneyInputFromSatang(q.amount) : ""}
                                onChange={(e) => {
                                  const cleaned = sanitizeMoneyInput(e.target.value);
                                  updateQueueItem(q.id, { amount: parseMoneyToSatang(cleaned), splitByCategory: false });
                                }}
                                className="w-full outline-none text-lg font-extrabold text-gray-900 bg-transparent"
                                placeholder="0.00"
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
                            {q.txType === "transfer" || q.txType === "credit_payment" ? (
                              <div className="grid grid-cols-1 gap-3">
                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
                                    <ArrowRightLeft size={14} /> บัญชีต้นทาง
                                  </div>
                                  <AccountDropdown
                                    accounts={accounts}
                                    value={q.fromAccountId}
                                    onChange={(v) => updateQueueItem(q.id, { fromAccountId: v })}
                                    title="เลือกบัญชีต้นทาง"
                                    placeholder="เลือกบัญชีต้นทาง"
                                    filterFn={q.txType === "credit_payment" ? (a) => !isCreditAccount(a) : undefined}
                                  />
                                  {q.txType === "credit_payment" ? (
                                    <div className="text-[11px] text-gray-900/55 mt-1">
                                      ชำระบัตร: ต้นทางควรเป็นบัญชีปกติ
                                    </div>
                                  ) : null}
                                </div>

                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
                                    <ArrowRightLeft size={14} /> บัญชีปลายทาง
                                  </div>
                                  <AccountDropdown
                                    accounts={accounts}
                                    value={q.toAccountId}
                                    onChange={(v) => updateQueueItem(q.id, { toAccountId: v })}
                                    title="เลือกบัญชีปลายทาง"
                                    placeholder="เลือกบัญชีปลายทาง"
                                    filterFn={q.txType === "credit_payment" ? (a) => isCreditAccount(a) : undefined}
                                  />

                                  {q.txType === "credit_payment" ? (
                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <div className="text-[11px] text-gray-900/60 min-w-0 truncate">
                                        ยอดค้าง: {formatCurrency(creditDebtById.get(q.toAccountId) || 0)}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => applyPayFullForQueue(q.id, q.toAccountId)}
                                        className="shrink-0 px-3 py-2 rounded-xl bg-gray-900/90 text-white text-xs font-extrabold active:scale-95"
                                        disabled={(creditDebtById.get(q.toAccountId) || 0) <= 0}
                                      >
                                        จ่ายเต็มยอดค้าง
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-3">
                                <div className="glass-panel border border-white/20 rounded-2xl p-3">
                                  <div className="text-xs font-bold text-gray-900/70 mb-2">บัญชี</div>
                                  <AccountDropdown
                                    accounts={accounts}
                                    value={q.accountId}
                                    onChange={(v) => updateQueueItem(q.id, { accountId: v })}
                                    title="เลือกบัญชี"
                                    placeholder="เลือกบัญชี"
                                  />
                                </div>

                                {/* Split groups editor */}
                                {q.txType === "expense" && q.splitByCategory && Array.isArray(q.groups) && q.groups.length >= 2 ? (
                                  <div className="glass-panel border border-emerald-500/15 rounded-2xl p-3">
                                    <div className="text-xs font-bold text-gray-900/70 mb-2">แยกรายการในใบเสร็จ (ไม่รวมราคา 0)</div>
                                    <div className="space-y-2">
                                      {q.groups.map((g, idx) => (
                                        <div key={idx} className="rounded-2xl bg-white/10 border border-white/15 p-3">
                                          <div className="mb-2">
                                            <div className="text-[11px] text-gray-900/60 font-bold mb-1">รายการ</div>
                                            <input
                                              type="text"
                                              value={g.note || ""}
                                              onChange={(e) => updateQueueGroup(q.id, idx, { note: e.target.value })}
                                              className="w-full glass-input rounded-xl px-3 py-2 bg-white/30 outline-none focus:border-gray-900 text-xs font-extrabold text-gray-900"
                                              placeholder="ชื่อสินค้า/บริการ"
                                            />
                                          </div>
                                          <div className="grid grid-cols-5 gap-2 items-start">
                                            <div className="col-span-3">
                                              <div className="text-[11px] text-gray-900/60 font-bold mb-1">หมวด</div>
                                              <select
                                                value={g.categoryId || ""}
                                                onChange={(e) => updateQueueGroup(q.id, idx, { categoryId: e.target.value })}
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
                                                type="text"
                                                inputMode="decimal"
                                                value={formatMoneyInputFromSatang(g.amount ?? 0)}
                                                onChange={(e) => {
                                                  const cleaned = sanitizeMoneyInput(e.target.value);
                                                  updateQueueGroup(q.id, idx, { amount: parseMoneyToSatang(cleaned) });
                                                }}
                                                className="w-full glass-input rounded-xl px-3 py-2 bg-white/30 outline-none focus:border-gray-900 text-xs font-extrabold text-gray-900"
                                              />
                                              <div className="text-[10px] text-gray-900/55 mt-1 truncate">
                                                {String(g.note || "").trim() ? "" : "—"}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
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

                                    {q.suggestedCategoryId ? (
                                      <div className="mt-2 text-[11px] text-sky-900/70">Suggested จากประวัติแล้ว (แก้ได้ตามต้องการ)</div>
                                    ) : null}
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
              { id: "credit_payment", label: "ชำระบัตร" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "credit_payment" && !creditAccounts.length) {
                    showAlert?.("ยังไม่มีบัญชีประเภทบัตรเครดิตในระบบ (เพิ่มบัญชีบัตรก่อน)");
                    return;
                  }
                  setType(t.id);
                  if (t.id === "transfer" || t.id === "credit_payment") setCategoryId("transfer");
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

          {/* Amount */}
          <AmountField
            value={isSplitMode ? splitTotalDigits : amountDigits}
            onChange={(v) => {
              if (isSplitMode) return;
              setAmountDigits(v);
            }}
            variant={type === "credit_payment" ? "transfer" : type}
            label={isSplitMode ? "ยอดรวม (Split)" : "จำนวนเงิน"}
            helper={isSplitMode ? "Split: ยอดรวมจะคำนวณจากรายการย่อยด้านล่าง" : budgetHint}
            disabled={isSplitMode}
          />

          {/* Accounts */}
          {type === "transfer" ? (
            <div className="glass-card rounded-3xl p-5 mb-6">
              <div className="text-xs font-bold text-gray-900/60 uppercase mb-3 flex items-center gap-2">
                <ArrowRightLeft size={14} /> Transfer Accounts
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs font-extrabold text-gray-900/70 mb-2">บัญชีต้นทาง</div>
                  <AccountDropdown
                    accounts={accounts}
                    value={fromAccountId}
                    onChange={setFromAccountId}
                    title="เลือกบัญชีต้นทาง"
                    placeholder="เลือกบัญชีต้นทาง"
                  />
                </div>

                <div>
                  <div className="text-xs font-extrabold text-gray-900/70 mb-2">บัญชีปลายทาง</div>
                  <AccountDropdown
                    accounts={accounts}
                    value={toAccountId}
                    onChange={setToAccountId}
                    title="เลือกบัญชีปลายทาง"
                    placeholder="เลือกบัญชีปลายทาง"
                  />
                </div>
              </div>

              <div className="mt-3 text-[12px] text-gray-900/60">
                Transfer จะไม่ถูกนับเป็นรายรับ/รายจ่ายในสถิติ (เพื่อให้ยอดสุทธิไม่เพี้ยน)
              </div>
            </div>
          ) : type === "credit_payment" ? (
            <div className="glass-card rounded-3xl p-5 mb-6">
              <div className="text-xs font-bold text-gray-900/60 uppercase mb-3 flex items-center gap-2">
                <CreditCard size={14} /> Credit Card Payment
              </div>

              <div className="glass-panel border border-indigo-500/15 rounded-2xl p-4 mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                      <CreditCard size={16} className="text-indigo-700" /> ชำระบัตรเครดิต
                    </div>
                    <div className="text-[12px] text-gray-900/60 mt-1">
                      ระบบจะสร้าง 2 legs (เงินออกจากบัญชีจ่าย + เงินเข้าไปลดหนี้บัตร) แต่เป็น “ชำระบัตร” ไม่ใช่ “รายจ่าย”
                      เพื่อกันซ้ำกับรายการรูดที่คุณบันทึกอยู่แล้ว
                    </div>
                  </div>
                  {selectedToAcc && isCreditAccount(selectedToAcc) ? (
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-gray-900/55">ยอดค้างชำระ</div>
                      <div className="text-sm font-extrabold text-gray-900">{formatCurrency(creditDebt)}</div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900/70 mb-2">บัญชีที่จ่าย</div>
                    <AccountDropdown
                      accounts={accounts}
                      value={fromAccountId}
                      onChange={setFromAccountId}
                      title="เลือกบัญชีที่จ่าย"
                      placeholder="เลือกบัญชีที่จ่าย"
                      filterFn={(a) => !isCreditAccount(a) || nonCreditAccounts.length === 0}
                    />
                    <div className="text-[11px] text-gray-900/55 mt-1">แนะนำ: ใช้บัญชีธนาคาร/เงินสด (ไม่ใช่บัตร)</div>
                  </div>

                  <div>
                    <div className="text-xs font-extrabold text-gray-900/70 mb-2">บัตรเครดิตที่ต้องการชำระ</div>
                    <AccountDropdown
                      accounts={accounts}
                      value={toAccountId}
                      onChange={setToAccountId}
                      title="เลือกบัตรเครดิต"
                      placeholder="เลือกบัตรเครดิต"
                      filterFn={(a) => isCreditAccount(a)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] text-gray-900/60 min-w-0 truncate">
                      {selectedToAcc && isCreditAccount(selectedToAcc)
                        ? `ยอดค้างชำระปัจจุบันของ ${selectedToAcc.name}: ${formatCurrency(creditDebt)}`
                        : "เลือกบัญชีปลายทางเป็น “บัตรเครดิต” เพื่อให้แสดงยอดค้างชำระ"}
                    </div>
                    <button
                      type="button"
                      onClick={applyPayFull}
                      className="shrink-0 px-3 py-2 rounded-xl bg-gray-900/90 text-white text-xs font-extrabold active:scale-95"
                      disabled={!selectedToAcc || !isCreditAccount(selectedToAcc) || creditDebt <= 0}
                    >
                      จ่ายเต็มยอดค้าง
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[12px] text-gray-900/60">
                ชำระบัตรจะถูกจัดเป็นหมวด transfer ภายในระบบ แต่ติดป้ายชนิดเป็น credit_payment เพื่อให้หน้า Recent แสดง “ครั้งเดียว”
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-900/55 mb-3 uppercase ml-1">บัญชีที่ใช้</h3>

              {/* ✅ wrap เพื่อกันการเลื่อนซ้าย/ขวาทั้งหน้า */}
              <div className="flex flex-wrap gap-3 pb-2">
                {accounts.map((acc) => {
                  const isSelected = accountId === acc.id;
                  const v = getAccountVisual(acc);
                  return (
                    <button
                      key={acc.id}
                      onClick={() => setAccountId(acc.id)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all active:scale-95 ${
                        isSelected
                          ? "bg-gray-900/90 text-white border-white/10 shadow-lg"
                          : "glass-chip text-gray-900 border border-white/15 hover:bg-white/10"
                      }`}
                      type="button"
                    >
                      <span className="w-7 h-7 rounded-xl overflow-hidden bg-white/20 border border-white/15 shrink-0 flex items-center justify-center">
                        {v.kind === "img" ? (
                          <img src={v.src} alt="acc" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl leading-none">{v.value}</span>
                        )}
                      </span>

                      <span className="text-sm font-extrabold">{acc.name}</span>
                      {isSelected ? <Check size={14} className="ml-1" /> : null}
                    </button>
                  );
                })}
              </div>

              {accounts.find((a) => a.id === accountId)?.name ? (
                <div className="text-xs text-gray-900/55 ml-1">
                  เลือกบัญชี:{" "}
                  <span className="font-extrabold text-gray-900">{accounts.find((a) => a.id === accountId)?.name}</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Split + Categories */}
          {type !== "transfer" && type !== "credit_payment" ? (
            <>
              <div className="glass-card rounded-3xl p-5 mb-6 border border-white/20">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900/60 uppercase flex items-center gap-2">
                      <Layers size={14} /> Split Transactions
                    </div>
                    <div className="text-[11px] text-gray-900/55 mt-1 break-words">
                      แยกรายการเป็นหลายหมวด แต่ยังคงเก็บเป็น “transactions จริง” เพื่อให้รายงาน/สถิติ/งบ ทำงานถูกต้องทันที
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={toggleSplitMode}
                    className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-extrabold border active:scale-95 transition-all ${
                      isSplitMode
                        ? "bg-emerald-600/90 text-white border-emerald-500/20 shadow-sm"
                        : "glass-chip text-gray-900 border-white/15 hover:bg-white/10"
                    }`}
                  >
                    {isSplitMode ? "ON" : "OFF"}
                  </button>
                </div>

                {isSplitMode ? (
                  <div className="mt-4 space-y-3">
                    <div className="glass-panel border border-white/20 rounded-2xl p-3">
                      <div className="text-xs font-bold text-gray-900/70 mb-1">Split label (optional)</div>
                      <input
                        value={splitLabel}
                        onChange={(e) => setSplitLabel(e.target.value)}
                        className="w-full outline-none text-sm font-extrabold text-gray-900 bg-transparent"
                        placeholder='เช่น "Lotus receipt"'
                      />
                    </div>

                    <div className="space-y-2">
                      {splitLines.map((l, idx) => (
                        <div key={`${l.txId || "new"}-${idx}`} className="rounded-2xl bg-white/10 border border-white/15 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] text-gray-900/65 font-extrabold">
                              Line {idx + 1}
                              <span className="font-bold">/{splitLines.length}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSplitLine(idx)}
                              className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/15 flex items-center justify-center text-red-700 active:scale-95"
                              aria-label="remove split line"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-5 gap-2 items-start mt-2">
                            <div className="col-span-3">
                              <div className="text-[11px] text-gray-900/60 font-bold mb-1">หมวด</div>
                              <select
                                value={l.categoryId || ""}
                                onChange={(e) => updateSplitLine(idx, { categoryId: e.target.value })}
                                className="w-full glass-input rounded-xl px-3 py-2 bg-white/30 outline-none focus:border-gray-900 text-xs font-extrabold text-gray-900"
                              >
                                <option value="" disabled>
                                  เลือกหมวด
                                </option>
                                {(type === "income" ? incomeCats : expenseCats).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.icon} {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-2">
                              <div className="text-[11px] text-gray-900/60 font-bold mb-1">ยอด</div>
                              <input
                                value={l.amountDigits || ""}
                                onChange={(e) => updateSplitLine(idx, { amountDigits: sanitizeMoneyInput(e.target.value) })}
                                inputMode="decimal"
                                className="w-full glass-input rounded-xl px-3 py-2 bg-white/30 outline-none focus:border-gray-900 text-xs font-extrabold text-gray-900"
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          <div className="mt-2">
                            <div className="text-[11px] text-gray-900/60 font-bold mb-1">Note (optional)</div>
                            <input
                              value={l.lineNote || ""}
                              onChange={(e) => updateSplitLine(idx, { lineNote: e.target.value })}
                              className="w-full glass-input rounded-xl px-3 py-2 bg-white/30 outline-none focus:border-gray-900 text-xs font-extrabold text-gray-900"
                              placeholder="รายละเอียดเฉพาะบรรทัด (ถ้ามี)"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={addSplitLine}
                        className="px-4 py-2 rounded-2xl bg-gray-900/90 text-white text-xs font-extrabold active:scale-95 flex items-center gap-2"
                      >
                        <Plus size={14} /> เพิ่มบรรทัด
                      </button>

                      <div className="text-[12px] text-gray-900/65 font-bold">
                        รวม: <span className="text-gray-900">{formatCurrency(splitTotalNumber)}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-gray-900/55">
                      * Split จะบันทึกเป็นหลาย transactions (เพื่อให้ Export/งบ/สถิติ ถูกต้อง) แต่ในหน้า Recent จะแสดงเป็น 1 การ์ด
                    </div>
                  </div>
                ) : null}
              </div>

              {!isSplitMode ? (
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
            </>
          ) : null}

          {/* Attachment preview (from scan / inbox) */}
          {initialAttachmentId ? (
            <div className="glass-card rounded-3xl p-4 mb-4 border border-white/20">
              <div className="text-xs font-bold text-gray-900/55 mb-3 uppercase">Attachment</div>
              {attachmentUrl ? (
                <a
                  href={attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl overflow-hidden border border-white/20 bg-white/10"
                >
                  <img src={attachmentUrl} alt="attachment" className="w-full max-h-72 object-cover" />
                </a>
              ) : (
                <div className="text-sm text-gray-900/60">Loading image…</div>
              )}
              <div className="mt-2 text-[11px] text-gray-900/50">
                ไฟล์แนบถูกเก็บแบบถาวรในเครื่อง (IndexedDB)
              </div>
            </div>
          ) : null}

          {/* Date / Note / Ref */}
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
                placeholder={
                  type === "credit_payment"
                    ? "โน้ต (ธนาคาร/บัตร/รายละเอียด)"
                    : isSplitMode
                      ? "โน้ตสำหรับทั้งกลุ่ม Split (optional)"
                      : "โน้ต (ชื่อร้าน/รายละเอียด)"
                }
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

          {/* Fixed Save */}
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

      {/* Fixed actions (scan mode) */}
      {!isEditMode && entryMode === "scan" && queue.length ? (
        <div className="fixed bottom-6 left-4 right-4 grid grid-cols-2 gap-2">
          <button
            onClick={sendQueueToInbox}
            className={`py-4 rounded-2xl font-extrabold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
              canSendToInbox
                ? "bg-gray-900/90 text-white"
                : "bg-white/30 text-gray-700/60 border border-white/20"
            }`}
            type="button"
            disabled={!canSendToInbox}
          >
            <Inbox size={18} />
            Send to Inbox
          </button>

          <button
            onClick={handlePostScanSaveNow}
            className={`py-4 rounded-2xl font-extrabold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
              canCreateFromQueue
                ? "bg-indigo-600 text-white shadow-indigo-200"
                : "bg-white/30 text-gray-700/60 border border-white/20"
            }`}
            type="button"
            disabled={!canCreateFromQueue}
          >
            <Check size={18} />
            Save now
          </button>
        </div>
      ) : null}

      {/* Duplicate decision modal (Save now) */}
      {dupDecisionOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDupDecisionOpen(false)}
            aria-label="Close"
          />
          <div className="relative w-full max-w-sm glass-card rounded-3xl p-5 border border-white/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">พบ Possible duplicate</h3>
                <p className="mt-1 text-sm text-gray-900/70">มี {duplicateReadyCount} รายการที่อาจซ้ำ ต้องการทำอย่างไร?</p>
              </div>
              <button
                type="button"
                onClick={() => setDupDecisionOpen(false)}
                className="p-2 rounded-xl bg-white/30 border border-white/20 text-gray-900/70 active:scale-95"
                aria-label="close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => handleDupDecision("send")}
                className="w-full py-4 rounded-2xl bg-gray-900/90 text-white font-extrabold shadow-xl active:scale-95"
              >
                Send duplicates to Inbox
              </button>
              <button
                type="button"
                onClick={() => handleDupDecision("skip")}
                className="w-full py-4 rounded-2xl bg-white/30 text-gray-900 font-extrabold border border-white/20 active:scale-95"
              >
                Skip duplicates
              </button>

              <button
                type="button"
                onClick={() => handleDupDecision("save")}
                className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-indigo-200 active:scale-95"
              >
                Save duplicates now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
