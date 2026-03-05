// src/views/AddTransactionView.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bestMatchAccountCandidate,
  bestMatchAccountId,
  isCreditAccount,
} from "../../utils/accountMatch";
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
  Search,
  ChevronRight,
} from "lucide-react";

import { useAppStore } from "../../store/store";
import AmountField from "../../components/AmountField";
import AccountPicker from "../../components/AccountPicker";
import AccountChipsPicker from "../../components/AccountChipsPicker";
import CategorySelect from "../../components/CategorySelect";
import CategoryPicker from "../../components/CategoryPicker";
import QuickSuggestions from "../../components/QuickSuggestions";
import TagsInput from "../../components/TagsInput";
import AppHeader from "../../components/AppHeader";
import BentoGrid from "../../components/bento/BentoGrid";
import BentoCard from "../../components/bento/BentoCard";
import { scanReceiptOpenAI } from "../../services/scanOpenAI";
import { putBlob, getBlobUrl } from "../../services/blobStore";
import { formatCurrency, toISODate } from "../../utils/format";
import { parseMoneyToSatang, formatMoneyInputFromSatang, sanitizeMoneyInput, normalizeThaiDigits } from "../../utils/money";
import { generateId, generateTransferId, generateSplitGroupId } from "../../utils/id";
import { expandTransactionToInstallments } from "../../utils/installments";
import { computeFileSha256Hex } from "../../utils/fileHash";
import { useBlobInfo } from "../../utils/useBlobInfo";
import { PRESET_COLORS } from "../../constants/presets.jsx";
import { findNearbyMerchant, normalizeLatLng } from "../../utils/location";
import {
  isDuplicateByRef,
  findFuzzyDuplicate,
  toMonthKey,
  calcSpentByCategoryInMonth,
  getBudget,
  calcAccountBalance,
} from "../../store/selectors";
import { splitReceiptItemsToLines, sanitizeCategoryKey } from "../../utils/receiptCategorizer";
import {
  reconcileReceiptGroups,
  signedReceiptGroupSatang,
  isAdjustmentLike,
  computeReceiptSumsSatang,
  chooseReceiptPaidTotalSatang,
} from "../../utils/receiptAdjustments";
import { deriveAutomationPatch } from "../../utils/rulesEngine";
import {
  resolveMerchantCanonical,
  deriveMerchantAutofillPatch,
} from "../../utils/merchantDictionary";
import { buildCategoryHierarchy } from "../../utils/categoryHierarchy";
import { useTransferFlow } from "./hooks/useTransferFlow";
import { useTransactionDraft } from "./hooks/useTransactionDraft";
import { useScanQueue } from "./hooks/useScanQueue";
import { digitsOnly, normalizeRefKey, normalizeMerchantKey, extractMerchantFromNote, appendEvidenceToNote, hashString, humanizeScanStatus } from "./helpers/inputHelpers";
import AmountSection from "./sections/AmountSection";
import CategorySection from "./sections/CategorySection";
import TransferSection from "./sections/TransferSection";
import ReceiptSection from "./sections/ReceiptSection";
import ScanQueueList from "./scan/ScanQueueList";

// Tombstone category helper (module-scope => safe for hooks deps)
const isTombstoneCategory = (c) => !!(c?.deletedAt || c?.isDeleted);


function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

// (Account dropdown UI is now shared: src/components/AccountPicker.jsx)

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

// ===== Slip Hunter helpers (Thai transfer slips) =====
const THAI_SLIP_BANK_KEYWORDS = [
  { id: "kbank", keys: ["kbank", "kasikorn", "kasikornbank", "กสิกร", "กสิกรไทย", "kbiz"] },
  { id: "scb", keys: ["scb", "siam commercial", "siam commercial bank", "ไทยพาณิช", "ไทยพาณิชย์"] },
  { id: "ktb", keys: ["ktb", "krungthai", "กรุงไทย"] },
  { id: "ttb", keys: ["ttb", "ทหารไทย", "ธนชาต", "ทหารไทยธนชาต", "tmb"] },
  { id: "truemoney", keys: ["truemoney", "true money", "ทรูมันนี่", "ทรู มันนี่", "wallet", "วอลเล็ต"] },
];

function fixBuddhistYearISO(isoLike) {
  const raw = String(isoLike || "").trim();
  if (!raw) return "";
  const s = normalizeThaiDigits(raw);
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return raw.slice(0, 10);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return raw.slice(0, 10);
  if (y >= 2400) y = y - 543;
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function parseSlipTimeFromText(text) {
  const t0 = String(text || "").replace(/\u00A0/g, " ").trim();
  if (!t0) return "";
  const t = normalizeThaiDigits(t0);
  const m = t.match(/(?:เวลา|time)?\s*([01]?\d|2[0-3])[:.](\d{2})(?:[:.](\d{2}))?/i);
  if (!m) return "";
  const hh = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  const ss = m[3] != null ? String(m[3]).padStart(2, "0") : "";
  return ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

function guessSlipReceiverBankId(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return "";
  for (const b of THAI_SLIP_BANK_KEYWORDS) {
    if (b.keys.some((k) => t.includes(String(k).toLowerCase()))) return b.id;
  }
  return "";
}

function guessSlipCategoryKey(merchantText) {
  const m = String(merchantText || "").toLowerCase();
  if (!m) return "";

  // Utilities / Bills
  if (
    m.includes("การไฟฟ้า") ||
    m.includes("pea") ||
    m.includes("mea") ||
    m.includes("egat") ||
    m.includes("electric") ||
    m.includes("การประปา") ||
    m.includes("waterworks") ||
    m.includes("internet") ||
    m.includes("เน็ตทรู") ||
    m.includes("true") ||
    m.includes("ais") ||
    m.includes("dtac")
  ) {
    return "bills";
  }

  // Phone package explicitly
  if (m.includes("แพ็กเกจ") || m.includes("package") || m.includes("mobile") || m.includes("มือถือ")) {
    return "phone_internet";
  }

  // Transport / delivery apps
  if (m.includes("grab") || m.includes("bolt") || m.includes("lineman") || m.includes("line man") || m.includes("shopeefood")) {
    return "transport";
  }

  // Coffee
  if (m.includes("starbucks") || m.includes("cafe") || m.includes("กาแฟ") || m.includes("coffee")) {
    return "coffee";
  }

  // Food / dining
  if (m.includes("restaurant") || m.includes("อาหาร") || m.includes("kfc") || m.includes("mcd") || m.includes("pizza")) {
    return "dining";
  }

  // Shopping / groceries hints
  if (m.includes("7-eleven") || m.includes("7-11") || m.includes("lotus") || m.includes("big c") || m.includes("makro") || m.includes("tops")) {
    return "groceries";
  }

  return "";
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
  const isEditMode = !!initialData?.id;

  const accounts = useMemo(() => state.accounts || [], [state.accounts]);
  const categories = useMemo(() => state.categories || { expense: [], income: [] }, [state.categories]);

  const {
    transferPair,
    transferKindForEdit,
    isEditingCreditPayment,
    initialAttachmentId,
  } = useTransferFlow({
    initialData,
    stateTransactions: state.transactions,
    accounts,
    isEditMode,
  });

  const { url: attachmentUrl, mimeType: attachmentMimeType } = useBlobInfo(initialAttachmentId);

  const {
    entryMode,
    setEntryMode,
    scanUploadKind,
    setScanUploadKind,
    initialType,
    type,
    setType,
    categoryId,
    setCategoryId,
    accountId,
    setAccountId,
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    date,
    setDate,
    note,
    setNote,
    ref,
    setRef,
    tags,
    setTags,
    slipMeta,
    _setSlipMeta,
    currentLocation,
    setCurrentLocation,
    nearbySuggestion,
    setNearbySuggestion,
  } = useTransactionDraft({
    initialData,
    isEditMode,
    transferKindForEdit,
    transferPair,
    accounts,
    toISODate,
    normalizeLatLng,
  });

  const [isSaving, setIsSaving] = useState(false);
  const savingLockRef = useRef(false);

  useEffect(() => {
    if (!isEditMode) return;
    setType(initialType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType]);

  const [amountDigits, setAmountDigits] = useState(() => {
    const n = transferPair?.outTx?.amount ?? initialData?.amount ?? 0;
    return n ? formatMoneyInputFromSatang(Math.abs(Number(n))) : "";
  });

  useEffect(() => {
    if (!isEditMode) return;
    if (isSplitMode) return;
    const n = transferPair?.outTx?.amount ?? initialData?.amount ?? 0;
    setAmountDigits(n ? formatMoneyInputFromSatang(Math.abs(Number(n))) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, initialData?.id]);

  const currentLocationRef = useRef(currentLocation);
  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  const geoToastShownRef = useRef(false);

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

  // ===== Credit Card Installment (manual + edit UI) =====
  // NOTE: We only allow installment on NEW expense transactions paid by a credit account (not split).
  const selectedManualAccount = useMemo(
    () => accounts.find((a) => String(a?.id || "") === String(accountId || "")) || null,
    [accounts, accountId]
  );
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentMonths, setInstallmentMonths] = useState(3);

  useEffect(() => {
    // Auto-disable when not eligible
    if (type !== "expense" || isSplitMode) {
      setIsInstallment(false);
      return;
    }
    if (!isCreditAccount(selectedManualAccount)) {
      setIsInstallment(false);
    }
  }, [type, isSplitMode, selectedManualAccount]);

  // Manual form: Advanced section (collapsed by default)
  const [manualAdvancedOpen, setManualAdvancedOpen] = useState(() => {
    if (isEditMode) return true;
    if (initialAttachmentId) return true;
    const hasRef = String(ref || "").trim().length > 0;
    const hasTags = Array.isArray(tags) && tags.length > 0;
    return hasRef || hasTags;
  });

  useEffect(() => {
    // If we have an attachment coming from Inbox/Scan, auto-open Advanced so it is visible.
    if (initialAttachmentId) setManualAdvancedOpen(true);
  }, [initialAttachmentId]);

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
    () => calcSpentByCategoryInMonth(state.transactions || [], monthKey, categories?.expense || []),
    [state.transactions, monthKey, categories]
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
  const slipFileInputRef = useRef(null);
  const {
    isScanning,
    setIsScanning,
    scanStatus,
    setScanStatus,
    queue,
    setQueue,
    expandedId,
    setExpandedId,
    dropActive,
    setDropActive,
    dupDecisionOpen,
    setDupDecisionOpen,
    clearQueue: clearScanQueue,
    removeQueueItem,
    removeQueueItems,
  } = useScanQueue();
  const dropZoneRef = useRef(null);

  // scan batch
  const scanBatchIdRef = useRef(0);
  const scanAutoSendRef = useRef({ enabled: false, batchId: 0, triggered: false, fileCount: 0 });
const existingRefSet = useMemo(() => {
    const set = new Set();
    for (const t of state.transactions || []) {
      const r = normalizeRefKey(t.ref || t.referenceId || t.reference_id || "");
      if (r) set.add(r);
    }
    return set;
  }, [state.transactions]);

  // ✅ Tombstone strategy: hide deleted categories from pickers/suggestions,
  // but keep them in state for historical reports.
  const expenseCatsAll = useMemo(() => categories.expense || [], [categories.expense]);
  const incomeCatsAll = useMemo(() => categories.income || [], [categories.income]);
  
  const expenseCats = useMemo(() => expenseCatsAll.filter((c) => !isTombstoneCategory(c)), [expenseCatsAll]);
  const incomeCats = useMemo(() => incomeCatsAll.filter((c) => !isTombstoneCategory(c)), [incomeCatsAll]);

  // ====== category hierarchy (Main -> Sub) ======
  const catsForTypeAll = useMemo(() => (type === "income" ? incomeCatsAll : expenseCatsAll), [type, incomeCatsAll, expenseCatsAll]);
  const catsForTypeActive = useMemo(() => (type === "income" ? incomeCats : expenseCats), [type, incomeCats, expenseCats]);

  // ✅ Important UX for tombstone categories:
  // - Hide deleted categories from pickers by default
  // - BUT if the currently selected category is deleted (or under a deleted parent),
  //   we must still display it so edit screens don't look "blank".
  const catsForTypePicker = useMemo(() => {
    const active = Array.isArray(catsForTypeActive) ? catsForTypeActive.filter(Boolean) : [];
    const all = Array.isArray(catsForTypeAll) ? catsForTypeAll.filter(Boolean) : [];
    const selId = String(categoryId || "").trim();
    if (!selId) return active;

    // Fast path: selected already visible
    if (active.some((c) => String(c?.id || "").trim() === selId)) return active;

    const byId = new Map();
    for (const c of all) {
      const id = String(c?.id || "").trim();
      if (id) byId.set(id, c);
    }

    // Include selected + ancestors (so main/sub relationship stays intact)
    const toAdd = [];
    let cur = selId;
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      if (!cur || seen.has(cur)) break;
      seen.add(cur);
      const c = byId.get(cur);
      if (!c) break;
      toAdd.push(c);
      cur = String(c?.parentId || "").trim();
    }

    if (!toAdd.length) return active;

    const activeIds = new Set(active.map((c) => String(c?.id || "").trim()).filter(Boolean));
    const dedupAdd = toAdd.filter((c) => {
      const id = String(c?.id || "").trim();
      if (!id || activeIds.has(id)) return false;
      activeIds.add(id);
      return true;
    });

    return dedupAdd.length ? [...active, ...dedupAdd] : active;
  }, [catsForTypeActive, catsForTypeAll, categoryId]);

  const catHierarchy = useMemo(() => buildCategoryHierarchy(catsForTypePicker), [catsForTypePicker]);



  const recentCatsForPicker = useMemo(() => {
    const txType = type === "income" ? "income" : type === "expense" ? "expense" : "";
    if (!txType) return [];
    const txs = Array.isArray(state.transactions) ? state.transactions : [];

    const sorted = [...txs]
      .filter((t) => (t?.type === txType) && !t?.isTransfer)
      .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));

    const out = [];
    const seen = new Set();
    for (const t of sorted) {
      const cid = String(t?.category || "").trim();
      if (!cid || seen.has(cid)) continue;
      const c = catHierarchy.byId.get(cid);
      if (!c) continue;
      // Keep list tidy: don't suggest deleted categories (unless currently selected)
      if (isTombstoneCategory(c) && cid !== String(categoryId || "").trim()) continue;
      seen.add(cid);
      out.push(c);
      if (out.length >= 6) break;
    }
    return out;
  }, [state.transactions, type, catHierarchy, categoryId]);

  // ===== quick suggestions (one-tap): recents across BOTH expense/income (used by Scan Review) =====
  const catIndexByType = useMemo(() => {
    const mk = (catsAll) => {
      const byId = new Map();
      for (const c of Array.isArray(catsAll) ? catsAll : []) {
        const id = String(c?.id || "").trim();
        if (id) byId.set(id, c);
      }
      return { byId };
    };
    return {
      expense: mk(expenseCatsAll),
      income: mk(incomeCatsAll),
    };
  }, [expenseCatsAll, incomeCatsAll]);

  const recentCatsByType = useMemo(() => {
    const txs = Array.isArray(state.transactions) ? state.transactions : [];
    const pick = (txType) => {
      const byId = catIndexByType?.[txType]?.byId || new Map();
      const out = [];
      const seen = new Set();
      for (let i = txs.length - 1; i >= 0; i -= 1) {
        const t = txs[i];
        if (!t) continue;
        if (String(t?.type || "").toLowerCase() !== String(txType || "").toLowerCase()) continue;
        const cid = String(t?.category || "").trim();
        if (!cid || cid === "transfer" || cid === "mixed") continue;
        if (seen.has(cid)) continue;
        const cat = byId.get(cid);
        if (!cat) continue;
        if (isTombstoneCategory(cat)) continue;
        seen.add(cid);
        out.push(cat);
        if (out.length >= 8) break;
      }
      return out;
    };
    return {
      expense: pick("expense"),
      income: pick("income"),
    };
  }, [state.transactions, catIndexByType]);

  const accountById = useMemo(() => {
    const m = new Map();
    for (const a of Array.isArray(accounts) ? accounts : []) {
      const id = String(a?.id || "").trim();
      if (id) m.set(id, a);
    }
    return m;
  }, [accounts]);

  // ===== All tags from history (for autocomplete) =====
  const allTagsFromHistory = useMemo(() => {
    const txs = Array.isArray(state.transactions) ? state.transactions : [];
    const seen = new Set();
    const out = [];
    for (const t of txs) {
      const arr = Array.isArray(t?.tags) ? t.tags : [];
      for (const tag of arr) {
        const nt = String(tag || "").trim().toLowerCase();
        if (!nt || seen.has(nt)) continue;
        seen.add(nt);
        out.push(nt);
      }
    }
    return out;
  }, [state.transactions]);

  const recentAccountsByType = useMemo(() => {
    const txs = Array.isArray(state.transactions) ? state.transactions : [];
    const pick = (txType) => {
      const out = [];
      const seen = new Set();
      for (let i = txs.length - 1; i >= 0; i -= 1) {
        const t = txs[i];
        if (!t) continue;
        if (String(t?.type || "").toLowerCase() !== String(txType || "").toLowerCase()) continue;
        const aid = String(t?.accountId || "").trim();
        if (!aid || seen.has(aid)) continue;
        const acc = accountById.get(aid);
        if (!acc) continue;
        seen.add(aid);
        out.push(acc);
        if (out.length >= 8) break;
      }
      return out;
    };
    return {
      expense: pick("expense"),
      income: pick("income"),
    };
  }, [state.transactions, accountById]);


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

  // ===== Smart Geolocation: build a lightweight merchant-location dataset from history =====
  const merchantLocationData = useMemo(() => {
    const out = [];
    for (const t of state.transactions || []) {
      if (!t) continue;
      if (t.isTransfer) continue;

      const loc = normalizeLatLng(t.location);
      if (!loc) continue;

      const merchantText = String(t.merchant || extractMerchantFromNote(t.note) || "").trim();
      if (!merchantText) continue;

      out.push({
        merchant: merchantText,
        location: loc,
        categoryId: String(t.category || ""),
        accountId: String(t.accountId || ""),
        updatedAt: Number(t.updatedAt || t.createdAt || 0) || 0,
      });
    }
    return out;
  }, [state.transactions]);

  // ===== Smart Geolocation: silently request GPS once on mount =====
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const geo = navigator.geolocation;
    if (!geo || typeof geo.getCurrentPosition !== "function") return;

    geo.getCurrentPosition(
      (pos) => {
        const loc = normalizeLatLng({ lat: pos?.coords?.latitude, lng: pos?.coords?.longitude });
        if (!loc) return;
        setCurrentLocation(loc);
      },
      // Graceful: ignore errors (permission denied / unavailable)
      () => {},
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 7_000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Smart Geolocation: find nearby merchant and suggest autofill =====
  useEffect(() => {
    const loc = currentLocation;
    if (!loc) return;

    const found = findNearbyMerchant(loc.lat, loc.lng, merchantLocationData, { maxDistanceM: 90 });
    setNearbySuggestion(found || null);

    if (!found || !found.merchant) return;

    // Toast only once per mount/session
    if (!geoToastShownRef.current) {
      geoToastShownRef.current = true;
      showAlert?.(`📍 พบสถานที่ใกล้เคียง: ${found.merchant}`);
    }

    // Auto-fill ONLY when user hasn't typed yet, and only for new entries.
    if (!isEditMode && entryMode === "manual") {
      setNote((prev) => {
        const p = String(prev || "").trim();
        return p ? prev : found.merchant;
      });

      // If we can safely infer a category from history, apply when empty.
      if (!isSplitMode && (type === "expense" || type === "income")) {
        const allowed = type === "income" ? incomeCats : expenseCats;
        const canUse = found.categoryId && allowed.some((c) => String(c?.id) === String(found.categoryId));
        if (canUse) {
          setCategoryId((prev) => {
            const p = String(prev || "").trim();
            if (!p || p === "other" || p === "other_income") return String(found.categoryId);
            return prev;
          });
        }
      }
    }
  }, [currentLocation, merchantLocationData, entryMode, isEditMode, showAlert, type, isSplitMode, expenseCats, incomeCats]);

  const clearQueue = () => {
    // Queue lifecycle (state + preview objectURL cleanup) lives in useScanQueue().
    clearScanQueue();
    createdCatRef.current = { expense: new Map(), income: new Map() };
  };

  const ensureCategory = useCallback((typeForCat, scannedCategory) => {
    const listAll = categories[typeForCat] || [];
    // Only active categories are eligible for matching/suggestion
    const list = (listAll || []).filter((c) => !isTombstoneCategory(c));
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

    // Ensure uniqueness across ALL categories (including deleted/tombstoned)
    while (listAll.some((c) => c.id === id) || createdIds.has(id)) id = `${slug}_${i++}`;

    const color = PRESET_COLORS[hashString(id) % PRESET_COLORS.length];
    const newCat = { id, name: categoryNameFromKey(scannedCategory), icon: "🏷️", color };

    addCategory({ type: typeForCat, category: newCat });

    if (mem && key) mem.set(key, id);
    return id;
  }, [categories, addCategory]);

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

  // Normalize queue item shape when `txType` changes (user edits, automation rules, etc.).
  // This prevents inconsistent states like:
  // - transfer items still having split/category fields
  // - income items keeping receipt groups
  const normalizeQueueItemType = (item) => {
    const base = item && typeof item === "object" ? item : {};
    const raw = String(base.txType || base.type || "expense").toLowerCase().trim();
    const txType = ["expense", "income", "transfer", "credit_payment"].includes(raw) ? raw : "expense";

    const defaultAcc = accounts?.[0]?.id || "";
    const next = { ...base, txType };

    if (txType === "transfer" || txType === "credit_payment") {
      next.categoryId = "transfer";
      next.splitByCategory = false;
      next.isInstallment = false;
      next.items = [];
      next.groups = [];

      next.fromAccountId = next.fromAccountId || next.accountId || defaultAcc;
      next.toAccountId = next.toAccountId || defaultAcc;
      // keep a stable single accountId (used by some UI helpers)
      next.accountId = next.accountId || next.fromAccountId || defaultAcc;

      // credit_payment hint: prefer toAccount = credit, fromAccount = non-credit
      if (txType === "credit_payment") {
        const credit = (accounts || []).find((a) => isCreditAccount(a));
        const nonCredit = (accounts || []).find((a) => !isCreditAccount(a));
        const fromAcc = (accounts || []).find((a) => a?.id === next.fromAccountId) || null;
        const toAcc = (accounts || []).find((a) => a?.id === next.toAccountId) || null;

        const fallbackFrom = nonCredit?.id || defaultAcc;
        const fallbackTo = credit?.id || next.toAccountId || defaultAcc;

        if (!fromAcc || isCreditAccount(fromAcc)) next.fromAccountId = fallbackFrom;
        if (!toAcc || !isCreditAccount(toAcc)) next.toAccountId = fallbackTo;
        next.accountId = next.accountId || next.fromAccountId || fallbackFrom;
      }

      return next;
    }

    // expense / income
    next.accountId = next.accountId || next.fromAccountId || next.toAccountId || defaultAcc;

    if (txType === "income") {
      // Income doesn't support receipt breakdown / splitting.
      next.splitByCategory = false;
      next.isInstallment = false;
      next.items = [];
      next.groups = [];
    }

    // Ensure a safe category to prevent blank UI / invalid saves.
    if (!next.categoryId || next.categoryId === "transfer") {
      next.categoryId = ensureCategory(txType === "income" ? "income" : "expense", "other");
    }

    return next;
  };

  // ✅ Async Debounced Duplicate Check
  // Prevents the UI from freezing while typing by running findFuzzyDuplicate outside of the synchronous state updater.
  useEffect(() => {
    const itemsToCheck = queue.filter(q => q._needsDupCheck);
    if (!itemsToCheck.length) return;

    const timer = setTimeout(() => {
      setQueue(prev => {
        let changed = false;
        // Build the pool once for all checks in this batch
        const pool = [
          ...(state.transactions || []),
          ...prev.filter(p => p.status === "ready").map(p => ({
            ...p,
            type: p.txType,
            isTransfer: p.txType === "transfer" || p.txType === "credit_payment",
          }))
        ];

        const nextQueue = prev.map(q => {
          if (!q._needsDupCheck) return q;

          changed = true;
          try {
            const f = findFuzzyDuplicate(pool.filter(p => p.id !== q.id), {
              ...q,
              type: q.txType,
              isTransfer: q.txType === "transfer" || q.txType === "credit_payment",
              ref: q.ref || q.referenceId,
              referenceId: q.ref || q.referenceId,
            });

            const isDup = !!f?.isDuplicate;
            const reasons = Array.isArray(f?.reasons) ? f.reasons : [];
            const kind = reasons.includes('ref exact match') ? 'ref' : reasons.includes('file exact match') ? 'file' : 'fuzzy';

            return {
              ...q,
              _needsDupCheck: false,
              duplicate: isDup,
              duplicateInfo: isDup ? { kind, matchId: f?.matchId || null, score: f?.score || 0, reasons } : null,
              includeDuplicate: isDup ? (q.duplicate ? !!q.includeDuplicate : false) : true
            };
          } catch {
            return { ...q, _needsDupCheck: false };
          }
        });

        return changed ? nextQueue : prev;
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [queue, state.transactions, setQueue]);

  const updateQueueItem = useCallback((id, patch) => {
    setQueue((prev) => {
      const affectsDup =
        patch &&
        ["amount", "date", "merchant", "note", "ref", "accountId", "fromAccountId", "toAccountId", "txType", "fileHash", "fromDigits", "toDigits", "dateWasDefault"].some(
          (k) => Object.prototype.hasOwnProperty.call(patch, k)
        );

      const patchHasDup =
        patch &&
        (Object.prototype.hasOwnProperty.call(patch, "duplicate") ||
          Object.prototype.hasOwnProperty.call(patch, "duplicateInfo"));

      return prev.map((x) => {
        if (x.id !== id) return x;

        let next = { ...x, ...patch };

        // If user edits the date manually, it's no longer a default fallback date.
        if (Object.prototype.hasOwnProperty.call(patch || {}, "date")) {
          next.dateWasDefault = false;
          next.dateEdited = true;
        }

        // Normalize structure when switching type (keeps fields consistent)
        try {
          next = normalizeQueueItemType(next);
        } catch {
          // ignore
        }

        // Sync amount when receipt groups are updated (bulk updates / auto-categorize).
        if (Object.prototype.hasOwnProperty.call(patch || {}, "groups")) {
          try {
            const groups = Array.isArray(next.groups) ? next.groups : [];
            const signedSum = groups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
            const shouldSyncAmount = !!next.splitByCategory || !next.amountEdited;
            if (shouldSyncAmount) next.amount = signedSum;
          } catch {
            // ignore group sync errors
          }
        }

        // Defer heavy fuzzy matching to the debounced effect
        if (next.status === "ready" && affectsDup && !patchHasDup) {
          next._needsDupCheck = true;
        }

        return next;
      });
    });
  }, [accounts, ensureCategory]);

  const updateQueueGroup = useCallback((qid, gidx, patch) => {
    setQueue((prev) =>
      prev.map((x) => {
        if (x.id !== qid) return x;
        const groups = Array.isArray(x.groups) ? x.groups.slice() : [];
        if (!groups[gidx]) return x;
        groups[gidx] = { ...groups[gidx], ...patch };
        // ✅ Use signed sum so discount lines (adjustmentEffect='subtract') reduce the net total.
        // Sync amount from groups unless user manually edited amount (amountEdited=true).
        const signedSum = groups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
        const shouldSyncAmount = !!x.splitByCategory || !x.amountEdited;
        return { ...x, groups, amount: shouldSyncAmount ? signedSum : x.amount };
      })
    );
  }, [setQueue]);

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


  // ✅ เปลี่ยนประเภทใน Queue (หลัง scan)
  // ✅ รองรับ credit_payment
  const handleQueueTypeChange = useCallback((qid, nextType) => {
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
            isInstallment: false,
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
            isInstallment: false,
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
          isInstallment: false,
          groups: nextType === "expense" ? x.groups : [],
          categoryId: nextCategoryId,
          accountId: pickedAccountId || fallbackAcc,
          suggestedCategoryId: suggested || "",
          suggestedReason: suggested
            ? merchant
              ? `เคยใช้กับ ${merchant}`
              : toDigits || fromDigits
              ? `เคยใช้กับเลขนี้`
              : "เคยใช้บัญชีนี้"
            : "",
        };
      })
    );
  }, [accounts, nonCreditAccounts, creditAccounts, categoryMemory, expenseCats, incomeCats, ensureCategory, setQueue]);

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handlePickSlip = () => {
    slipFileInputRef.current?.click();
  };

  const handlePickScanFiles = () => {
    if (scanUploadKind === "slip") {
      handlePickSlip();
      return;
    }
    handlePickFiles();
  };

  // ===== file helpers (image + PDF) =====
  const isPdfFile = (f) => {
    const t = String(f?.type || "").toLowerCase();
    const name = String(f?.name || "").toLowerCase();
    return t === "application/pdf" || name.endsWith(".pdf");
  };

  const isImageFile = (f) => String(f?.type || "").toLowerCase().startsWith("image/");

  const filterAllowedUploads = (files) => {
    const arr = Array.isArray(files) ? files : Array.from(files || []);
    return arr.filter((f) => f && (isImageFile(f) || isPdfFile(f)));
  };

  const coerceClipboardFile = (blob, idx = 0) => {
    if (!blob) return null;
    if (blob instanceof File) return blob;
    try {
      const type = String(blob.type || "").toLowerCase();
      const ext = type === "application/pdf" ? "pdf" : type.startsWith("image/") ? (type.split("/")[1] || "png") : "bin";
      const name = `clipboard-${Date.now()}-${idx}.${ext}`;
      return new File([blob], name, { type: blob.type || "application/octet-stream" });
    } catch {
      return null;
    }
  };

  const handleDropZonePaste = (e) => {
    try {
      if (isScanning) return;
      const dt = e?.clipboardData;
      const rawFiles = Array.from(dt?.files || []);
      const items = Array.from(dt?.items || []);
      const itemFiles = items
        .filter((it) => it && it.kind === "file")
        .map((it, idx) => coerceClipboardFile(it.getAsFile?.(), idx))
        .filter(Boolean);

      const files = filterAllowedUploads([...rawFiles, ...itemFiles]);
      if (!files.length) return;

      e.preventDefault();
      e.stopPropagation();
      handleFilesSelected(files);
    } catch {
      // ignore
    }
  };

  const handleDropZoneDragOver = (e) => {
    try {
      if (isScanning) return;
      e.preventDefault();
      e.stopPropagation();
      if (!dropActive) setDropActive(true);
    } catch {
      // ignore
    }
  };

  const handleDropZoneDragLeave = (e) => {
    try {
      if (isScanning) return;
      // only deactivate when leaving the drop zone (not when moving between children)
      if (e?.currentTarget && e?.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
      setDropActive(false);
    } catch {
      // ignore
    }
  };

  const handleDropZoneDrop = (e) => {
    try {
      if (isScanning) return;
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);

      const files = filterAllowedUploads(Array.from(e?.dataTransfer?.files || []));
      if (!files.length) {
        showAlert?.("รองรับเฉพาะไฟล์รูปภาพและ PDF");
        return;
      }
      handleFilesSelected(files);
    } catch {
      // ignore
    }
  };

  const handleFilesSelected = async (eOrFiles) => {
    const fromEvent = !!(eOrFiles && eOrFiles.target && eOrFiles.target.files);
    const raw = Array.isArray(eOrFiles) ? eOrFiles : Array.from(eOrFiles?.target?.files || []);
    if (fromEvent) eOrFiles.target.value = "";

    const files = filterAllowedUploads(raw);
    if (!files.length) {
      showAlert?.("ไม่พบไฟล์ที่รองรับ (รองรับรูปภาพและ PDF)");
      return;
    }

    setEntryMode("scan");
    setIsScanning(true);
    setScanStatus("เตรียมสแกน...");

    const batchId = Date.now();
    scanBatchIdRef.current = batchId;

    // ✅ Scan flow: multi-files auto-send to Inbox after all scans complete; single file stays for review
    scanAutoSendRef.current = { enabled: files.length > 1, batchId, triggered: false, fileCount: files.length };

    const batchRefSet = new Set(existingRefSet);
    // ✅ Keep a light pool of already-scanned (same batch) items for fuzzy duplicate detection
    const batchFuzzyPool = [];

    try {
      for (const file of files) {
        const qid = generateId();
        // Persist attachment in IndexedDB (offline-first)
        const attachmentId = `att_${qid}`;

        // Best-effort: compute file hash for exact-duplicate detection (same bytes)
        const fileHashPromise = computeFileSha256Hex(file);

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
            fileKind: isPdfFile(file) ? "pdf" : "image",
            fileMimeType: file.type || "",
            previewUrl,
            previewUrlSource,
            attachmentId,
            fileHash: "",
            status: "scanning",
            error: "",
            txType: "expense",
            amount: null,
            date: toISODate(new Date()),
            dateWasDefault: true,
            dateEdited: false,
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
            // Credit Card Installment (scan review)
            isInstallment: false,
            installmentMonths: 3,
            fromDigits: "",
            toDigits: "",
            suggestedCategoryId: "",
            suggestedReason: "",
          },
        ]);

        try {
          setScanStatus(humanizeScanStatus("", file.name));
          const result = await scanReceiptOpenAI(file, {
            onStatus: (s) => setScanStatus(humanizeScanStatus(s, file.name)),
            accounts,
          });

          const fileHash = await fileHashPromise;

          const aiTxType =
            result?.tx_type === "transfer" ? "transfer" : result?.tx_type === "income" ? "income" : "expense";

          const amount =
            typeof result?.amount === "number" ? result.amount : result?.amount != null ? Number(result.amount) : null;

          const amountSatang = amount != null ? parseMoneyToSatang(amount) : null;

          // NOTE: Thai slips may use Buddhist year (25xx). Normalize to AD (20xx).
          const extractedDate = fixBuddhistYearISO(result?.date || "");
          const dateWasDefault = !extractedDate;
          const d = extractedDate || toISODate(new Date());

          const merchant = String(result?.merchant || "").trim();
          const noteText = String(result?.note || "").trim();
          const mergedNote = noteText || merchant || "";

          const evidenceText = String(result?.evidence || "").trim();

          const contextText = `${merchant} ${noteText} ${evidenceText}`.trim();
          const rref = String(result?.ref || "").trim();
          const rrefKey = normalizeRefKey(rref);

          // Slip Hunter: enrich transfer slips with time + receiver bank (best-effort)
          const slipTime = parseSlipTimeFromText(evidenceText || contextText);
          const receiverBankId = guessSlipReceiverBankId(contextText || evidenceText);

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

// ---- NEW: payment method + account_id returned from OpenAI ----
const aiPaymentMethodRaw = String(result?.payment_method || result?.paymentMethod || "")
  .trim()
  .toLowerCase();
const aiPaymentMethod = ["cash", "card", "promptpay"].includes(aiPaymentMethodRaw) ? aiPaymentMethodRaw : "cash";
const aiAccountIdRaw = String(result?.account_id || result?.accountId || "").trim();
const aiAccountId = aiAccountIdRaw && accounts.some((a) => String(a?.id || "") === aiAccountIdRaw) ? aiAccountIdRaw : "";

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
  // Prefer account_id chosen by OpenAI (it has access to the user's account metadata).
  detectedAccountId = aiAccountId || matchedFromId || matchedToId || accountId || accounts?.[0]?.id || "";

  // If payment method is cash and we still don't have a confident match, default to the cash account if it exists.
  if (!aiAccountId && aiPaymentMethod === "cash") {
    const cashAcc = (accounts || []).find((a) => {
      const type = String(a?.type || "").toLowerCase();
      const id = String(a?.id || "").toLowerCase();
      const name = String(a?.name || "");
      const nameLow = name.toLowerCase();
      const icon = String(a?.icon || a?.emoji || "");
      return (
        type === "cash" ||
        id.includes("cash") ||
        nameLow.includes("เงินสด") ||
        nameLow.includes("cash") ||
        icon.includes("💵") ||
        icon.includes("💰")
      );
    });
    if (cashAcc?.id) detectedAccountId = cashAcc.id;
  }
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


          let fallbackKey =
            sanitizeCategoryKey(result?.category) || sanitizeCategoryKey(result?.category_key) || "other";

          // Slip Hunter: if this looks like a transfer/bill-payment slip, prefer category from receiver name.
          if ((docType === "transfer_slip" || docType === "bill_payment") && finalTxType === "expense") {
            const guessed = guessSlipCategoryKey(merchant || mergedNote);
            if (guessed) fallbackKey = guessed;
          }

          let groups = [];
          let primaryKey = fallbackKey;

          // ✅ Receipt items (expense): create item + adjustment lines (ignore 0฿ promo lines)
          if (finalTxType === "expense") {
            const payloadForLines = {
              items: scannedItems,
              adjustments: Array.isArray(result?.adjustments) ? result.adjustments : [],
              targetTotalSatang: amountSatang != null && amountSatang > 0 ? amountSatang : null,
            };

            const lines = splitReceiptItemsToLines("expense", payloadForLines, contextText, fallbackKey);
            if (lines.length) primaryKey = lines[0]?.key || fallbackKey;

            groups = (lines || [])
              .map((ln, idx) => {
                const isAdj = String(ln?.receiptLineType || "").toLowerCase().trim() === "adjustment";
                const key =
                  sanitizeCategoryKey(
                    ln.key ||
                      (isAdj
                        ? String(ln.adjustmentEffect || "").toLowerCase().trim() === "subtract"
                          ? "discount"
                          : "fees"
                        : "other")
                  ) || "other";
                const catId = ensureCategory("expense", key);

                const effect = String(ln?.adjustmentEffect || "").toLowerCase().trim();
                const adjustmentEffect = isAdj ? (effect === "subtract" ? "subtract" : "add") : "add";
                const adjustmentType = isAdj
                  ? String(ln?.adjustmentType || (adjustmentEffect === "subtract" ? "discount" : "fee"))
                  : null;

                return {
                  key,
                  categoryId: catId,
                  amount: parseMoneyToSatang(ln.amount),
                  note: String(ln.name || "").trim(),
                  splitIndex: idx + 1,
                  receiptLineType: isAdj ? "adjustment" : "item",
                  adjustmentEffect,
                  adjustmentType,
                  children: Array.isArray(ln?.children) ? ln.children.map((c) => ({ name: String(c?.name || '').trim(), amount: parseMoneyToSatang(c?.amount) })) : null,
                  childrenIncludedInParent: !!ln?.childrenIncludedInParent,
                };
              })
              .filter((g) => Number(g?.amount || 0) > 0);
          }

          // ✅ Income slips normally have no item lines
          if (finalTxType === "income") {
            primaryKey = fallbackKey;
            groups = [];
          }

          // ✅ Reconcile receipt total with an explicit adjustment line (e.g. discount)
          // IMPORTANT: Discounts must reduce paid total (net = items + surcharge - discount).
          const aiTotal = amountSatang != null ? amountSatang : 0;
          const chosenTotal = chooseReceiptPaidTotalSatang({ aiTotalSatang: aiTotal, groups, toleranceSatang: 200 });
          const usedNetOverride = !!chosenTotal?.usedNetOverride;
          const recTarget = Number(chosenTotal?.targetTotalSatang || 0);
          const reconciled = reconcileReceiptGroups(groups, recTarget, {
            ensureCategoryId: (k) => ensureCategory("expense", k),
            baseLineCountMin: 1,
          });
          groups = reconciled.groups;
          const sumsAfter = computeReceiptSumsSatang(groups);
          const groupSum = Math.abs(Number(sumsAfter?.netSatang || 0));
          // ✅ Default to split for receipts with multiple purchased items
          // (convenience-store receipts are the #1 pain point)
          const positiveScannedItemCount = Array.isArray(scannedItems)
            ? scannedItems.filter((it) => Number(it?.line_total ?? it?.total ?? it?.amount ?? 0) > 0).length
            : 0;
          const nonAdjGroupCount = (groups || []).filter((g) => !isAdjustmentLike(g)).length;
          let splitByCategory = finalTxType === "expense" && (nonAdjGroupCount >= 2 || positiveScannedItemCount >= 2);

          const scanWarnings = [];
          const scanFlags = result?.flags || null;
          const scanConfidence = result?.confidence || null;

          if (scanFlags?.needs_human_review) scanWarnings.push("NEEDS_HUMAN_REVIEW");
          if (scanFlags?.has_zero_price_lines) scanWarnings.push("HAS_ZERO_PRICE_LINES");
          if (scanFlags?.has_discount_lines) scanWarnings.push("HAS_DISCOUNT_LINES");
          if (usedNetOverride) scanWarnings.push("DISCOUNT_MATH_FIXED");

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

          const dupByRef = rrefKey ? (batchRefSet.has(rrefKey) || isDuplicateByRef(state.transactions || [], rref)) : false;
          if (rrefKey) batchRefSet.add(rrefKey);


          const pickedAmount = (() => {
            const a = amountSatang != null && amountSatang > 0 ? amountSatang : null;
            const g = groupSum && groupSum > 0 ? groupSum : null;

            // Prefer the computed "net" total (items +/- adjustments) so discount truly reduces expense.
            if (finalTxType === "transfer" || finalTxType === "credit_payment") return a ?? g;
            if (finalTxType === "expense") return g ?? a;
            return a ?? g;
          })();

          const reconcileMeta = {
            ...(reconciled?.meta || {}),
            itemsSubtotalSatang: Number(sumsAfter?.itemsSubtotalSatang || 0),
            discountSatang: Number(sumsAfter?.discountSatang || 0),
            surchargeSatang: Number(sumsAfter?.surchargeSatang || 0),
            netSatang: Number(sumsAfter?.netSatang || 0),
            usedNetOverride,
          };

          let patch = {
            status: "ready",
            fileHash: fileHash || "",
            txType: finalTxType,
            amount: pickedAmount,
            amountEdited: false,
            date: d,
            dateWasDefault,
            dateEdited: false,
            note: mergedNote,
            merchant,
            ref: rref,
            categoryId: finalTxType === "transfer" || finalTxType === "credit_payment" ? "transfer" : detectedCategoryId,
            accountId: detectedAccountId || (accounts?.[0]?.id || ""),
            paymentMethod: aiPaymentMethod,
            fromAccountId: detectedFromId || (accounts?.[0]?.id || ""),
            toAccountId: detectedToId || (accounts?.[0]?.id || ""),
            duplicate: dupByRef,
            includeDuplicate: !dupByRef,
            evidence: evidenceText.slice(0, 240),
            docType,
            scanWarnings,
            scanMeta: {
              docType,
              dateWasDefault,
              flags: scanFlags || null,
              confidence: scanConfidence || null,
              model: result?._model || null,
              endpointUsed: result?._endpointUsed || null,
              slip:
                docType === "transfer_slip" || docType === "bill_payment"
                  ? {
                      time: slipTime || "",
                      receiverBankId: receiverBankId || "",
                      transactionRef: rref || "",
                      receiverName: merchant || "",
                    }
                  : null,
              reconcile: reconcileMeta,
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
            // NOTE: `fromName/toName` were previously undefined here, which prevented rules from running.
            // Use matched internal account names (best-effort) as extra context for the rules engine.
            const bankText = `${matchedFromAcc?.name || ""} ${matchedToAcc?.name || ""}`.trim();
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

            // ✅ Prevent "Smart overwrite": if AI already confidently selected an account,
            // do NOT allow merchant prefs to overwrite it.
            const fallbackDefaultAccId = accounts?.[0]?.id || "";
            const hadStrongAccountMatch =
              (!!detectedAccountId && detectedAccountId !== fallbackDefaultAccId) ||
              !!bestMatchAccountId(accounts, fromDigits) ||
              !!bestMatchAccountId(accounts, toDigits) ||
              !!accountId;
            const accountForAutofill = hadStrongAccountMatch ? patch.accountId : "";

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
                      kind: (fuzzy?.reasons || []).includes('file exact match') ? 'file' : (fuzzy?.reasons || []).includes('ref exact match') ? 'ref' : 'fuzzy',
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
            fileHash: patch.fileHash || "",
            txType: patch.txType,
            type: patch.txType,
            amount: patch.amount,
            date: patch.date,
            dateWasDefault: patch.dateWasDefault,
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
          const code = err?.code ? String(err.code) : "";
          const msg = String(err?.message || err || "");
          const combined = code ? `${code}: ${msg || code}` : msg || "scan_failed";
          updateQueueItem(qid, { status: "error", error: combined });
        }
      }
    } finally {
      setIsScanning(false);
      setScanStatus("");
    }
  };

  const canCreateFromQueue = useMemo(() => {
    // ✅ Allow "บันทึกทันที" as long as there is at least one ready item.
    // Duplicates will be blocked until the user explicitly confirms.
    // Allow click even if amount is 0/missing; validation happens on save.
    return (queue || []).some((q) => q.status === "ready");
  }, [queue]);

  const canSendToInbox = useMemo(() => {
    return (queue || []).some((q) => q.status === "ready");
  }, [queue]);

  
  // Count only duplicates that are still "blocked" (user hasn't allowed saving duplicates yet)
  // If user toggled includeDuplicate = true, บันทึกทันที should proceed normally.
  const duplicateReadyCount = useMemo(() => {
    return (queue || []).filter((q) => q.status === "ready" && !!q.duplicate && !q.includeDuplicate).length;
  }, [queue]);

  const sendQueueToInbox = () => {
    const ready = (queue || []).filter((q) => q.status === "ready");
    if (!ready.length) {
      showAlert?.("ไม่มีรายการที่พร้อมส่งเข้า Inbox");
      return false;
    }

    const createdAt = Date.now();
    const serializable = ready.map((q) => {
      const {
        previewUrl: _previewUrl,
        previewUrlSource: _previewUrlSource,
        batchId: _batchId,
        status: _status,
        error: _error,
        ...rest
      } = q || {};
      const type = rest?.type || rest?.txType || "expense";
      const referenceId = rest?.referenceId || rest?.ref || "";
      const next = {
        ...rest,
        id: rest?.id || generateId(),
        createdAt,
        status: "pending",
        type,
        referenceId,
      };

      // ✅ If groups already exist (from scan), ensure Split is enabled
      if (Array.isArray(next?.groups) && next.groups.length >= 2 && !next.splitByCategory) {
        next.splitByCategory = true;
        next.splitGroupId = String(next?.splitGroupId || '').trim() || generateSplitGroupId();
        next.splitLabel =
          String(next?.splitLabel || next?.merchant || next?.note || 'Receipt').trim().slice(0, 80) || 'Receipt';
      }


      // ✅ Build receipt breakdown (items + adjustments) and auto-enable Split when purchased lines >= 2
      try {
        const docType = String(next?.docType || next?.doc_type || "").toLowerCase().trim();
        const txType = String(next?.txType || next?.type || type || "expense").toLowerCase().trim();
        const items = Array.isArray(next?.items) ? next.items : [];
        const adjustments = Array.isArray(next?.adjustments) ? next.adjustments : [];

        if (txType === "expense" && items.length && docType !== "transfer_slip" && docType !== "bill_payment") {
          // If scan already produced groups, keep them. Otherwise, derive from items+adjustments.
          let groups = Array.isArray(next?.groups) ? next.groups : [];
          if (!groups.length) {
            const hint = `${String(next?.merchant || "").trim()} ${String(next?.note || "").trim()}`.trim();
            const fallbackKey = String(next?.categoryId || next?.category_key || next?.category || "").trim() || "other";
            const targetTotalSatang = parseMoneyToSatang(next?.amount);
            const lines = splitReceiptItemsToLines("expense", { items, adjustments, targetTotalSatang }, hint, fallbackKey);

            groups = (lines || [])
              .filter((ln) => (Number(ln?.amount) || 0) > 0)
              .map((ln, idx) => {
                const key = sanitizeCategoryKey(ln?.key || "other") || "other";
                const categoryId = ensureCategory("expense", key);
                return {
                  key,
                  categoryId,
                  amount: parseMoneyToSatang(ln?.amount),
                  note: String(ln?.name || "").trim(),
                  receiptLineType: String(ln?.receiptLineType || "item"),
                  adjustmentType: String(ln?.adjustmentType || ""),
                  adjustmentEffect: String(ln?.adjustmentEffect || "add"),
                  children: Array.isArray(ln?.children) ? ln.children : null,
                  childrenIncludedInParent: !!ln?.childrenIncludedInParent,
                  splitIndex: idx + 1,
                  splitCount: (lines || []).length,
                };
              })
              .filter((g) => isPositiveNumber(g.amount));
          }

          // Persist groups for breakdown even when not splitting
          if (groups.length) {
            next.groups = groups;
          }

          const purchasedCount = (groups || []).filter((g) => String(g?.receiptLineType || "item").toLowerCase().trim() !== "adjustment").length;
          if (purchasedCount >= 2) {
            next.splitByCategory = true;
            next.splitGroupId = String(next?.splitGroupId || "").trim() || generateSplitGroupId();
            next.splitLabel = String(next?.splitLabel || next?.merchant || next?.note || "Receipt").trim().slice(0, 80) || "Receipt";
          } else {
            next.splitByCategory = false;
            next.splitGroupId = "";
            next.splitLabel = "";
          }
        }
      } catch {
        // ignore - keep inbox item as-is
      }

      return next;
    });

    addScanInboxItems(serializable);
    clearQueue();
    setDupDecisionOpen(false);
    navigate("inbox");
    showAlert?.(`ส่งเข้า Inbox ${serializable.length} รายการแล้ว`);
    return true;
  };

  // ✅ Auto-send only the just-scanned batch to Inbox (multi-files flow)
  const sendBatchToInbox = (batchId) => {
    const ready = (queue || []).filter((q) => q.status === "ready" && q.batchId === batchId);
    if (!ready.length) {
      showAlert?.("ไม่มีรายการที่พร้อมส่งเข้า Inbox");
      return false;
    }

    const createdAt = Date.now();
    const serializable = ready.map((q) => {
      const {
        previewUrl: _previewUrl,
        previewUrlSource: _previewUrlSource,
        batchId: _bid,
        status: _status,
        error: _error,
        ...rest
      } = q || {};
      const type = rest?.type || rest?.txType || "expense";
      const referenceId = rest?.referenceId || rest?.ref || "";
      const next = {
        ...rest,
        id: rest?.id || generateId(),
        createdAt,
        status: "pending",
        type,
        referenceId,
      };

      // ✅ If groups already exist (from scan), ensure Split is enabled
      if (Array.isArray(next?.groups) && next.groups.length >= 2 && !next.splitByCategory) {
        next.splitByCategory = true;
        next.splitGroupId = String(next?.splitGroupId || "").trim() || generateSplitGroupId();
        next.splitLabel =
          String(next?.splitLabel || next?.merchant || next?.note || "Receipt").trim().slice(0, 80) || "Receipt";
      }

      // ✅ Build receipt breakdown (items + adjustments) and auto-enable Split when purchased lines >= 2
      try {
        const docType = String(next?.docType || next?.doc_type || "").toLowerCase().trim();
        const txType = String(next?.txType || next?.type || type || "expense").toLowerCase().trim();
        const items = Array.isArray(next?.items) ? next.items : [];
        const adjustments = Array.isArray(next?.adjustments) ? next.adjustments : [];

        if (txType === "expense" && items.length && docType !== "transfer_slip" && docType !== "bill_payment") {
          // If scan already produced groups, keep them. Otherwise, derive from items+adjustments.
          let groups = Array.isArray(next?.groups) ? next.groups : [];
          if (!groups.length) {
            const hint = `${String(next?.merchant || "").trim()} ${String(next?.note || "").trim()}`.trim();
            const fallbackKey = String(next?.categoryId || next?.category_key || next?.category || "").trim() || "other";
            const targetTotalSatang = parseMoneyToSatang(next?.amount);
            const lines = splitReceiptItemsToLines("expense", { items, adjustments, targetTotalSatang }, hint, fallbackKey);

            groups = (lines || [])
              .filter((ln) => (Number(ln?.amount) || 0) > 0)
              .map((ln, idx) => {
                const key = sanitizeCategoryKey(ln?.key || "other") || "other";
                const categoryId = ensureCategory("expense", key);
                return {
                  key,
                  categoryId,
                  amount: parseMoneyToSatang(ln?.amount),
                  note: String(ln?.name || "").trim(),
                  receiptLineType: String(ln?.receiptLineType || "item"),
                  adjustmentType: String(ln?.adjustmentType || ""),
                  adjustmentEffect: String(ln?.adjustmentEffect || "add"),
                  children: Array.isArray(ln?.children) ? ln.children : null,
                  childrenIncludedInParent: !!ln?.childrenIncludedInParent,
                  splitIndex: idx + 1,
                  splitCount: (lines || []).length,
                };
              })
              .filter((g) => isPositiveNumber(g.amount));
          }

          // Persist groups for breakdown even when not splitting
          if (groups.length) {
            next.groups = groups;
          }

          const purchasedCount = (groups || []).filter((g) => String(g?.receiptLineType || "item").toLowerCase().trim() !== "adjustment").length;
          if (purchasedCount >= 2) {
            next.splitByCategory = true;
            next.splitGroupId = String(next?.splitGroupId || "").trim() || generateSplitGroupId();
            next.splitLabel = String(next?.splitLabel || next?.merchant || next?.note || "Receipt").trim().slice(0, 80) || "Receipt";
          } else {
            next.splitByCategory = false;
            next.splitGroupId = "";
            next.splitLabel = "";
          }
        }
      } catch {
        // ignore - keep inbox item as-is
      }

      return next;
    });

    addScanInboxItems(serializable);
    removeQueueItems(ready.map((q) => q.id));
    setDupDecisionOpen(false);
    navigate("inbox");
    showAlert?.(`ส่งเข้า Inbox ${serializable.length} รายการแล้ว`);
    return true;
  };

  // ✅ Multi-files auto send: when scan finishes and all files are ready, auto-send that batch to Inbox
  useEffect(() => {
    const cfg = scanAutoSendRef.current;
    if (!cfg?.enabled || cfg?.triggered) return;
    if (scanBatchIdRef.current !== cfg.batchId) return;
    if (isScanning) return;

    const batchItems = (queue || []).filter((q) => q.batchId === cfg.batchId);
    if (!batchItems.length) return;

    const stillScanning = batchItems.some((q) => q.status === "scanning");
    if (stillScanning) return;

    const hasError = batchItems.some((q) => q.status === "error");
    if (hasError) {
      scanAutoSendRef.current = { ...cfg, triggered: true };
      showAlert?.("มีไฟล์บางรายการสแกนไม่สำเร็จ กรุณาตรวจสอบก่อนส่งเข้า Inbox");
      return;
    }

    const hasReady = batchItems.some((q) => q.status === "ready");
    if (!hasReady) return;

    scanAutoSendRef.current = { ...cfg, triggered: true };
    sendBatchToInbox(cfg.batchId);
  }, [queue, isScanning]);

  // Send only *blocked duplicates* to Inbox (used when user chose "บันทึกทันที" but wants to handle duplicates later)
  const sendDuplicateQueueToInbox = () => {
    const dups = (queue || []).filter((q) => q.status === "ready" && !!q.duplicate && !q.includeDuplicate);
    if (!dups.length) {
      showAlert?.("ไม่มีรายการซ้ำให้ส่งเข้า Inbox");
      return false;
    }

    const createdAt = Date.now();
    const serializable = dups.map((q) => {
      const {
        previewUrl: _previewUrl,
        previewUrlSource: _previewUrlSource,
        batchId: _batchId,
        status: _status,
        error: _error,
        ...rest
      } = q || {};
      const type = rest?.type || rest?.txType || "expense";
      const referenceId = rest?.referenceId || rest?.ref || "";
      const next = {
        ...rest,
        id: rest?.id || generateId(),
        createdAt,
        status: "pending",
        type,
        referenceId,
      };

      // ✅ If groups already exist (from scan), ensure Split is enabled
      if (Array.isArray(next?.groups) && next.groups.length >= 2 && !next.splitByCategory) {
        next.splitByCategory = true;
        next.splitGroupId = String(next?.splitGroupId || '').trim() || generateSplitGroupId();
        next.splitLabel =
          String(next?.splitLabel || next?.merchant || next?.note || 'Receipt').trim().slice(0, 80) || 'Receipt';
      }


      // ✅ Build receipt breakdown (items + adjustments) and auto-enable Split when purchased lines >= 2 (duplicate flow)
      try {
        const docType = String(next?.docType || next?.doc_type || "").toLowerCase().trim();
        const txType = String(next?.txType || next?.type || type || "expense").toLowerCase().trim();
        const items = Array.isArray(next?.items) ? next.items : [];
        const adjustments = Array.isArray(next?.adjustments) ? next.adjustments : [];

        if (txType === "expense" && items.length && docType !== "transfer_slip" && docType !== "bill_payment") {
          // If scan already produced groups, keep them. Otherwise, derive from items+adjustments.
          let groups = Array.isArray(next?.groups) ? next.groups : [];
          if (!groups.length) {
            const hint = `${String(next?.merchant || "").trim()} ${String(next?.note || "").trim()}`.trim();
            const fallbackKey = String(next?.categoryId || next?.category_key || next?.category || "").trim() || "other";
            const targetTotalSatang = parseMoneyToSatang(next?.amount);
            const lines = splitReceiptItemsToLines("expense", { items, adjustments, targetTotalSatang }, hint, fallbackKey);

            groups = (lines || [])
              .filter((ln) => (Number(ln?.amount) || 0) > 0)
              .map((ln, idx) => {
                const key = sanitizeCategoryKey(ln?.key || "other") || "other";
                const categoryId = ensureCategory("expense", key);
                return {
                  key,
                  categoryId,
                  amount: parseMoneyToSatang(ln?.amount),
                  note: String(ln?.name || "").trim(),
                  receiptLineType: String(ln?.receiptLineType || "item"),
                  adjustmentType: String(ln?.adjustmentType || ""),
                  adjustmentEffect: String(ln?.adjustmentEffect || "add"),
                  children: Array.isArray(ln?.children) ? ln.children : null,
                  childrenIncludedInParent: !!ln?.childrenIncludedInParent,
                  splitIndex: idx + 1,
                  splitCount: (lines || []).length,
                };
              })
              .filter((g) => isPositiveNumber(g.amount));
          }

          // Persist groups for breakdown even when not splitting
          if (groups.length) {
            next.groups = groups;
          }

          const purchasedCount = (groups || []).filter((g) => String(g?.receiptLineType || "item").toLowerCase().trim() !== "adjustment").length;
          if (purchasedCount >= 2) {
            next.splitByCategory = true;
            next.splitGroupId = String(next?.splitGroupId || "").trim() || generateSplitGroupId();
            next.splitLabel = String(next?.splitLabel || next?.merchant || next?.note || "Receipt").trim().slice(0, 80) || "Receipt";
          } else {
            next.splitByCategory = false;
            next.splitGroupId = "";
            next.splitLabel = "";
          }
        }
      } catch {
        // ignore
      }

      return next;
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
      // ✅ Save everything that is already "allowed" (non-duplicates + duplicates user already allowed),
      // then ask what to do with the remaining *blocked* duplicates.
      const savableCount = (queue || []).filter((q) => q.status === "ready" && (!q.duplicate || q.includeDuplicate)).length;
      if (savableCount > 0) {
        createTransactionsFromQueue({ scope: "all", duplicateMode: "respect", navigateToDashboard: false });
      }
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
      const dupIds = (queue || []).filter((q) => q.status === "ready" && !!q.duplicate && !q.includeDuplicate).map((q) => q.id);
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
    let base = (queue || []).filter((q) => q.status === "ready");

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

    // ✅ Normalize scanned queue items so "บันทึกทันที" works even when:
    // - split receipts have missing/invalid per-line categories
    // - split receipts end up with <2 purchasable lines (auto-fallback to non-split)
    // - parent amount is missing but line totals exist (use signed sum)
    const expenseCatIds = new Set((expenseCats || []).map((c) => String(c?.id || "")));
    const incomeCatIds = new Set((incomeCats || []).map((c) => String(c?.id || "")));

    const normalizeCategoryId = (txType, catId) => {
      const id = String(catId || "").trim();
      if (!id || id === "transfer") return ensureCategory(txType, "other");
      const set = txType === "income" ? incomeCatIds : expenseCatIds;
      if (set.has(id)) return id;
      return ensureCategory(txType, "other");
    };

    const normalizedReady = ready.map((q) => {
      const next = { ...(q || {}) };
      const txType = String(next.txType || next.type || "").toLowerCase().trim() || "expense";

      if (txType === "income" || txType === "expense") {
        next.categoryId = normalizeCategoryId(txType, next.categoryId);
      }

      // Fix split receipts: ensure each line has a category, and auto-fallback if not a real split.
      if (txType === "expense" && next.splitByCategory && Array.isArray(next.groups) && next.groups.length) {
        const fixedGroups = (next.groups || [])
          .map((g) => {
            const gg = g && typeof g === "object" ? g : {};
            const amount = Number(gg.amount) || 0;
            if (amount <= 0) return null;

            const rawCat = String(gg.categoryId || gg.category || "").trim();
            const categoryId = rawCat && expenseCatIds.has(rawCat) ? rawCat : next.categoryId;

            return { ...gg, amount, categoryId };
          })
          .filter(Boolean);

        const nonAdj = fixedGroups.filter((g) => !isAdjustmentLike(g));

        const signedSum = fixedGroups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
        if (!isPositiveNumber(Number(next.amount))) {
          next.amount = signedSum;
        }

        next.groups = fixedGroups;

        if (nonAdj.length < 2) {
          // Not enough purchasable lines for a true split; save as a normal expense but keep receiptLines meta.
          next.splitByCategory = false;
        } else {
          next.splitByCategory = true;
          next.splitGroupId = String(next.splitGroupId || "").trim() || generateSplitGroupId();
          next.splitLabel =
            String(next.splitLabel || next.merchant || next.note || "Receipt").trim().slice(0, 80) || "Receipt";
        }
      }

      return next;
    });

    // ✅ Allow clicking "บันทึกทันที" even if amount is 0/missing, but block saving until amounts are valid.
    const badAmounts = normalizedReady.filter((q) => {
      // For split receipts, allow saving if the group total is positive even when parent amount is missing.
      if (
        q?.txType === "expense" &&
        q?.splitByCategory &&
        Array.isArray(q?.groups) &&
        q.groups.length
      ) {
        const groupSum = (q.groups || []).reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
        return !isPositiveNumber(Number(groupSum));
      }
      return !isPositiveNumber(Number(q?.amount));
    });

    if (badAmounts.length) {
      const label = String(badAmounts[0]?.fileName || "").trim();
      showAlert?.(`กรุณากรอกยอดเงินให้มากกว่า 0${label ? ` (${label})` : ""}`);
      return false;
    }

    for (const q of normalizedReady) {
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

        // ✅ Credit card installment validation (scan review)
        if (q.isInstallment) {
          if (q.txType !== "expense") return showAlert?.("ผ่อนชำระใช้ได้เฉพาะรายการรายจ่าย");
          if (q.splitByCategory) return showAlert?.("ผ่อนชำระ: ไม่สามารถใช้ร่วมกับโหมดแยกหมวดได้");

          const acc = accounts.find((a) => String(a?.id || "") === String(q.accountId || "")) || null;
          if (!acc || !isCreditAccount(acc)) return showAlert?.("ผ่อนชำระ: ต้องเลือกบัญชีเป็นบัตรเครดิต");

          const m = Math.max(2, Math.min(120, Math.trunc(Number(q.installmentMonths) || 2)));
          if (m < 2) return showAlert?.("ผ่อนชำระ: จำนวนงวดต้องมากกว่าหรือเท่ากับ 2");
        }

        if (q.txType === "expense" && q.splitByCategory && Array.isArray(q.groups) && q.groups.length) {
          // ✅ Ignore zero/invalid lines: only create split transactions for amount > 0
          const positives = q.groups
            .map((g) => ({ ...g, amount: Number(g.amount) || 0 }))
            .filter((g) => g.amount > 0);

          const nonAdjPositives = positives.filter((g) => !isAdjustmentLike(g));

          if (nonAdjPositives.length < 2) {
            return showAlert?.("Split ต้องมีอย่างน้อย 2 รายการสินค้า (ไม่รวมส่วนลด/ค่าธรรมเนียม)");
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

    const locationForSave = currentLocationRef.current
      ? { lat: currentLocationRef.current.lat, lng: currentLocationRef.current.lng }
      : null;

    const buildScanMetaForTx = (q) => {
      const base = q && typeof q === "object" ? q : {};
      const sm = base.scanMeta && typeof base.scanMeta === "object" ? base.scanMeta : null;
      const reconcile = sm?.reconcile && typeof sm.reconcile === "object" ? sm.reconcile : null;
      const slip = sm?.slip && typeof sm.slip === "object" ? sm.slip : null;
      // Keep meta compact and stable
      return {
        ...(reconcile || {}),
        slip: slip || null,
        docType: String(base.docType || sm?.docType || "").trim() || null,
      };
    };

    const txs = [];
    for (const q of normalizedReady) {
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
          fileHash: String(q.fileHash || '').trim() || null,

          // Smart Geolocation
          location: locationForSave,

          // Slip Hunter / Scan meta
          meta: buildScanMetaForTx(q),

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
          fileHash: String(q.fileHash || '').trim() || null,

          // Smart Geolocation
          location: locationForSave,

          // Slip Hunter / Scan meta
          meta: buildScanMetaForTx(q),

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
        let groups = (q.groups || [])
          .map((g) => {
            const note = String(g?.note || "").trim();
            const catId = String(g?.categoryId || "").trim();
            const looksLikeDiscount = catId === "discount" || note.includes("ส่วนลด");
            const isAdj = isAdjustmentLike(g) || looksLikeDiscount;
            const adjEffectRaw = String(g?.adjustmentEffect || "").toLowerCase().trim();
            const adjustmentEffect = adjEffectRaw || (isAdj ? (looksLikeDiscount ? "subtract" : "add") : "add");
            const receiptLineType = isAdj ? "adjustment" : "item";
            const adjustmentType = isAdj ? (looksLikeDiscount ? "discount" : String(g?.adjustmentType || "fee")) : null;

            return {
              ...g,
              amount: Number(g.amount) || 0,
              note,
              categoryId: catId,
              receiptLineType,
              adjustmentType,
              adjustmentEffect,
            };
          })
          .filter((g) => g.amount > 0);

        // keep original order (OCR order); if splitIndex exists, respect it
        groups.sort((a, b) => {
          const ai = Number(a?.splitIndex || 0);
          const bi = Number(b?.splitIndex || 0);
          if (ai && bi && ai !== bi) return ai - bi;
          return 0;
        });

        const splitGroupId = String(q?.splitGroupId || "").trim() || generateSplitGroupId();
        const groupLabel = String(q?.splitLabel || merchant || baseNoteRaw || "Split").trim().slice(0, 80) || "Split";

        const parentId = generateId();

        // ✅ Parent total is the paid total (net = items + surcharge - discount).
        // If an older queue item has a gross total (discount accidentally added), auto-correct.
        let parentAmount = Number(q.amount) || 0;
        const chosenParent = chooseReceiptPaidTotalSatang({ aiTotalSatang: parentAmount, groups, toleranceSatang: 200 });
        parentAmount = Math.abs(Number(chosenParent?.targetTotalSatang || 0));
        if (!(parentAmount > 0)) {
          // fallback: derive from current groups using signed math
          parentAmount = Math.abs(groups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0));
        }

        const rec = reconcileReceiptGroups(groups, parentAmount, {
          ensureCategoryId: (k) => ensureCategory("expense", k),
          baseLineCountMin: 2,
        });
        groups = rec.groups;
        const splitCount = groups.length;

        const paidTotalSatang = groups.reduce((s, g) => s + signedReceiptGroupSatang(g), 0);
        if (paidTotalSatang > 0) parentAmount = paidTotalSatang;

        const itemsSubtotalSatang = groups
          .filter((g) => !isAdjustmentLike(g))
          .reduce((s, g) => s + (Number(g.amount) || 0), 0);
        const discountSatang = groups
          .filter((g) => isAdjustmentLike(g) && String(g.adjustmentEffect || "").toLowerCase().trim() === "subtract")
          .reduce((s, g) => s + (Number(g.amount) || 0), 0);
        const surchargeSatang = groups
          .filter((g) => isAdjustmentLike(g) && String(g.adjustmentEffect || "").toLowerCase().trim() === "add")
          .reduce((s, g) => s + (Number(g.amount) || 0), 0);

        // ✅ Parent category for split receipts:
        // - If children have multiple categories → parent = "mixed" (UI-only parent)
        // - If children all same category → use that category
        const uniqueCats = Array.from(
          new Set(
            groups
              .filter((g) => !isAdjustmentLike(g))
              .map((g) => String(g?.categoryId || "").trim())
              .filter(Boolean)
          )
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
          fileHash: String(q.fileHash || '').trim() || null,

          // Smart Geolocation
          location: locationForSave,

          // Slip Hunter / Scan meta
          meta: buildScanMetaForTx(q),

          paymentMethod: q.paymentMethod || "cash",

          receiptPaidTotalSatang: parentAmount,
          receiptItemsSubtotalSatang: itemsSubtotalSatang,
          receiptDiscountSatang: discountSatang,
          receiptSurchargeSatang: surchargeSatang,

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
            fileHash: String(q.fileHash || '').trim() || null,

            // Smart Geolocation
            location: locationForSave,

            // Slip Hunter / Scan meta
            meta: buildScanMetaForTx(q),

            paymentMethod: q.paymentMethod || "cash",
            receiptLineType: g.receiptLineType || "item",
            adjustmentType: g.adjustmentType || null,
            adjustmentEffect: g.adjustmentEffect || "add",

            splitGroupId,
            splitIndex: Number(g?.splitIndex || 0) || idx + 1,
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



      // ✅ Preserve receipt breakdown (items + discounts/fees + children) even when saving as a single transaction
      const receiptLines =
        q.txType === "expense" && Array.isArray(q.groups) && q.groups.length
          ? (q.groups || [])
              .map((g, idx) => {
                const gg = g && typeof g === "object" ? g : {};
                const isAdj = isAdjustmentLike(gg) || String(gg.receiptLineType || "").toLowerCase().trim() === "adjustment";
                const rawAmt = typeof gg.amount === "number" ? gg.amount : Number(gg.amount);
                const amt = Number.isFinite(rawAmt) ? Math.round(rawAmt) : 0;
                const effect = String(gg.adjustmentEffect || gg.effect || "").toLowerCase().trim();
                const adjEffect = isAdj ? (effect === "subtract" ? "subtract" : "add") : "add";

                return {
                  key: String(gg.key || "").trim() || null,
                  categoryId: String(gg.categoryId || gg.category || "").trim() || null,
                  amount: Math.abs(amt),
                  note: String(gg.note || gg.name || "").trim() || null,
                  splitIndex: Number(gg.splitIndex || 0) || idx + 1,
                  receiptLineType: isAdj ? "adjustment" : "item",
                  adjustmentEffect: adjEffect,
                  adjustmentType: isAdj ? String(gg.adjustmentType || "").trim() || null : null,
                  children: Array.isArray(gg.children)
                    ? gg.children
                        .map((c) => {
                          const cc = c && typeof c === "object" ? c : {};
                          const ca = typeof cc.amount === "number" ? cc.amount : Number(cc.amount);
                          const camt = Number.isFinite(ca) ? Math.round(ca) : 0;
                          const nm = String(cc.name || "").trim();
                          if (!nm && !camt) return null;
                          return { name: nm || "—", amount: Math.abs(camt) };
                        })
                        .filter(Boolean)
                    : null,
                  childrenIncludedInParent: !!gg.childrenIncludedInParent,
                };
              })
              .filter((l) => Number(l?.amount || 0) > 0)
          : null;

      // ✅ Receipt totals must respect adjustments (discount subtracts from paid total)
      const receiptChosen = receiptLines
        ? chooseReceiptPaidTotalSatang({ aiTotalSatang: Number(q.amount) || 0, groups: receiptLines, toleranceSatang: 200 })
        : null;
      const receiptPaidTotalSatang = receiptLines ? Math.abs(Number(receiptChosen?.targetTotalSatang || 0)) : null;
      const receiptItemsSubtotalSatang = receiptLines ? Number(receiptChosen?.itemsSubtotalSatang || 0) : null;
      const receiptDiscountSatang = receiptLines ? Number(receiptChosen?.discountSatang || 0) : null;
      const receiptSurchargeSatang = receiptLines ? Number(receiptChosen?.surchargeSatang || 0) : null;

      const baseAmountSatang = receiptLines
        ? receiptPaidTotalSatang > 0
          ? receiptPaidTotalSatang
          : Number(q.amount) || 0
        : Number(q.amount) || 0;

      const baseTx = {
        id: generateId(),
        type: q.txType === "income" ? "income" : "expense",
        amount: baseAmountSatang,
        category: q.categoryId,
        accountId: q.accountId,
        date: d,
        note: baseNote,
        isTransfer: false,
        transferId: null,
        ref: q.ref || null,
        source: "scan",
        attachmentId: q.attachmentId || null,
        fileHash: String(q.fileHash || '').trim() || null,

        // Smart Geolocation
        location: locationForSave,

        // Slip Hunter / Scan meta
        meta: buildScanMetaForTx(q),

        paymentMethod: q.paymentMethod || "cash",

        receiptLines: receiptLines || null,
        receiptPaidTotalSatang: receiptPaidTotalSatang,
        receiptItemsSubtotalSatang: receiptItemsSubtotalSatang,
        receiptDiscountSatang: receiptDiscountSatang,
        receiptSurchargeSatang: receiptSurchargeSatang,

        merchant: merchant || null,
        evidence: String(q.evidence || "").slice(0, 240) || null,
        from_account: String(q.fromDigits || "").trim() || null,
        to_account: String(q.toDigits || "").trim() || null,
        counterparty_digits: String(q.toDigits || q.fromDigits || "").trim() || null,
      };

      // ✅ Credit card installment (scan review) - expand into monthly transactions
      if (q.isInstallment) {
        const m = Math.max(2, Math.min(120, Math.trunc(Number(q.installmentMonths) || 2)));
        const groupId = generateId();
        const expanded = expandTransactionToInstallments(
          { ...baseTx, id: undefined, installmentGroupId: groupId },
          m,
          { groupId, makeId: () => generateId() }
        ).map((t, idx) => {
          // keep heavy receipt breakdown only on the first installment (saves storage)
          const keep = idx === 0;
          return {
            ...t,
            id: t.id || generateId(),
            receiptLines: keep ? baseTx.receiptLines : null,
            receiptPaidTotalSatang: keep ? baseTx.receiptPaidTotalSatang : null,
            receiptItemsSubtotalSatang: keep ? baseTx.receiptItemsSubtotalSatang : null,
            receiptDiscountSatang: keep ? baseTx.receiptDiscountSatang : null,
            receiptSurchargeSatang: keep ? baseTx.receiptSurchargeSatang : null,
          };
        });

        txs.push(...expanded);
      } else {
        txs.push(baseTx);
      }
    }

    bulkUpsertTransactions(txs, { navigateToDashboard });

    // ✅ Smart Merchant Dictionary: learn mapping from confirmed saved transactions
    try {
      for (const tx of txs) {
        const t = String(tx?.type || "").toLowerCase();
        if (t !== "expense" && t !== "income") continue;
        const m = String(tx?.merchant || "").trim();
        if (!m) continue;
        learnMerchant?.({
          merchant: m,
          txType: t,
          categoryId: String(tx?.category || ""),
          accountId: String(tx?.accountId || ""),
          location: tx?.location || null,
        });
      }
    } catch {
      // ignore
    }

    // ✅ remove only the queue items we actually saved (so duplicates can remain blocked/pending)
    removeQueueItems(normalizedReady.map((q) => q.id));

    showAlert?.(`บันทึก ${txs.length} รายการแล้ว`);
    return true;
  };

  // ===== manual save/delete =====
  const beginSaveLock = () => {
    if (savingLockRef.current) return false;
    savingLockRef.current = true;
    setIsSaving(true);
    return true;
  };

  const releaseSaveLock = () => {
    // small delay: prevents "double tap" firing before navigation/unmount
    window.setTimeout(() => {
      savingLockRef.current = false;
      setIsSaving(false);
    }, 700);
  };

  const handleSaveManual = () => {
    if (savingLockRef.current) return;
    const d = String(date || toISODate(new Date())).slice(0, 10);
    const noteText = String(note || "").trim();
    const refText = String(ref || "").trim();

    // Smart Geolocation: store the latest known position (best-effort)
    const locationForSave = currentLocationRef.current
      ? { lat: currentLocationRef.current.lat, lng: currentLocationRef.current.lng }
      : null;

    // Merchant extraction for manual entries (so geo + history can learn)
    const existingMerchant = String(initialData?.merchant || "").trim();
    const slipReceiver = String(slipMeta?.receiverName || slipMeta?.receiver_name || "").trim();
    const merchantFromNote = extractMerchantFromNote(noteText);
    const merchantForSave = existingMerchant || slipReceiver || merchantFromNote || "";

    const metaForSave = (() => {
      const prev = initialData?.meta && typeof initialData.meta === "object" ? initialData.meta : {};
      const out = { ...prev };
      if (slipMeta && typeof slipMeta === "object") {
        // keep slip meta in a stable namespace
        out.slip = {
          ...slipMeta,
          receiverName: String(slipMeta?.receiverName || slipMeta?.receiver_name || merchantForSave || "").trim() || null,
        };
      }
      return Object.keys(out).length ? out : null;
    })();

    const locationPatch = locationForSave ? { location: locationForSave } : {};
    const metaPatch = metaForSave ? { meta: metaForSave } : {};
    const merchantPatch = merchantForSave ? { merchant: merchantForSave } : {};

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

const transferId =
  transferPair?.transferId ||
  transferPair?.outTx?.transferId ||
  transferPair?.inTx?.transferId ||
  initialData?.transferId ||
  generateTransferId();
const outId =
  transferPair?.outTx?.id ||
  (initialData?.isTransfer && String(initialData?.type || "").toLowerCase() === "expense" ? initialData.id : null) ||
  generateId();
const inId =
  transferPair?.inTx?.id ||
  (initialData?.isTransfer && String(initialData?.type || "").toLowerCase() === "income" ? initialData.id : null) ||
  generateId();

      const kind = type === "credit_payment" ? "credit_payment" : "transfer";
      const defaultNote =
        kind === "credit_payment"
          ? `ชำระบัตรเครดิต • ${(toAcc?.name || "Credit Card").trim()}`
          : "Transfer";

      if (!beginSaveLock()) return;
      try {
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

          ...locationPatch,
          ...metaPatch,
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

          ...locationPatch,
          ...metaPatch,
        },
        ]);
      } finally {
        releaseSaveLock();
      }
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

        ...merchantPatch,
        ...locationPatch,
        ...metaPatch,

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

          ...merchantPatch,
          ...locationPatch,
          ...metaPatch,

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

      if (!beginSaveLock()) return;
      try {
        if (removedIds.length) {
          deleteManyTransactions(removedIds, { navigateToDashboard: false });
        }

        bulkUpsertTransactions([parentTx, ...childTxs], { navigateToDashboard: true });
      } finally {
        releaseSaveLock();
      }
      return;
    }

    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");
    if (!amountNumber || amountNumber <= 0) return showAlert?.("กรุณาระบุจำนวนเงินให้ถูกต้อง");

    // ✅ Validate category/type compatibility (prevents cross-type corruption)
    const allowedCats = type === "income" ? incomeCats : expenseCats;
    let categoryForSave = String(categoryId || "").trim();
    if (!categoryForSave) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!allowedCats.some((c) => String(c?.id || "") === categoryForSave)) {
      const fallback = String(allowedCats?.[0]?.id || "").trim();
      if (!fallback) return showAlert?.("ไม่พบหมวดหมู่ที่ใช้งานได้สำหรับประเภทนี้");
      categoryForSave = fallback;
      setCategoryId(fallback);
      showAlert?.("หมวดหมู่เดิมไม่ตรงกับประเภทรายการ → เลือกหมวดเริ่มต้นให้แล้ว");
    }

    if (!beginSaveLock()) return;
    try {

    // ✅ If this transaction used to be a transfer but user changed type to expense/income,
    // delete the counterpart leg(s) to avoid "phantom transfer" leftovers.
    if (initialData?.isTransfer) {
      const tidPrev = String(initialData?.transferId || "").trim();
      if (tidPrev) {
        const otherIds = (state.transactions || [])
          .filter(
            (t) =>
              !!t?.isTransfer &&
              String(t?.transferId || "").trim() === tidPrev &&
              String(t?.id || "") !== String(initialData.id || "")
          )
          .map((t) => String(t?.id || ""))
          .filter(Boolean);

        if (otherIds.length) deleteManyTransactions(otherIds, { navigateToDashboard: false });
      }
    }

    // ✅ If this transaction used to be a split group but user disabled split mode,
    // delete children and clear split flags to prevent "zombie split children".
    const prevGid = String(initialData?.splitGroupId || "").trim();
    if (prevGid) {
      const parentId = String(
        initialData?.isSplitParent
          ? initialData.id
          : (splitGroupTransactions || []).find((t) => !!t?.isSplitParent)?.id || initialData?.splitParentId || ""
      ).trim();

      const toDelete = new Set();
      for (const t of state.transactions || []) {
        if (!t || t.isTransfer) continue;

        const gid = String(t?.splitGroupId || "").trim();
        const pid = String(t?.splitParentId || "").trim();
        const id = String(t?.id || "");
        if (!id) continue;
        if (id === String(initialData.id || "")) continue;

        if (gid && gid === prevGid) toDelete.add(id);
        if (parentId && pid && pid === parentId) toDelete.add(id);
      }

      const deleteIds = Array.from(toDelete);
      if (deleteIds.length) deleteManyTransactions(deleteIds, { navigateToDashboard: false });
    }

    const baseTx = {
      // id is intentionally omitted for new installments (generated per-tx)
      id: initialData?.id,
      type: type === "income" ? "income" : "expense",
      amount: amountNumber,
      category: categoryForSave,
      accountId,
      date: d,
      note: noteText,
      tags: tags.length ? tags : null,
      isTransfer: false,
      transferId: null,
      transferKind: null,
      ref: refText || null,
      source: "manual",
      attachmentId: initialAttachmentId || null,

      ...merchantPatch,
      ...locationPatch,
      ...metaPatch,

      // ✅ clear split fields (important for collapsing split -> single)
      splitGroupId: null,
      splitCount: null,
      splitLabel: null,
      isSplit: false,
      isSplitParent: false,
      isSplitChild: false,
      splitIndex: null,
      splitParentId: null,
    };

    // ✅ Credit card installment (manual)
    if (!isEditMode && isInstallment && type === "expense" && !isSplitMode && isCreditAccount(selectedManualAccount)) {
      const m = Math.max(2, Math.min(120, Math.trunc(Number(installmentMonths) || 2)));
      const groupId = generateId();
      const txs = expandTransactionToInstallments(
        { ...baseTx, id: undefined, installmentGroupId: groupId },
        m,
        { groupId, makeId: () => generateId() }
      ).map((t) => ({ ...t, id: t.id || generateId() }));

      bulkUpsertTransactions(txs, { navigateToDashboard: true });
      return;
    }

    upsertTransaction(baseTx);

    // ✅ Learn from edits (so next scan is smarter)
    try {
      const m = String(merchantForSave || "").trim();
      if (m) {
        learnMerchant?.({
          merchant: m,
          txType: type === "income" ? "income" : "expense",
          categoryId: categoryForSave,
          accountId: String(accountId || ""),
          location: locationForSave || null,
        });
      }
    } catch {
      // ignore
    }
    } finally {
      releaseSaveLock();
    }
  };


const handleDelete = () => {
  if (!initialData?.id) {
    showAlert?.("ไม่พบรายการสำหรับลบ");
    return;
  }

  // ✅ Transfer / credit payment: delete all legs that share the same transferId.
  // This prevents "เหลือขาเดียว" when transferPair can't be found due to data corruption.
  if (initialData.isTransfer) {
    const tid = String(initialData.transferId || transferPair?.transferId || "").trim();

    const groupIds = tid
      ? (state.transactions || [])
          .filter((t) => !!t?.isTransfer && String(t?.transferId || "").trim() === tid)
          .map((t) => String(t?.id || ""))
          .filter(Boolean)
      : [String(initialData.id)];

    const ids = Array.from(new Set(groupIds));

    if (ids.length >= 2) {
      showConfirm?.(
        isEditingCreditPayment ? "ลบชำระบัตร" : "ลบ Transfer",
        `ต้องการลบรายการนี้ใช่ไหม? (จะลบทั้ง ${ids.length} ขา)`,
        () => deleteManyTransactions(ids, { navigateToDashboard: true }),
        true
      );
    } else {
      showConfirm?.(
        isEditingCreditPayment ? "ลบชำระบัตร" : "ลบ Transfer",
        "พบ Transfer ขาเดียว (ข้อมูลอาจเสียหาย) ต้องการลบเฉพาะรายการนี้ใช่ไหม?",
        () => deleteTransaction(initialData.id),
        true
      );
    }
    return;
  }

  // ✅ Split group: delete the whole group (with a fallback to splitParentId to catch corrupted children)
  const gid = String(initialData?.splitGroupId || "").trim();
  if (gid) {
    const parentId = String(
      initialData?.isSplitParent
        ? initialData.id
        : splitGroupTransactions.find((t) => !!t?.isSplitParent)?.id || initialData?.splitParentId || ""
    ).trim();

    const idSet = new Set();
    for (const t of state.transactions || []) {
      if (!t) continue;
      if (t.isTransfer) continue;

      const tg = String(t?.splitGroupId || "").trim();
      const tp = String(t?.splitParentId || "").trim();

      if (tg && tg === gid) idSet.add(String(t?.id || ""));
      if (parentId && tp && tp === parentId) idSet.add(String(t?.id || ""));
    }

    const groupIds = Array.from(idSet).filter(Boolean);

    if (groupIds.length >= 2) {
      showConfirm?.(
        "ลบ Split Group",
        `ต้องการลบรายการแบบ Split ทั้งกลุ่มใช่ไหม? (รวม ${groupIds.length} รายการย่อย)`,
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
      className="pb-[calc(7rem+env(safe-area-inset-bottom))] min-h-dvh overflow-x-hidden"
      style={{
        overflowX: "hidden",
        touchAction: "pan-y",
      }}
    >
      <AppHeader
        title={
          isEditMode
            ? initialData.isTransfer
              ? isEditingCreditPayment
                ? "แก้ไขชำระบัตร"
                : "แก้ไขโอนเงิน"
              : "แก้ไขรายการ"
            : "เพิ่มรายการ"
        }
        subtitle={
          !isEditMode
            ? entryMode === "scan"
              ? "สแกนใบเสร็จ/สลิป แล้วตรวจสอบก่อนบันทึก"
              : "กรอกข้อมูลเองแบบรวดเร็ว"
            : initialData.isTransfer
            ? isEditingCreditPayment
              ? "บันทึกเป็นการชำระบัตรเครดิต"
              : "สร้างคู่รายการโอนระหว่างบัญชี"
            : "แก้ไขรายละเอียดรายการเดิม"
        }
        left={
          <button
            onClick={handleClose}
            className="ui-icon-btn"
            type="button"
            aria-label="close"
            title="ปิด"
          >
            <X size={18} />
          </button>
        }
        right={
          isEditMode ? (
            <button
              onClick={handleDelete}
              className="ui-icon-btn bg-red-500/10 border border-red-500/15 text-red-700"
              type="button"
              aria-label="delete"
              title="ลบ"
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <button
              onClick={clearQueue}
              className={
                "ui-icon-btn " +
                (queue.length
                  ? "bg-gray-900/90 text-white border-white/20 shadow-[0_18px_45px_rgba(0,0,0,0.14)]"
                  : "text-gray-400 opacity-60")
              }
              type="button"
              title="ล้างคิว"
              aria-label="ล้างคิว"
              disabled={!queue.length}
            >
              <Trash size={18} />
            </button>
          )
        }
      />

      {/*
        Add view uses its own fixed bottom actions (Save / Scan actions).
        Use pb-nav here to guarantee enough scroll space on small devices
        and prevent the last fields from being hidden behind the fixed bar.
      */}
      <main className="ui-page pt-4 pb-nav">
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
      <ReceiptSection>
      {!isEditMode && entryMode === "scan" ? (
        <>
          <div
            ref={dropZoneRef}
            tabIndex={0}
            onClick={() => dropZoneRef.current?.focus?.()}
            onPaste={handleDropZonePaste}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            className={`glass-card rounded-3xl p-5 mb-5 outline-none ${
              dropActive ? "ring-2 ring-indigo-500/40 bg-indigo-500/5" : ""
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-600" />
                  สแกนใบเสร็จ / สลิป
                </div>
                <div className="text-xs text-gray-800/60 mt-1">
                  รองรับหลายไฟล์ (ใบเสร็จ) หรือไฟล์เดียว (สลิป) • แนบ evidence ลง note อัตโนมัติ • จำหมวดจากร้าน/เลขบัญชีเดิมได้ •
                  เปลี่ยนประเภทได้ • โอนเข้าบัตรเครดิตจะถูกจัดเป็น “ชำระบัตร”
                </div>
                <div className="mt-2 text-[11px] font-bold text-gray-900/60">
                  Tip: ลากไฟล์มาวาง (drag & drop) หรือกด Ctrl+V เพื่อวางจาก clipboard (รองรับรูปภาพ + PDF)
                </div>
              </div>

              <div className="w-full md:w-[340px] flex flex-col gap-2 items-stretch">
                <div className="bg-white/60 border border-white/25 rounded-2xl p-1 flex items-stretch gap-1" role="tablist" aria-label="ประเภทเอกสาร">
                  <button
                    type="button"
                    onClick={() => setScanUploadKind('receipt')}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all active:scale-[0.99] ${scanUploadKind === 'receipt' ? 'bg-gray-900/90 text-white shadow-sm' : 'text-gray-900/70 hover:bg-white/40'}`}
                    aria-selected={scanUploadKind === 'receipt'}
                    role="tab"
                  >
                    ใบเสร็จ
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanUploadKind('slip')}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all active:scale-[0.99] ${scanUploadKind === 'slip' ? 'bg-gray-900/90 text-white shadow-sm' : 'text-gray-900/70 hover:bg-white/40'}`}
                    aria-selected={scanUploadKind === 'slip'}
                    role="tab"
                  >
                    สลิปโอน/ชำระ
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePickScanFiles}
                  className="px-4 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold text-sm active:scale-95 disabled:opacity-60"
                  disabled={isScanning}
                >
                  <span className="inline-flex items-center gap-2">
                    {isScanning ? (
                      <Loader size={18} className="animate-spin" />
                    ) : scanUploadKind === 'slip' ? (
                      <ArrowRightLeft size={18} />
                    ) : (
                      <Camera size={18} />
                    )}
                    แนบไฟล์เพื่อสแกน
                  </span>
                </button>

                <div className="text-[11px] leading-relaxed font-bold text-gray-900/60">
                  {scanUploadKind === 'slip'
                    ? 'สลิป: เลือกได้ทีละ 1 ไฟล์ (เหมาะกับโอนเงิน/ชำระบัตร)'
                    : 'ใบเสร็จ: เลือกได้หลายไฟล์ (ถ้าเลือกมากกว่า 1 ระบบจะส่งเข้า Inbox อัตโนมัติ)'}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
                disabled={isScanning}
              />

              <input
                ref={slipFileInputRef}
                type="file"
                accept="image/*,application/pdf"
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
            <ScanQueueList
              queue={queue}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              canCreateFromQueue={canCreateFromQueue}
              onCreateTransactions={createTransactionsFromQueue}
              onRemoveItem={removeQueueItem}
              onUpdateItem={updateQueueItem}
              onUpdateGroup={updateQueueGroup}
              onTypeChange={handleQueueTypeChange}
              accounts={accounts}
              nonCreditAccounts={nonCreditAccounts}
              expenseCatsAll={expenseCatsAll}
              incomeCatsAll={incomeCatsAll}
              recentCatsByType={recentCatsByType}
              recentAccountsByType={recentAccountsByType}
              catIndexByType={catIndexByType}
              merchants={state.merchants}
            />
          ) : (
            <div className="text-center py-14 glass-card rounded-3xl border border-white/15">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-500">
                <Camera size={32} />
              </div>
              <p className="text-gray-900 font-extrabold">ยังไม่มีรูปในคิว</p>
              <p className="text-gray-900/60 text-sm mt-1">กด “แนบไฟล์เพื่อสแกน” เพื่อเริ่มสแกน</p>
            </div>
          )}
        </>
      ) : null}
      </ReceiptSection>

      {/* ===== MANUAL MODE (or EDIT MODE) ===== */}
      {entryMode === "manual" || isEditMode ? (
        <>
          <BentoGrid className="mb-28">
            {/* Essentials */}
            <BentoCard
              title="รายละเอียดหลัก"
              subtitle="ประเภท • จำนวนเงิน • วันที่ • ร้าน/โน้ต"
              icon={<FileText size={18} className="text-gray-900" />}
              className="md:col-span-12"
            >
              {/* Type segmented */}
              <div className="bg-black/5 border border-black/5 p-1.5 rounded-2xl flex">
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
                      if (t.id === type) return;
                      setType(t.id);
                      if (t.id === "transfer" || t.id === "credit_payment") {
                        setCategoryId("transfer");
                        setIsSplitMode(false);
                        return;
                      }

                      // ✅ Prevent cross-type category corruption: reset to a sane default for the new type
                      const nextCats = t.id === "income" ? incomeCats : expenseCats;
                      const fallbackCatId = String(nextCats?.[0]?.id || "").trim();
                      if (fallbackCatId) setCategoryId(fallbackCatId);
                    }}
                    className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition-all ${
                      type === t.id ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-800/60 hover:bg-white/40"
                    }`}
                    type="button"
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="mt-4">
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
              </div>

              {/* Date + Note */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="ui-label mb-1">วันที่</div>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 border border-indigo-600/15 flex items-center justify-center shrink-0">
                      <Calendar size={16} className="text-indigo-700" />
                    </div>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="ui-input flex-1"
                    />
                  </div>
                </div>

                <div>
                  <div className="ui-label mb-1">ร้าน / โน้ต</div>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-600/15 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-amber-700" />
                    </div>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={
                        type === "credit_payment"
                          ? "ธนาคาร/บัตร/รายละเอียด"
                          : isSplitMode
                            ? "โน้ตสำหรับทั้งกลุ่ม Split"
                            : "ชื่อร้าน หรือรายละเอียด"
                      }
                      className="ui-input flex-1"
                    />
                  </div>
                  {nearbySuggestion?.merchant && !isEditMode ? (
                    <div className="mt-2 ml-12 text-[11px] text-indigo-700 font-bold flex items-center gap-1">
                      📍 {nearbySuggestion.merchant}{" "}
                      <span className="text-gray-500 font-normal">~{Math.round(nearbySuggestion.distanceM)} ม.</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </BentoCard>

            {/* Accounts */}
            <BentoCard
              title={type === "transfer" ? "Transfer accounts" : type === "credit_payment" ? "ชำระบัตรเครดิต" : "บัญชีที่ใช้"}
              subtitle={
                type === "transfer"
                  ? "เงินย้ายระหว่างบัญชี (ไม่กระทบรายรับ/รายจ่าย)"
                  : type === "credit_payment"
                    ? "ตัดยอดจากบัญชีจ่าย → ไปยังบัญชีบัตรเครดิต"
                    : "เลือกบัญชีที่ใช้จ่าย/รับเงิน"
              }
              icon={
                type === "transfer" ? (
                  <ArrowRightLeft size={18} className="text-gray-900" />
                ) : type === "credit_payment" ? (
                  <CreditCard size={18} className="text-gray-900" />
                ) : (
                  <CreditCard size={18} className="text-gray-900" />
                )
              }
              className="md:col-span-12"
            >
              {type === "transfer" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="ui-label mb-1">บัญชีต้นทาง</div>
                    <AccountPicker
                      accounts={accounts}
                      value={fromAccountId}
                      onChange={setFromAccountId}
                      title="เลือกบัญชีต้นทาง"
                      placeholder="เลือกบัญชีต้นทาง"
                    />
                  </div>
                  <div>
                    <div className="ui-label mb-1">บัญชีปลายทาง</div>
                    <AccountPicker
                      accounts={accounts}
                      value={toAccountId}
                      onChange={setToAccountId}
                      title="เลือกบัญชีปลายทาง"
                      placeholder="เลือกบัญชีปลายทาง"
                    />
                  </div>
                </div>
              ) : type === "credit_payment" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-indigo-600/10 border border-indigo-600/15 p-4">
                    <div className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                      <CreditCard size={16} className="text-indigo-700" /> ชำระบัตรเครดิต
                    </div>
                    <div className="text-[12px] text-gray-900/60 mt-1">
                      ระบบจะสร้าง 2 legs (เงินออกจากบัญชีจ่าย + เงินเข้าไปลดหนี้บัตร) และจัดเป็น “ชำระบัตร” (ไม่ใช่รายจ่าย) เพื่อกันซ้ำกับรายการรูด
                    </div>
                    {selectedToAcc && isCreditAccount(selectedToAcc) ? (
                      <div className="mt-3 text-sm font-extrabold text-gray-900">
                        ยอดค้างชำระ: <span className="tabular-nums">{formatCurrency(creditDebt)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="ui-label mb-1">บัญชีที่จ่าย</div>
                      <AccountPicker
                        accounts={nonCreditAccounts.length ? nonCreditAccounts : accounts}
                        value={fromAccountId}
                        onChange={setFromAccountId}
                        title="เลือกบัญชีที่จ่าย"
                        placeholder="เลือกบัญชีที่จ่าย"
                      />
                      <div className="text-[11px] text-gray-900/55 mt-1">แนะนำ: ใช้บัญชีธนาคาร/เงินสด (ไม่ใช่บัตร)</div>
                    </div>

                    <div>
                      <div className="ui-label mb-1">บัตรเครดิต</div>
                      <AccountPicker
                        accounts={accounts.filter((a) => isCreditAccount(a))}
                        value={toAccountId}
                        onChange={setToAccountId}
                        title="เลือกบัตรเครดิต"
                        placeholder="เลือกบัตรเครดิต"
                      />
                    </div>
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
                      className="ui-btn ui-btn-secondary shrink-0"
                      disabled={!selectedToAcc || !isCreditAccount(selectedToAcc) || creditDebt <= 0}
                    >
                      จ่ายเต็มยอดค้าง
                    </button>
                  </div>
                </div>
              ) : (
                <div className="min-w-0">
                  <AccountChipsPicker
                    accounts={accounts}
                    value={accountId}
                    onChange={setAccountId}
                    showTitle={false}
                    showSelectedText={false}
                    mobileSingleRow
                  />
                  {accounts.find((a) => String(a?.id || "") === String(accountId || ""))?.name ? (
                    <div className="mt-2 text-xs text-gray-900/55">
                      เลือกบัญชี: <span className="font-extrabold text-gray-900">{accounts.find((a) => String(a?.id || "") === String(accountId || ""))?.name}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </BentoCard>

            {/* Category / Split */}
            {type !== "transfer" && type !== "credit_payment" ? (
              <BentoCard
                title="หมวดหมู่"
                subtitle="เลือกหมวด หรือเปิด Split เพื่อแยกหลายหมวด"
                icon={<Layers size={18} className="text-gray-900" />}
                className="md:col-span-12"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[12px] text-gray-900/60">
                      Split จะบันทึกเป็นหลาย transactions (เพื่อให้งบ/สถิติ/Export ถูกต้อง) แต่หน้า Recent แสดงเป็น 1 การ์ด
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={toggleSplitMode}
                    className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-extrabold border active:scale-95 transition-all ${
                      isSplitMode
                        ? "bg-emerald-600/90 text-white border-emerald-500/20 shadow-sm"
                        : "bg-white/70 text-gray-900 border-slate-900/10 hover:bg-white"
                    }`}
                  >
                    {isSplitMode ? "SPLIT ON" : "SPLIT OFF"}
                  </button>
                </div>

                {isSplitMode ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-white/60 border border-slate-900/10 p-3">
                      <div className="ui-label mb-1">Split label (optional)</div>
                      <input
                        value={splitLabel}
                        onChange={(e) => setSplitLabel(e.target.value)}
                        className="ui-input"
                        placeholder='เช่น "Lotus receipt"'
                      />
                    </div>

                    <div className="space-y-2">
                      {splitLines.map((l, idx) => (
                        <div key={`${l.txId || "new"}-${idx}`} className="rounded-2xl bg-white/60 border border-slate-900/10 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] text-gray-900/65 font-extrabold">
                              Line {idx + 1} <span className="font-bold">/{splitLines.length}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSplitLine(idx)}
                              className="w-9 h-9 rounded-2xl bg-red-500/10 border border-red-500/15 flex items-center justify-center text-red-700 active:scale-95"
                              aria-label="remove split line"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-start mt-2">
                            <div className="md:col-span-3">
                              <div className="ui-label mb-1">หมวด</div>
                              <CategorySelect
                                categories={type === "income" ? incomeCatsAll : expenseCatsAll}
                                value={l.categoryId || ""}
                                onChange={(e) => updateSplitLine(idx, { categoryId: e.target.value })}
                                allowEmpty
                                emptyLabel="เลือกหมวด"
                                className="ui-select"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <div className="ui-label mb-1">ยอด</div>
                              <input
                                value={l.amountDigits || ""}
                                onChange={(e) => updateSplitLine(idx, { amountDigits: sanitizeMoneyInput(e.target.value) })}
                                inputMode="decimal"
                                className="ui-input"
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          <div className="mt-2">
                            <div className="ui-label mb-1">Note (optional)</div>
                            <input
                              value={l.lineNote || ""}
                              onChange={(e) => updateSplitLine(idx, { lineNote: e.target.value })}
                              className="ui-input"
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
                        className="ui-btn ui-btn-secondary"
                      >
                        <Plus size={14} /> เพิ่มบรรทัด
                      </button>

                      <div className="text-[12px] text-gray-900/65 font-bold">
                        รวม: <span className="text-gray-900">{formatCurrency(splitTotalNumber)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <CategoryPicker
                      categories={type === "income" ? incomeCatsAll : expenseCatsAll}
                      value={categoryId}
                      onChange={setCategoryId}
                      recent={recentCatsForPicker}
                      showTitle={false}
                      twoStep
                      className="border-0 bg-transparent p-0"
                    />
                  </div>
                )}
              </BentoCard>
            ) : null}

            {/* Advanced */}
            <div className="md:col-span-12">
              <details
                open={manualAdvancedOpen}
                onToggle={(e) => setManualAdvancedOpen(e.currentTarget.open)}
                className="ui-card p-4"
              >
                <summary className="bento-summary cursor-pointer select-none flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-white/70 border border-slate-900/10 flex items-center justify-center shrink-0">
                      <Sparkles size={18} className="text-gray-900" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-gray-900">Advanced options</div>
                      <div className="mt-0.5 text-[12px] font-bold text-gray-800/60">อ้างอิง • แท็ก • ไฟล์แนบ • ผ่อนชำระ</div>
                    </div>
                  </div>

                  <ChevronRight
                    size={18}
                    className={`text-gray-900/45 transition-transform ${manualAdvancedOpen ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                </summary>

                <div className="mt-4 space-y-4">
                  {/* Attachment preview (from scan / inbox) */}
                  {initialAttachmentId ? (
                    <div className="rounded-2xl bg-white/60 border border-slate-900/10 p-3">
                      <div className="ui-label mb-2">ไฟล์แนบ</div>
                      {attachmentUrl ? (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block rounded-2xl overflow-hidden border border-slate-900/10 bg-white/50"
                        >
                          {String(attachmentMimeType || "").toLowerCase() === "application/pdf" ? (
                            <div className="w-full max-h-72 min-h-[180px] flex items-center justify-center">
                              <div className="inline-flex items-center gap-2 text-sm font-extrabold text-gray-900/80">
                                <FileText size={18} /> เปิดไฟล์ PDF
                              </div>
                            </div>
                          ) : (
                            <img src={attachmentUrl} alt="attachment" className="w-full max-h-72 object-cover" />
                          )}
                        </a>
                      ) : (
                        <div className="text-sm text-gray-900/60">กำลังโหลดไฟล์…</div>
                      )}
                      <div className="mt-2 text-[11px] text-gray-900/50">ไฟล์แนบถูกเก็บแบบถาวรในเครื่อง (IndexedDB)</div>
                    </div>
                  ) : null}

                  {/* Installment (Manual) */}
                  {!isEditMode && type === "expense" && !isSplitMode && isCreditAccount(selectedManualAccount) ? (
                    <div className="rounded-2xl bg-indigo-600/10 border border-indigo-600/15 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-indigo-900/70 uppercase flex items-center gap-2">
                            <CreditCard size={14} /> ผ่อนชำระ
                          </div>
                          <div className="text-[11px] text-indigo-900/60 mt-1 break-words">
                            ถ้าเปิด ระบบจะสร้างรายการล่วงหน้าตามจำนวนงวด และใส่ Note ว่า (งวดที่ x/y)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsInstallment((v) => !v)}
                          className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-extrabold border active:scale-95 transition-all ${
                            isInstallment
                              ? "bg-gray-900/90 text-white border-white/10 shadow-sm"
                              : "bg-white/70 text-gray-900 border-indigo-600/15 hover:bg-white"
                          }`}
                        >
                          {isInstallment ? "ON" : "OFF"}
                        </button>
                      </div>

                      {isInstallment ? (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                          <div className="rounded-2xl bg-white/60 border border-indigo-600/15 p-3">
                            <div className="ui-label mb-1">จำนวนงวด (เดือน)</div>
                            <input
                              type="number"
                              min={2}
                              max={120}
                              value={installmentMonths}
                              onChange={(e) => {
                                const n = Math.max(2, Math.min(120, Math.trunc(Number(e.target.value) || 2)));
                                setInstallmentMonths(n);
                              }}
                              className="ui-input"
                            />
                            <div className="text-[11px] text-gray-900/55 mt-1">เศษสตางค์จะกระจายอัตโนมัติ</div>
                          </div>

                          <div className="text-[12px] text-indigo-900/60">
                            * โหมดผ่อนจะปิดอัตโนมัติถ้าเปลี่ยนเป็น Split หรือเลือกบัญชีที่ไม่ใช่บัตรเครดิต
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Ref */}
                  <div>
                    <div className="ui-label mb-1">อ้างอิง</div>
                    <input
                      type="text"
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      placeholder="Ref / TRX / เลขที่รายการ"
                      className="ui-input"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <div className="ui-label mb-2">แท็ก / ป้ายกำกับ</div>
                    <TagsInput value={tags} onChange={setTags} allTags={allTagsFromHistory} placeholder="เช่น เที่ยวญี่ปุ่น, โปรเจค A" />
                  </div>
                </div>
              </details>
            </div>
          </BentoGrid>

          {/* Sticky action bar */}
          <div className="fixed left-4 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom)+var(--keyboard-inset,0px))] z-40">
            <div className="ui-card-strong p-2 rounded-3xl shadow-[0_28px_70px_-50px_rgba(0,0,0,0.65)]">
              <button
                onClick={handleSaveManual}
                disabled={isSaving}
                className={`ui-btn ui-btn-primary w-full py-4 rounded-2xl ${isSaving ? "opacity-70" : ""}`}
                type="button"
              >
                {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
                {isSaving ? "กำลังบันทึก…" : isEditMode ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* Fixed actions (scan mode) */}
      {!isEditMode && entryMode === "scan" && queue.length ? (
        <div className="fixed left-4 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom)+var(--keyboard-inset,0px))] z-40">
          <div className="ui-card-strong p-2 rounded-3xl shadow-[0_28px_70px_-50px_rgba(0,0,0,0.65)]">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={sendQueueToInbox}
                className={`ui-btn w-full ${canSendToInbox ? "ui-btn-secondary" : "ui-btn-secondary opacity-60"}`}
                type="button"
                disabled={!canSendToInbox}
              >
                <Inbox size={18} />
                ส่งไป Inbox
              </button>

              <button
                onClick={handlePostScanSaveNow}
                className={`ui-btn w-full ${canCreateFromQueue ? "ui-btn-primary" : "ui-btn-primary opacity-60"}`}
                type="button"
                disabled={!canCreateFromQueue}
              >
                <Check size={18} />
                บันทึกทันที
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Duplicate decision modal (บันทึกทันที) */}
      {dupDecisionOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
                ส่งรายการซ้ำไปที่ Inbox
              </button>
              <button
                type="button"
                onClick={() => handleDupDecision("skip")}
                className="w-full py-4 rounded-2xl bg-white/30 text-gray-900 font-extrabold border border-white/20 active:scale-95"
              >
                ข้ามรายการซ้ำ
              </button>

              <button
                type="button"
                onClick={() => handleDupDecision("save")}
                className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-indigo-200 active:scale-95"
              >
                บันทึกรายการซ้ำตอนนี้
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </main>

    </div>
  );
}
