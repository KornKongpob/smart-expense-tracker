/**
 * Store runtime module: Context provider, persistence wiring, and action creators.
 * This module contains the single reducer/initial-state implementation and exports runtime store APIs.
 */
// src/store/store.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

import { ACTIONS } from "./actions";

import { loadAll, saveAll, clearAll } from "../services/storage";
import { setHash } from "../utils/hashRouter";
import { clearAllBlobs, deleteBlob } from "../services/blobStore";
import { DEFAULT_CATEGORIES } from "../constants/categories";
import { ACCOUNT_ICONS } from "../constants/presets.jsx"; // ✅ for iconId validation + future UI usage
import { generateId } from "../utils/id";
import { parseDigitsList as parseDigitsListUtil, choosePrimaryDigits } from "../utils/accountMatch";
import { calcAccountBalance, parseDateSafe } from "./selectors";
import { toISODate } from "../utils/format";
import { parseMoneyToSatang, ensureSatangInt } from "../utils/money";
import { advanceRecurringDate, getRecurringAnchorDay } from "../utils/recurring";
import {
  normalizeMerchants,
  normalizeMerchantEntry,
  mergeMerchantEntries,
  learnMerchantMapping,
  normalizeMerchantKey,
} from "../utils/merchantDictionary";

/**
 * ✅ Default account
 * - icon: legacy emoji (still supported)
 * - iconId: new stable id for beautiful icon presets (preferred)
 */
const DEFAULT_ACCOUNTS = [
  {
    id: "acc_cash",
    name: "เงินสด",
    type: "cash",
    color: "#1DD1A1",
    icon: "💵",
    iconId: "cash",
    openingBalance: 0,
    accountNumber: "",
    creditLimit: 0,
    statementDay: 1,
    dueDay: 25,
    cardLast4: "",
  },
];

const AppStoreContext = createContext(null);

// ---------- small helpers ----------
const toArray = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
};

const mergeCategoriesById = (existing, defaults) => {
  const ex = toArray(existing).filter(Boolean);
  const defs = toArray(defaults).filter(Boolean);

  const defMap = new Map();
  for (const d of defs) {
    const id = String(d?.id || "").trim();
    if (!id) continue;
    defMap.set(id, { ...d, id });
  }

  const out = [];
  const seen = new Set();

  for (const c of ex) {
    const id = String(c?.id || "").trim();
    if (!id) continue;

    const d = defMap.get(id);
    const merged = d
      ? {
          ...d,
          ...c, // user's overrides win (name/icon/color/keywords)
          id,
          // but keep new hierarchy fields if user doesn't have them
          parentId: c?.parentId != null ? String(c.parentId || "").trim() : String(d?.parentId || "").trim(),
        }
      : {
          ...c,
          id,
          parentId: String(c?.parentId || "").trim(),
        };

    out.push(merged);
    seen.add(id);
  }

  // Add any missing defaults
  for (const d of defs) {
    const id = String(d?.id || "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    out.push({ ...d, id, parentId: String(d?.parentId || "").trim() });
    seen.add(id);
  }

  return out;
};

const sanitizeHierarchyOneLevel = (list) => {
  const arr = toArray(list).filter(Boolean);

  const byId = new Map();
  for (const c of arr) {
    const id = String(c?.id || "").trim();
    if (!id) continue;
    byId.set(id, { ...c, id });
  }

  const isDeleted = (c) => !!(c?.isDeleted || c?.deletedAt);

  const next = [];
  for (const c of byId.values()) {
    const id = c.id;
    let parentId = String(c?.parentId || "").trim();

    if (parentId === id) parentId = "";
    if (parentId && !byId.has(parentId)) parentId = "";
    if (parentId && isDeleted(byId.get(parentId))) parentId = "";

    // prevent 3-level: parent itself must be root
    if (parentId) {
      const p = byId.get(parentId);
      const ppid = String(p?.parentId || "").trim();
      if (ppid) parentId = "";
    }

    next.push({ ...c, parentId });
  }

  return next;
};

const ensureCategories = (cats) => {
  const expenseIn = toArray(cats?.expense);
  const incomeIn = toArray(cats?.income);

  const mergedExpense = expenseIn.length
    ? mergeCategoriesById(expenseIn, DEFAULT_CATEGORIES.expense)
    : DEFAULT_CATEGORIES.expense;

  const mergedIncome = incomeIn.length
    ? mergeCategoriesById(incomeIn, DEFAULT_CATEGORIES.income)
    : DEFAULT_CATEGORIES.income;

  const sanitizeAndMigrate = (type, merged) => {
    const sanitized = sanitizeHierarchyOneLevel(merged);

    // ✅ Lightweight migration: keep existing users tidy when we introduce new mains.
    // Only apply when a category is still a root (parentId empty) and NOT deleted.
    // (Users who intentionally reorganized categories won't be affected.)
    const list = sanitized.map((c) => ({ ...c }));
    const byId = new Map(list.map((c) => [String(c.id), c]));

    const setParentIfRoot = (childId, newParentId) => {
      const child = byId.get(String(childId));
      const parent = byId.get(String(newParentId));
      if (!child || !parent) return;
      if (child.isDeleted || child.deletedAt) return;
      if (parent.isDeleted || parent.deletedAt) return;
      const pid = String(child.parentId || "").trim();
      if (pid) return;
      child.parentId = String(newParentId);
    };

    if (type === "expense") {
      setParentIfRoot("rent", "housing");
      setParentIfRoot("home", "housing");
      setParentIfRoot("kids", "family");
      setParentIfRoot("pets", "family");
      setParentIfRoot("beauty", "personal_care");
    }

    return sanitizeHierarchyOneLevel(list);
  };

  // ✅ keep hierarchy valid (no self parent, no missing parent, no parent of parent)
  return {
    expense: sanitizeAndMigrate("expense", mergedExpense),
    income: sanitizeAndMigrate("income", mergedIncome),
  };
};

const digitsOnly = (s) => {
  // support Thai digits ๐-๙ as well
  const th = "๐๑๒๓๔๕๖๗๘๙";
  return String(s || "")
    .replace(/[๐-๙]/g, (ch) => String(th.indexOf(ch)))
    .replace(/[^\d]/g, "");
};

const slugifyId = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-ก-๙]/g, "")
    .slice(0, 40);

const safeNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const coerceSatang = (v, fallback = 0) => {
  // We store money in **satang** (integer).
  // However, older versions (or some edit flows) may have persisted "baht" strings like "125.25".
  // Heuristic:
  // - integer-like strings/numbers => satang
  // - decimals / currency-formatted strings => treat as baht and convert
  if (v == null || v === "") return fallback;

  if (typeof v === "number") {
    if (!Number.isFinite(v)) return fallback;
    if (!Number.isInteger(v)) return parseMoneyToSatang(v); // baht number => satang
    return Math.round(v);
  }

  const s = String(v).trim();
  if (!s) return fallback;

  // Pure integer string => satang
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  // Otherwise treat as THB major units (baht) string and convert
  return parseMoneyToSatang(s);
};

const safeSatang = (v, fallback = 0) => {
  const n = coerceSatang(v, NaN);
  return Number.isFinite(n) ? ensureSatangInt(n, fallback) : fallback;
};

const normalizeMoneyFromUnit = (v, unit) => {
  const u = String(unit || "").toLowerCase();
  if (u === "satang") return safeSatang(v, 0);
  // legacy: treat as THB major units
  return parseMoneyToSatang(v);
};


const clampInt = (v, min, max, fallback) => {
  const n = Math.trunc(safeNum(v, fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const hasValidIconId = (iconId) => {
  const id = String(iconId || "").trim();
  if (!id) return false;
  return (ACCOUNT_ICONS || []).some((x) => String(x?.id || "") === id);
};

/**
 * ✅ Normalize account shape with backward compatibility
 * - icon: emoji string (legacy)  ✅ still supported
 * - iconId: preset id (new)      ✅ preferred for "beautiful icon set"
 *
 * Why normalize here:
 * - Prevent crashes when older backups miss fields
 * - Keep types consistent (string/number)
 * - Make UI and scanners stable (accountNumber digits-only)
 */
function normalizeAccount(a) {
  const id = a?.id || generateId();
  const name = String(a?.name || "").trim() || "บัญชีใหม่";
  const type = String(a?.type || "cash").trim() || "cash";
  const color = String(a?.color || "#1DD1A1");

  // legacy emoji fallback (string only)
  const icon = String(a?.icon || "💳");

  // new icon id for preset icons (string only) + validate
  // if invalid -> keep but also allow UI to fallback to emoji
  const iconId = hasValidIconId(a?.iconId) ? String(a.iconId) : "";

  const openingBalance = safeSatang(a?.openingBalance, 0);

  // ✅ currency default
  const currency = String(a?.currency || "THB").trim().toUpperCase() || "THB";

  // ✅ unify digit fields for:
  // - UI display (a.digits)
  // - matching from OCR (digitsList / matchDigits)
  const digitsInput = [
    Array.isArray(a?.digitsList) ? a.digitsList.join(" ") : "",
    Array.isArray(a?.matchDigits) ? a.matchDigits.join(" ") : "",
    a?.digits || "",
    a?.matchDigits || "",
    a?.accountNumber || "",
    a?.cardNumber || "",
    a?.cardDigits || "",
    a?.lastDigits || "",
    a?.cardLast4 || "",
  ]
    .filter(Boolean)
    .join(" ");

  const digitsList = parseDigitsListUtil(digitsInput);
  const primaryDigits = choosePrimaryDigits(digitsList);
  const digits = primaryDigits ? String(primaryDigits).slice(-4) : "";

  // Prefer explicit accountNumber, otherwise derive from primary digits
  let accountNumber = a?.accountNumber ? digitsOnly(a.accountNumber) : "";
  if (!accountNumber && primaryDigits) accountNumber = digitsOnly(primaryDigits).slice(-16);

  // Prefer explicit cardLast4, otherwise derive from digits for credit accounts
  let cardLast4 = a?.cardLast4 ? digitsOnly(a.cardLast4) : "";
  if (!cardLast4 && type === "credit" && digits) cardLast4 = digitsOnly(digits);

  return {
    ...a,
    id,
    name,
    type,
    color,
    icon,
    iconId,
    openingBalance,
    currency,

    // ✅ matching-friendly fields (backward compatible)
    digits,
    digitsList,
    matchDigits: digitsList,

    accountNumber,
    creditLimit: safeSatang(a?.creditLimit, 0),
    statementDay: clampInt(a?.statementDay, 1, 31, 1),
    dueDay: clampInt(a?.dueDay, 1, 31, 25),
    cardLast4,
  };
}

function normalizeBoot(boot) {
  const root = boot && typeof boot === 'object' && boot.data && typeof boot.data === 'object' ? boot.data : boot;

  const fromUnit = String(root?.moneyUnit || root?.amountUnit || '').toLowerCase() === 'satang' ? 'satang' : 'baht';

  const convertAmount = (v) => normalizeMoneyFromUnit(v, fromUnit);

  const transactions = toArray(root?.transactions).map((t) => ({
    ...(t && typeof t === 'object' ? t : {}),
    amount: convertAmount(t?.amount),
  }));

  const accountsRaw = toArray(root?.accounts);
  const accountsSeed = accountsRaw.length ? accountsRaw : DEFAULT_ACCOUNTS;
  const accounts = accountsSeed.map((a) =>
    normalizeAccount({
      ...(a && typeof a === 'object' ? a : {}),
      openingBalance: convertAmount(a?.openingBalance),
      creditLimit: convertAmount(a?.creditLimit),
    })
  );

  const cats = root?.categories && typeof root.categories === "object" ? root.categories : DEFAULT_CATEGORIES;
  const categories = ensureCategories(cats);

  const budgets = toArray(root?.budgets).map((b) => ({
    ...(b && typeof b === 'object' ? b : {}),
    limit: convertAmount(b?.limit),
  }));

  const recurring = toArray(root?.recurring).map((r) => ({
    ...(r && typeof r === 'object' ? r : {}),
    amount: convertAmount(r?.amount),
  }));

  const convertInboxItem = (it) => {
    const o = it && typeof it === 'object' ? { ...it } : {};
    o.amount = convertAmount(o.amount);
    // split/lines inside inbox items
    if (Array.isArray(o.lines)) {
      o.lines = o.lines.map((l) => ({
        ...(l && typeof l === 'object' ? l : {}),
        amount: convertAmount(l?.amount),
      }));
    }
    return o;
  };

  const scanInbox = toArray(root?.scanInbox).map(convertInboxItem);
  const inbox = toArray(root?.inbox).map(convertInboxItem);

  const rules = toArray(root?.rules).map((r) => {
    const rr = r && typeof r === 'object' ? { ...r } : {};
    const c = rr.conditions && typeof rr.conditions === 'object' ? { ...rr.conditions } : {};
    // amountMin/Max are stored as SATANG after migration
    if (c.amountMin != null && String(c.amountMin).trim() !== "") c.amountMin = convertAmount(c.amountMin);
    else c.amountMin = null;
    if (c.amountMax != null && String(c.amountMax).trim() !== "") c.amountMax = convertAmount(c.amountMax);
    else c.amountMax = null;
    rr.conditions = c;
    return rr;
  });

  const ui = root?.ui && typeof root.ui === "object" ? root.ui : undefined;

  return {
    transactions,
    accounts,
    categories,
    budgets,
    recurring,
    inbox,
    scanInbox,
    rules,
    ui,
    // ✅ from now on, we store all money fields in satang
    moneyUnit: 'satang',
  };
}

// ---------- automation rules normalization ----------
function normalizeRule(raw, fallbackPriority = 1000) {
  const r = raw && typeof raw === "object" ? raw : {};
  const id = r.id || generateId();
  const name = String(r.name || "").trim() || "Automation Rule";
  const enabled = r.enabled !== false;
  const priority = clampInt(r.priority, 1, 9999, fallbackPriority);

  const conditions = r.conditions && typeof r.conditions === "object" ? r.conditions : {};
  const actions = r.actions && typeof r.actions === "object" ? r.actions : {};

  return {
    ...r,
    id,
    name,
    enabled,
    priority,
    conditions: {
      keywordContains: String(conditions.keywordContains || "").trim(),
      regex: String(conditions.regex || "").trim(),
      amountMin: conditions.amountMin != null && String(conditions.amountMin).trim() !== "" ? safeSatang(conditions.amountMin, NaN) : null,
      amountMax: conditions.amountMax != null && String(conditions.amountMax).trim() !== "" ? safeSatang(conditions.amountMax, NaN) : null,
      bankContains: String(conditions.bankContains || "").trim(),
      refContains: String(conditions.refContains || "").trim(),
      fromDigitsEndsWith: String(conditions.fromDigitsEndsWith || "").trim(),
      toDigitsEndsWith: String(conditions.toDigitsEndsWith || "").trim(),
    },
    actions: {
      setType: actions.setType ? String(actions.setType) : "",
      setCategoryId: actions.setCategoryId ? String(actions.setCategoryId) : "",
      setAccountId: actions.setAccountId ? String(actions.setAccountId) : "",
      setFromAccountId: actions.setFromAccountId ? String(actions.setFromAccountId) : "",
      setToAccountId: actions.setToAccountId ? String(actions.setToAccountId) : "",
    },
    updatedAt: Number(r.updatedAt || Date.now()),
    createdAt: Number(r.createdAt || r.updatedAt || Date.now()),
  };
}

function normalizeRules(list) {
  const arr = toArray(list).filter(Boolean);
  // Ensure stable order by priority; if missing priority, append
  const withP = arr.map((r, idx) => normalizeRule(r, 1000 + idx));
  withP.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  // Re-number priorities densely for predictable ordering
  return withP.map((r, idx) => ({ ...r, priority: idx + 1 }));
}

// ---------- geolocation normalization ----------
function normalizeLocation(raw) {
  const loc = raw && typeof raw === "object" ? raw : null;
  if (!loc) return null;

  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.lon ?? loc.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const round6 = (n) => Math.round(n * 1e6) / 1e6;
  return { lat: round6(lat), lng: round6(lng) };
}

// ---------- transaction normalization ----------
function normalizeTransaction(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const id = String(t.id || generateId());
  const amount = safeSatang(t.amount, 0);
  const date = t?.date ? String(t.date).slice(0, 10) : toISODate(new Date());
  // Prefer explicit createdAt/updatedAt, else fall back to date (midnight) for stable sorting
  const dateMs = date ? parseDateSafe(date).getTime() : 0;
  const createdAt = Number(t.createdAt || t.addedAt || t.updatedAt || dateMs || Date.now());
  const updatedAt = Number(t.updatedAt || createdAt);
  const location = normalizeLocation(t.location);

  return {
    ...t,
    id,
    amount,
    date,
    note: String(t.note || ""),
    createdAt,
    updatedAt,
    isTransfer: !!t.isTransfer,
    // optional GPS capture
    location: location || null,
  };
}

export function createInitialState(boot = {}) {
  const tx = toArray(boot?.transactions).map(normalizeTransaction);
  const acc = toArray(boot?.accounts);
  const cats = ensureCategories(boot?.categories);

  // ✅ Always enforce normalized accounts (even if provided)
  const normalizedAccounts = acc.length ? acc.map(normalizeAccount) : DEFAULT_ACCOUNTS.map(normalizeAccount);

  return {
    moneyUnit: String(boot?.moneyUnit || 'satang'),
    transactions: tx,
    accounts: normalizedAccounts,
    categories: cats,
    budgets: toArray(boot?.budgets),
    recurring: toArray(boot?.recurring),
    merchants: normalizeMerchants(boot?.merchants),
    inbox: toArray(boot?.inbox).length ? toArray(boot?.inbox).map(normalizeInboxItem) : migrateScanInboxToInbox(toArray(boot?.scanInbox)),
    // backward compatibility: keep scanInbox mirrored
    scanInbox: toArray(boot?.inbox).length ? toArray(boot?.inbox).map(normalizeInboxItem) : migrateScanInboxToInbox(toArray(boot?.scanInbox)),
    rules: normalizeRules(boot?.rules),
    ui: {
      view: boot?.ui?.view || "dashboard",
      editingId: boot?.ui?.editingId || null,
    },
  };
}

// ---------- reducer helpers ----------
function upsertById(list, item) {
  const id = item?.id;
  if (!id) return list;
  const exists = list.some((x) => x?.id === id);
  return exists ? list.map((x) => (x?.id === id ? item : x)) : [...list, item];
}

function bulkUpsertTx(list, txs) {
  let next = list.slice();
  for (const tx of txs || []) {
    if (!tx?.id) continue;
    const i = next.findIndex((t) => t.id === tx.id);
    if (i >= 0) next[i] = tx;
    else next.push(tx);
  }
  return next;
}

// ---------- merchant helpers ----------
function rewriteMerchantValue(val, aliasKeySet, targetCanonical) {
  const key = normalizeMerchantKey(val);
  if (!key) return val;
  if (!aliasKeySet.has(key)) return val;
  return targetCanonical;
}

function rewriteMerchantAcrossTransactions(transactions, aliasKeySet, targetCanonical) {
  const list = Array.isArray(transactions) ? transactions : [];
  let changed = false;
  const next = list.map((t) => {
    const before = String(t?.merchant || "");
    const after = rewriteMerchantValue(before, aliasKeySet, targetCanonical);
    if (after !== before) {
      changed = true;
      return { ...t, merchant: after };
    }
    return t;
  });
  return changed ? next : list;
}

function rewriteMerchantAcrossInbox(inbox, aliasKeySet, targetCanonical) {
  const list = Array.isArray(inbox) ? inbox : [];
  let changed = false;
  const next = list.map((it) => {
    const before = String(it?.merchant || "");
    const after = rewriteMerchantValue(before, aliasKeySet, targetCanonical);
    if (after !== before) {
      changed = true;
      return normalizeInboxItem({ ...it, merchant: after });
    }
    return it;
  });
  return changed ? next : list;
}


// ---------- inbox migration/normalization ----------
function normalizeInboxItem(raw) {
  const it = raw && typeof raw === 'object' ? raw : {};
  const id = it.id || generateId();
  const createdAt = Number(it.createdAt || it.receivedAt || Date.now());
  const status = (String(it.status || '') || '').toLowerCase() === 'approved' ? 'approved' : 'pending';

  const type = String(it.type || it.txType || 'expense');
  const amount = safeSatang(it.amount, 0);
  const date = it.date ? String(it.date).slice(0, 10) : toISODate(new Date());

  return {
    ...it,
    id,
    createdAt,
    status,
    type,
    amount,
    date,
    // normalized keys
    categoryId: String(it.categoryId || it.category || ''),
    accountId: String(it.accountId || ''),
    fromAccountId: String(it.fromAccountId || ''),
    toAccountId: String(it.toAccountId || ''),
    merchant: String(it.merchant || ''),
    note: String(it.note || ''),
    referenceId: String(it.referenceId || it.ref || ''),
    attachmentId: it.attachmentId || null,
    fileHash: String(it.fileHash || '').trim() || null,
  };
}

function migrateScanInboxToInbox(scanInbox) {
  const list = Array.isArray(scanInbox) ? scanInbox : [];
  return list.map((x) => normalizeInboxItem({ ...x, status: 'pending' }));
}

// ---------- recurring generation ----------
// ✅ Safety cap per run (prevents accidental backfill flood)
// NOTE: we still allow users to run multiple times; UI will warn when truncated.
const MAX_RECURRING_CREATE_PER_RUN = 200;

function generateDueTransactionsForRecurring(r, todayISO) {
  if (!r?.enabled) return { txs: [], nextRecurring: r };

  const today = parseDateSafe(todayISO);
  const start = parseDateSafe(r.startDate || todayISO);
  const anchorDay = getRecurringAnchorDay(r);

  let nextDue = r.lastGenerated
    ? advanceRecurringDate(parseDateSafe(r.lastGenerated), r.frequency, r.interval, anchorDay)
    : start;

  if (nextDue.getTime() > today.getTime()) return { txs: [], nextRecurring: r };

  const txs = [];
  let lastGenDate = r.lastGenerated ? parseDateSafe(r.lastGenerated) : null;

  let truncated = false;
  let nextDueISO = null;

  let safety = 0;
  while (nextDue.getTime() <= today.getTime()) {
    safety += 1;
    // Safety cap: prevent huge accidental backfills from flooding the UI
    if (safety > MAX_RECURRING_CREATE_PER_RUN) {
      truncated = true;
      nextDueISO = toISODate(nextDue);
      break;
    }

    const iso = toISODate(nextDue);

    txs.push({
      id: `rec_${r.id}_${iso}`,
      type: r.type === "income" ? "income" : "expense",
      amount: safeSatang(r.amount, 0),
      category: r.categoryId,
      accountId: r.accountId,
      date: iso,
      note: String(r.note || "Recurring").trim() || "Recurring",
      isTransfer: false,
      transferId: null,
      ref: null,
      source: "recurring",
      meta: { kind: "recurring", recurringId: r.id || null, dueDate: iso },
    });

    lastGenDate = nextDue;
    nextDue = advanceRecurringDate(nextDue, r.frequency, r.interval, anchorDay);
  }

  // If we didn't hit cap but there is still something due (edge-case), keep nextDueISO
  if (!nextDueISO && nextDue?.getTime?.() <= today.getTime()) nextDueISO = toISODate(nextDue);

  const nextRecurring = {
    ...r,
    lastGenerated: lastGenDate ? toISODate(lastGenDate) : r.lastGenerated || null,
  };

  return { txs, nextRecurring, truncated, nextDueISO, cap: MAX_RECURRING_CREATE_PER_RUN };
}

// ---------- reducer ----------
export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.INIT: {
      return createInitialState(normalizeBoot(action.payload ?? {}));
    }

    case ACTIONS.NAVIGATE: {
      return { ...state, ui: { ...state.ui, view: action.payload } };
    }

    case ACTIONS.START_NEW_TRANSACTION: {
      return { ...state, ui: { ...state.ui, editingId: null, view: "add" } };
    }

    case ACTIONS.START_EDIT_TRANSACTION: {
      return { ...state, ui: { ...state.ui, editingId: action.payload, view: "add" } };
    }

    case ACTIONS.UPSERT_TRANSACTION: {
      const tx = action.payload;
      const transactions = upsertById(state.transactions, tx);
      return {
        ...state,
        transactions,
        ui: { ...state.ui, editingId: null, view: "dashboard" },
      };
    }

    case ACTIONS.BULK_UPSERT_TRANSACTIONS: {
      const txs = Array.isArray(action.payload) ? action.payload : [];
      const transactions = bulkUpsertTx(state.transactions, txs);

      const navigateToDashboard = action?.meta?.navigateToDashboard !== false;
      return {
        ...state,
        transactions,
        ui: navigateToDashboard ? { ...state.ui, editingId: null, view: "dashboard" } : state.ui,
      };
    }

    case ACTIONS.DELETE_TRANSACTION: {
      const id = action.payload;
      const transactions = state.transactions.filter((t) => t.id !== id);
      const editingId = state.ui.editingId === id ? null : state.ui.editingId;
      return {
        ...state,
        transactions,
        ui: { ...state.ui, editingId, view: "dashboard" },
      };
    }

    case ACTIONS.DELETE_MANY_TRANSACTIONS: {
      const ids = Array.isArray(action.payload) ? action.payload : [];
      const delSet = new Set(ids.map((x) => String(x || "")).filter(Boolean));
      if (!delSet.size) return state;

      const transactions = (state.transactions || []).filter((t) => !delSet.has(String(t?.id || "")));
      const editingId = delSet.has(String(state.ui.editingId || "")) ? null : state.ui.editingId;

      const navigateToDashboard = action?.meta?.navigateToDashboard !== false;
      return {
        ...state,
        transactions,
        ui: navigateToDashboard ? { ...state.ui, editingId, view: "dashboard" } : { ...state.ui, editingId },
      };
    }

    case ACTIONS.ADD_ACCOUNT: {
      return { ...state, accounts: [...state.accounts, normalizeAccount(action.payload)] };
    }

    case ACTIONS.UPDATE_ACCOUNT: {
      const updated = action.payload;
      if (!updated?.id) return state;
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === updated.id ? normalizeAccount({ ...a, ...updated }) : a)),
      };
    }

    case ACTIONS.DELETE_ACCOUNT: {
      const payload = action.payload;
      const id = typeof payload === "string" ? payload : payload?.id;
      if (!id) return state;

      const accounts = (state.accounts || []).filter((a) => a.id !== id);

      // ✅ Cascade delete transactions belonging to this account
      let cascadeTxIds = Array.isArray(payload?.cascadeTxIds) ? payload.cascadeTxIds : null;
      if (!cascadeTxIds) {
        const txs = Array.isArray(state.transactions) ? state.transactions : [];
        const idsToDelete = new Set();
        const transferIdsToDelete = new Set();

        const isTransferLikeTx = (t) => {
          if (!t) return false;
          if (t.isTransfer) return true;
          const tid = String(t.transferId || "").trim();
          if (tid) return true;
          const c = String(t.category || "").toLowerCase().trim();
          return c === "transfer";
        };

        for (const t of txs) {
          if (String(t?.accountId || "").trim() !== String(id)) continue;
          const tid = String(t?.id || "").trim();
          if (tid) idsToDelete.add(tid);
          if (isTransferLikeTx(t)) {
            const trId = String(t?.transferId || "").trim();
            if (trId) transferIdsToDelete.add(trId);
          }
        }

        if (transferIdsToDelete.size) {
          for (const t of txs) {
            if (!isTransferLikeTx(t)) continue;
            const trId = String(t?.transferId || "").trim();
            if (!trId || !transferIdsToDelete.has(trId)) continue;
            const tid = String(t?.id || "").trim();
            if (tid) idsToDelete.add(tid);
          }
        }

        cascadeTxIds = Array.from(idsToDelete);
      }

      const delSet = new Set((cascadeTxIds || []).map((x) => String(x || "")).filter(Boolean));
      const transactions = delSet.size ? (state.transactions || []).filter((t) => !delSet.has(String(t?.id || ""))) : state.transactions;

      // ✅ Prevent orphan references in other data sources (fallback to first remaining account)
      const fallbackAccountId = String(accounts?.[0]?.id || "");

      const recurring = (state.recurring || []).map((r) =>
        String(r?.accountId || "") === String(id) ? { ...r, accountId: fallbackAccountId } : r
      );

      const replaceInboxAccount = (currentId, counterpartId) => {
        if (String(currentId || "") !== String(id)) return String(currentId || "");
        if (!fallbackAccountId) return "";
        return String(counterpartId || "") === fallbackAccountId ? "" : fallbackAccountId;
      };

      const patchInboxAccount = (it) => {
        if (!it) return it;
        const next = { ...it };
        const txType = String(next.type || next.txType || "").toLowerCase().trim();

        if (txType === "transfer" || txType === "credit_payment") {
          next.fromAccountId = replaceInboxAccount(next.fromAccountId, next.toAccountId);
          next.toAccountId = replaceInboxAccount(next.toAccountId, next.fromAccountId);
          if (String(next.accountId || "") === String(id)) {
            next.accountId = String(next.fromAccountId || next.toAccountId || "");
          }
          return normalizeInboxItem(next);
        }

        if (String(next.accountId || "") === String(id)) next.accountId = fallbackAccountId;
        return normalizeInboxItem(next);
      };
      const inbox = (state.inbox || []).map(patchInboxAccount);

      const editingId = delSet.has(String(state.ui.editingId || "")) ? null : state.ui.editingId;
      const view = delSet.has(String(state.ui.editingId || "")) ? "dashboard" : state.ui.view;

      return {
        ...state,
        accounts,
        transactions,
        recurring,
        inbox,
        scanInbox: inbox,
        ui: { ...state.ui, editingId, view },
      };
    }

    case ACTIONS.ADD_CATEGORY: {
      const { type, category } = action.payload || {};
      if (!type || !category) return state;
      if (type !== "expense" && type !== "income") return state;

      const now = Date.now();
      const list = state.categories[type] || [];

      const id = String(category?.id || "").trim();
      if (!id) return state;

      // --- normalize parentId (1-level) ---
      const byId = new Map();
      for (const c of list || []) {
        const cid = String(c?.id || "").trim();
        if (cid) byId.set(cid, c);
      }

      let parentId = String(category?.parentId || "").trim();
      if (parentId === id) parentId = "";
      if (parentId && !byId.has(parentId)) parentId = "";
      if (parentId) {
        const p = byId.get(parentId);
        const ppid = String(p?.parentId || "").trim();
        const pDel = !!(p?.isDeleted || p?.deletedAt);
        if (ppid || pDel) parentId = ""; // prevent 3-level or deleted parent
      }

      // If this category is currently a parent of others, it must remain a main category.
      const hasChildren = (list || []).some((c) => String(c?.parentId || "").trim() === id && !(c?.isDeleted || c?.deletedAt));
      if (hasChildren) parentId = "";

      // ✅ Upsert by id, and ensure the category becomes active (not tombstoned)
      const cleaned = {
        ...category,
        id,
        parentId,
        deletedAt: null,
        isDeleted: false,
        updatedAt: now,
      };

      const exists = list.some((c) => String(c?.id || "") === id);
      const nextList = exists
        ? list.map((c) => (String(c?.id || "") === id ? { ...c, ...cleaned } : c))
        : [...list, cleaned];

      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: sanitizeHierarchyOneLevel(nextList),
        },
      };
    }

    case ACTIONS.DELETE_CATEGORY: {
      const { type, id } = action.payload || {};
      if (!type || !id) return state;
      if (type !== "expense" && type !== "income") return state;

      const now = Date.now();
      const list = state.categories[type] || [];
      const targetId = String(id).trim();
      if (!targetId) return state;

      // Cascade tombstone: delete category + all descendants
      const childrenByParent = new Map();
      for (const c of list || []) {
        const pid = String(c?.parentId || "").trim();
        const cid = String(c?.id || "").trim();
        if (!pid || !cid) continue;
        const arr = childrenByParent.get(pid) || [];
        arr.push(cid);
        childrenByParent.set(pid, arr);
      }

      const idsToDelete = new Set();
      const q = [targetId];
      while (q.length) {
        const cur = q.shift();
        if (!cur || idsToDelete.has(cur)) continue;
        idsToDelete.add(cur);
        const kids = childrenByParent.get(cur) || [];
        for (const kid of kids) {
          if (!idsToDelete.has(kid)) q.push(kid);
        }
      }

      let changed = false;
      const nextList = list.map((c) => {
        const cid = String(c?.id || "").trim();
        if (!idsToDelete.has(cid)) return c;
        if (c?.isDeleted || c?.deletedAt) {
          // already tombstoned, but keep updatedAt fresh so UI refreshes
          return { ...c, updatedAt: now };
        }
        changed = true;
        return {
          ...c,
          isDeleted: true,
          deletedAt: c?.deletedAt || now,
          updatedAt: now,
        };
      });

      if (!changed) return state;

      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: sanitizeHierarchyOneLevel(nextList),
        },
      };
    }


    // ----- budgets -----
    case ACTIONS.UPSERT_BUDGET: {
      const b = action.payload || {};
      const id = b.id || generateId();

      const existsSameKey = (state.budgets || []).find((x) => x?.month === b.month && x?.categoryId === b.categoryId);
      const finalId = existsSameKey?.id || id;

      const nextBudget = {
        id: finalId,
        month: String(b.month || ""),
        categoryId: String(b.categoryId || ""),
        limit: safeSatang(b.limit, 0),
        alertPct: clampInt(b.alertPct, 1, 100, 90),
      };

      const budgets = upsertById(state.budgets || [], nextBudget);
      return { ...state, budgets };
    }

    case ACTIONS.DELETE_BUDGET: {
      const id = action.payload;
      const budgets = (state.budgets || []).filter((b) => b.id !== id);
      return { ...state, budgets };
    }

    // ----- recurring -----
    case ACTIONS.UPSERT_RECURRING: {
      const r = action.payload || {};
      const id = r.id || generateId();

      const nextRecurring = {
        id,
        enabled: r.enabled !== false,
        type: r.type === "income" ? "income" : "expense",
        amount: safeSatang(r.amount, 0),
        categoryId: String(r.categoryId || ""),
        accountId: String(r.accountId || ""),
        note: String(r.note || "Recurring").trim() || "Recurring",
        startDate: String(r.startDate || toISODate(new Date())).slice(0, 10),
        frequency: r.frequency === "weekly" ? "weekly" : "monthly",
        interval: clampInt(r.interval, 1, 120, 1),
        lastGenerated: r.lastGenerated ? String(r.lastGenerated).slice(0, 10) : null,
      };

      const recurring = upsertById(state.recurring || [], nextRecurring);
      return { ...state, recurring };
    }

    case ACTIONS.DELETE_RECURRING: {
      const id = action.payload;
      const recurring = (state.recurring || []).filter((r) => r.id !== id);
      return { ...state, recurring };
    }

    case ACTIONS.APPLY_RECURRING_GENERATION: {
      const txs = action.payload?.transactions || [];
      const nextRecurring = action.payload?.recurring || state.recurring;
      const transactions = bulkUpsertTx(state.transactions, txs);
      return { ...state, transactions, recurring: nextRecurring };
    }


    // ----- automation rules -----
    case ACTIONS.RULE_UPSERT: {
      const incoming = action.payload || {};
      const nextRule = normalizeRule(incoming, (state.rules || []).length + 1);
      const rules = normalizeRules(upsertById(state.rules || [], nextRule));
      return { ...state, rules };
    }

    case ACTIONS.RULE_UPDATE: {
      const { id, patch } = action.payload || {};
      if (!id) return state;
      const existing = (state.rules || []).find((r) => String(r?.id) === String(id));
      if (!existing) return state;
      const merged = { ...existing, ...(patch || {}), id: existing.id };
      const nextRule = normalizeRule(merged, existing.priority || 9999);
      const rules = normalizeRules(upsertById(state.rules || [], nextRule));
      return { ...state, rules };
    }

    case ACTIONS.RULE_DELETE: {
      const id = action.payload;
      const rules = normalizeRules((state.rules || []).filter((r) => String(r?.id) !== String(id)));
      return { ...state, rules };
    }

    case ACTIONS.RULE_SET_ORDER: {
      const next = Array.isArray(action.payload) ? action.payload : [];
      return { ...state, rules: normalizeRules(next) };
    }


    // ----- Smart Merchant Dictionary -----
    case ACTIONS.MERCHANT_UPSERT: {
      const incoming = action.payload || {};
      const nextEntry = normalizeMerchantEntry(incoming);
      const merchants = normalizeMerchants(upsertById(state.merchants || [], nextEntry));
      return { ...state, merchants };
    }

    case ACTIONS.MERCHANT_UPDATE: {
      const { id, patch } = action.payload || {};
      if (!id) return state;
      const list = Array.isArray(state.merchants) ? state.merchants : [];
      const existing = list.find((m) => String(m?.id) === String(id)) || null;
      if (!existing) return state;

      const beforeCanonical = String(existing.canonical || "");
      const merged = normalizeMerchantEntry({ ...existing, ...(patch || {}), id: existing.id });

      // If canonical changed, keep previous canonical as alias and rewrite existing data
      let finalEntry = merged;
      const afterCanonical = String(merged.canonical || "");
      if (afterCanonical && beforeCanonical && normalizeMerchantKey(afterCanonical) !== normalizeMerchantKey(beforeCanonical)) {
        const aliases = Array.isArray(merged.aliases) ? merged.aliases.slice() : [];
        aliases.push(beforeCanonical);
        finalEntry = normalizeMerchantEntry({ ...merged, aliases });
      }

      let merchants = normalizeMerchants(upsertById(list, finalEntry));

      // rewrite tx/inbox merchants if canonical changed
      let transactions = state.transactions;
      let inbox = state.inbox;
      if (afterCanonical && beforeCanonical && normalizeMerchantKey(afterCanonical) !== normalizeMerchantKey(beforeCanonical)) {
        const aliasKeySet = new Set([normalizeMerchantKey(beforeCanonical)].filter(Boolean));
        transactions = rewriteMerchantAcrossTransactions(state.transactions || [], aliasKeySet, afterCanonical);
        inbox = rewriteMerchantAcrossInbox(state.inbox || [], aliasKeySet, afterCanonical);
      }

      return { ...state, merchants, transactions, inbox, scanInbox: inbox };
    }

    case ACTIONS.MERCHANT_DELETE: {
      const id = action.payload;
      const merchants = normalizeMerchants((state.merchants || []).filter((m) => String(m?.id) !== String(id)));
      return { ...state, merchants };
    }

    case ACTIONS.MERCHANT_MERGE: {
      const { sourceId, targetId } = action.payload || {};
      if (!sourceId || !targetId) return state;
      if (String(sourceId) === String(targetId)) return state;
      const list = Array.isArray(state.merchants) ? state.merchants : [];
      const source = list.find((m) => String(m?.id) === String(sourceId)) || null;
      const target = list.find((m) => String(m?.id) === String(targetId)) || null;
      if (!source || !target) return state;

      const merged = mergeMerchantEntries(target, source);
      const mergedList = normalizeMerchants(
        list
          .filter((m) => String(m?.id) !== String(sourceId))
          .map((m) => (String(m?.id) === String(targetId) ? merged : m))
      );

      const aliasKeys = new Set(
        [source?.canonical, ...(Array.isArray(source?.aliases) ? source.aliases : [])]
          .map((x) => normalizeMerchantKey(x))
          .filter(Boolean)
      );

      const canonical = String(merged?.canonical || target?.canonical || "").trim();
      const transactions = canonical ? rewriteMerchantAcrossTransactions(state.transactions || [], aliasKeys, canonical) : state.transactions;
      const inbox = canonical ? rewriteMerchantAcrossInbox(state.inbox || [], aliasKeys, canonical) : state.inbox;

      return { ...state, merchants: mergedList, transactions, inbox, scanInbox: inbox };
    }

    case ACTIONS.MERCHANT_LEARN: {
      const sample = action.payload || {};
      const merchants = learnMerchantMapping(state.merchants || [], sample);
      return { ...state, merchants };
    }



    // ----- inbox (pending/approved) -----
    case ACTIONS.INBOX_UPSERT_MANY:
    case ACTIONS.SCAN_INBOX_ADD_MANY: {
      const items = Array.isArray(action.payload) ? action.payload : [];
      let inbox = state.inbox || [];
      for (const raw of items) {
        if (!raw) continue;
        const normalized = normalizeInboxItem(raw);
        inbox = upsertById(inbox, normalized);
      }
      // keep scanInbox in sync for backward compatibility
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_UPDATE_ONE: {
      const { id, patch } = action.payload || {};
      if (!id) return state;
      const inbox = (state.inbox || []).map((it) => (it?.id === id ? normalizeInboxItem({ ...it, ...patch, id }) : it));
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_REMOVE_MANY: {
      const ids = Array.isArray(action.payload) ? action.payload : [];
      const idSet = new Set(ids.map(String));
      const inbox = (state.inbox || []).filter((it) => !idSet.has(String(it?.id)));
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.SCAN_INBOX_REMOVE: {
      const id = action.payload;
      const inbox = (state.inbox || []).filter((x) => String(x?.id) !== String(id));
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_CLEAR_APPROVED: {
      const inbox = (state.inbox || []).filter((it) => String(it?.status || '').toLowerCase() !== 'approved');
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_CLEAR_ALL:
    case ACTIONS.SCAN_INBOX_CLEAR: {
      return { ...state, inbox: [], scanInbox: [] };
    }

// ----- reset/import -----
    case ACTIONS.RESET_ALL:
    case ACTIONS.IMPORT_BACKUP: {
      return createInitialState(normalizeBoot(action.payload ?? {}));
    }

    default:
      return state;
  }
}

// ---------- provider ----------
export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const boot = loadAll({
      defaultAccounts: DEFAULT_ACCOUNTS,
      defaultCategories: DEFAULT_CATEGORIES,
      defaultBudgets: [],
      defaultRecurring: [],
      defaultMerchants: [],
      defaultRules: [],
      defaultInbox: [],
      defaultScanInbox: [],
      defaultUI: { view: "dashboard", editingId: null },
    });

    return createInitialState(normalizeBoot(boot));
  });

  // ✅ persist (include ui to keep view/editingId stable)
  useEffect(() => {
    saveAll({
      moneyUnit: state.moneyUnit || "satang",
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
      budgets: state.budgets,
      recurring: state.recurring,
      merchants: state.merchants,
      rules: state.rules,
      inbox: state.inbox,
      // backward compatibility
      scanInbox: state.inbox,
      ui: state.ui,
    });
  }, [
    state.transactions,
    state.accounts,
    state.categories,
    state.budgets,
    state.recurring,
    state.merchants,
    state.rules,
    state.inbox,
    state.ui,
    state.moneyUnit,
  ]);

  const getEditingTransaction = useMemo(() => {
    return () => {
      const id = state?.ui?.editingId;
      if (!id) return null;
      return state.transactions.find((t) => t.id === id) || null;
    };
  }, [state.transactions, state?.ui?.editingId]);

  const api = useMemo(() => {
    const navigate = (view) => {
      setHash(view);
      dispatch({ type: ACTIONS.NAVIGATE, payload: view });
    };

    const startNewTransaction = () => dispatch({ type: ACTIONS.START_NEW_TRANSACTION });
    const startNew = startNewTransaction;

    const startEditTransaction = (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id });
    const startEdit = startEditTransaction;

    const upsertTransaction = (tx) => {
      const id = tx?.id || generateId();
      const amount = safeSatang(tx?.amount, 0);
      const date = tx?.date ? String(tx.date).slice(0, 10) : toISODate(new Date());

      const now = Date.now();
      const prev = (state.transactions || []).find((t) => t?.id === id) || null;
      const createdAt = Number(tx?.createdAt || prev?.createdAt || now);

      const cleaned = {
        // ✅ preserve fields that the current form doesn't edit (e.g., merchant/evidence/attachment)
        ...(prev || {}),
        ...(tx || {}),
        id,
        amount,
        date,
        note: String(tx?.note || ""),
        createdAt,
        updatedAt: now,
        isTransfer: !!tx?.isTransfer,
      };

      dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload: cleaned });
    };

    const bulkUpsertTransactions = (txs, { navigateToDashboard = true } = {}) => {
      const list = Array.isArray(txs) ? txs : [];
      const now = Date.now();
      const prevById = new Map((state.transactions || []).map((t) => [String(t?.id || ""), t]));
      dispatch({
        type: ACTIONS.BULK_UPSERT_TRANSACTIONS,
        payload: list.map((tx) => {
          const id = tx?.id || generateId();
          const amount = safeSatang(tx?.amount, 0);
          const date = tx?.date ? String(tx.date).slice(0, 10) : toISODate(new Date());
          const prev = prevById.get(String(id)) || null;
          const createdAt = Number(tx?.createdAt || prev?.createdAt || now);
          return {
            // ✅ preserve fields that the current form doesn't edit (e.g., merchant/evidence/attachment)
            ...(prev || {}),
            ...(tx || {}),
            id,
            amount,
            date,
            note: String(tx?.note || ""),
            createdAt,
            updatedAt: now,
            isTransfer: !!tx?.isTransfer,
          };
        }),
        meta: { navigateToDashboard },
      });
    };

    // ✅ Attachment cleanup (IndexedDB blobs)
    // When deleting transactions, also delete orphaned blobs to prevent storage leaks.
    const cleanupBlobsForTxIds = (ids) => {
      const txs = Array.isArray(state.transactions) ? state.transactions : [];
      const delSet = new Set((Array.isArray(ids) ? ids : []).map((x) => String(x || "")).filter(Boolean));
      if (!delSet.size) return;

      const attachmentIds = new Set();
      for (const t of txs) {
        const tid = String(t?.id || "");
        if (!tid || !delSet.has(tid)) continue;
        const aid = String(t?.attachmentId || "").trim();
        if (aid) attachmentIds.add(aid);
      }

      for (const aid of attachmentIds) {
        // Only delete if nothing else (outside of delSet) still references this blob.
        const stillUsed = txs.some(
          (t) => !delSet.has(String(t?.id || "")) && String(t?.attachmentId || "").trim() === aid
        );
        if (stillUsed) continue;
        try {
          void deleteBlob(aid);
        } catch {
          // ignore
        }
      }
    };

    const deleteTransaction = (id) => {
      const tid = String(id || "").trim();
      if (!tid) return;
      cleanupBlobsForTxIds([tid]);
      dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: tid });
    };

    const deleteManyTransactions = (ids, { navigateToDashboard = true } = {}) => {
      const list = Array.isArray(ids) ? ids.filter(Boolean).map((x) => String(x).trim()).filter(Boolean) : [];
      if (!list.length) return;
      const uniq = Array.from(new Set(list));
      cleanupBlobsForTxIds(uniq);
      dispatch({ type: ACTIONS.DELETE_MANY_TRANSACTIONS, payload: uniq, meta: { navigateToDashboard } });
    };

    const addAccount = (account) => {
      const next = normalizeAccount({
        ...account,
        id: account?.id || generateId(),
      });
      dispatch({ type: ACTIONS.ADD_ACCOUNT, payload: next });
    };

    const updateAccount = (partial) => {
      if (!partial?.id) return;
      dispatch({ type: ACTIONS.UPDATE_ACCOUNT, payload: partial });
    };

    // ✅ Cascade delete (Option B): delete the account AND all transactions belonging to it.
    // Also delete the counterpart legs for transfers, to avoid leaving a one-sided transfer.
    const deleteAccount = (id) => {
      const accId = String(id || "").trim();
      if (!accId) return;

      const txs = Array.isArray(state.transactions) ? state.transactions : [];
      const idsToDelete = new Set();
      const transferIdsToDelete = new Set();

      const isTransferLikeTx = (t) => {
        if (!t) return false;
        if (t.isTransfer) return true;
        const tid = String(t.transferId || "").trim();
        if (tid) return true;
        const c = String(t.category || "").toLowerCase().trim();
        return c === "transfer";
      };

      for (const t of txs) {
        if (String(t?.accountId || "").trim() !== accId) continue;
        const tid = String(t?.id || "").trim();
        if (tid) idsToDelete.add(tid);
        if (isTransferLikeTx(t)) {
          const trId = String(t?.transferId || "").trim();
          if (trId) transferIdsToDelete.add(trId);
        }
      }

      if (transferIdsToDelete.size) {
        for (const t of txs) {
          if (!isTransferLikeTx(t)) continue;
          const trId = String(t?.transferId || "").trim();
          if (!trId || !transferIdsToDelete.has(trId)) continue;
          const tid = String(t?.id || "").trim();
          if (tid) idsToDelete.add(tid);
        }
      }

      const cascadeTxIds = Array.from(idsToDelete);
      if (cascadeTxIds.length) cleanupBlobsForTxIds(cascadeTxIds);

      dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: { id: accId, cascadeTxIds } });
    };

    /**
     * ✅ Adjust account balance
     * - recordAsTransaction = true: create an income/expense tx (shows in stats)
     * - recordAsTransaction = false: modify openingBalance to match desired (silent fix)
     */
    const adjustAccountBalance = ({ accountId, desiredBalance, recordAsTransaction }) => {
      const desired = safeSatang(desiredBalance, NaN);
      if (!Number.isFinite(desired)) return;

      const current = safeSatang(calcAccountBalance(state.accounts, state.transactions, accountId), 0);
      const delta = desired - current;
      if (!delta) return;

      const acc = state.accounts.find((a) => a.id === accountId);
      if (!acc) return;

      if (recordAsTransaction) {
        const isIncome = delta > 0;
        const category = "adjust_balance";

        // ✅ Use a fresh id (avoid undefined variables + prevent accidental overwrite)
        const id = generateId();

        upsertTransaction({
          id,
          type: isIncome ? "income" : "expense",
          amount: Math.abs(delta),
          category,
          accountId,
          date: toISODate(new Date()),
          note: "ปรับยอดบัญชี",
          isTransfer: false,
          meta: { kind: "adjust_balance" },
        });
      } else {
        const opening = safeSatang(acc.openingBalance, 0);
        updateAccount({ id: accountId, openingBalance: opening + delta });
      }
    };

    const addCategory = (payload) => {
      const type = payload?.type || "expense";
      const category = payload?.category || payload;
      const name = String(category?.name || "").trim() || "หมวดหมู่ใหม่";

      const next = {
        ...category,
        id: category?.id || slugifyId(name) || generateId(),
        name,
        icon: String(category?.icon || "🏷️"),
        color: String(category?.color || "#C8D6E5"),
      };

      dispatch({ type: ACTIONS.ADD_CATEGORY, payload: { type, category: next } });
    };

    const deleteCategory = ({ type, id }) => dispatch({ type: ACTIONS.DELETE_CATEGORY, payload: { type, id } });

    // budgets
    const upsertBudget = (b) => dispatch({ type: ACTIONS.UPSERT_BUDGET, payload: b });
    const deleteBudget = (id) => dispatch({ type: ACTIONS.DELETE_BUDGET, payload: id });

    // recurring
    const upsertRecurring = (r) => dispatch({ type: ACTIONS.UPSERT_RECURRING, payload: r });
    const deleteRecurring = (id) => dispatch({ type: ACTIONS.DELETE_RECURRING, payload: id });

    const runRecurringNow = () => {
      const todayISO = toISODate(new Date());

      const created = [];
      const nextRecurring = [];
      const truncatedRules = [];

      for (const r of state.recurring || []) {
        const { txs, nextRecurring: nr, truncated, nextDueISO, cap } = generateDueTransactionsForRecurring(r, todayISO);
        if (txs.length) created.push(...txs);
        nextRecurring.push(nr);
        if (truncated) {
          truncatedRules.push({ id: String(r?.id || ""), nextDueISO: nextDueISO || null, cap: cap || MAX_RECURRING_CREATE_PER_RUN });
        }
      }

      if (created.length) {
        dispatch({
          type: ACTIONS.APPLY_RECURRING_GENERATION,
          payload: { transactions: created, recurring: nextRecurring },
        });
      }

      return { createdCount: created.length, truncatedRules, cap: MAX_RECURRING_CREATE_PER_RUN, todayISO };
    };

    const resetAll = () => {
      // clear persistent attachments as well
      try {
        clearAllBlobs();
      } catch {
        // ignore
      }
      clearAll();
      dispatch({
        type: ACTIONS.RESET_ALL,
        payload: {
          transactions: [],
          accounts: DEFAULT_ACCOUNTS,
          categories: DEFAULT_CATEGORIES,
          budgets: [],
          recurring: [],
          merchants: [],
          rules: [],
          inbox: [],
          scanInbox: [],
          ui: { view: "dashboard", editingId: null },
        },
      });
    };

    const importBackup = (payload) => {
      // ✅ Backup does not include binary attachments; clear old blobs to avoid orphans.
      try {
        void clearAllBlobs();
      } catch {
        // ignore
      }
      dispatch({ type: ACTIONS.IMPORT_BACKUP, payload });
    };
    // inbox
    const addInboxItems = (items) => dispatch({ type: ACTIONS.INBOX_UPSERT_MANY, payload: items });
    const updateInboxItem = (id, patch) => dispatch({ type: ACTIONS.INBOX_UPDATE_ONE, payload: { id, patch } });
    const removeInboxItems = (ids) => dispatch({ type: ACTIONS.INBOX_REMOVE_MANY, payload: ids });
    const clearApprovedInbox = () => dispatch({ type: ACTIONS.INBOX_CLEAR_APPROVED });
    const clearAllInbox = () => dispatch({ type: ACTIONS.INBOX_CLEAR_ALL });

    // backward compatible scan inbox API (alias)
    const addScanInboxItems = addInboxItems;
    const removeScanInboxItem = (id) => dispatch({ type: ACTIONS.SCAN_INBOX_REMOVE, payload: id });
    const clearScanInbox = clearAllInbox;

    // automation rules
    const upsertRule = (rule) => dispatch({ type: ACTIONS.RULE_UPSERT, payload: rule });
    const updateRule = (id, patch) => dispatch({ type: ACTIONS.RULE_UPDATE, payload: { id, patch } });
    const deleteRule = (id) => dispatch({ type: ACTIONS.RULE_DELETE, payload: id });

    const setRuleOrder = (nextRules) => dispatch({ type: ACTIONS.RULE_SET_ORDER, payload: nextRules });

    const moveRule = (id, dir) => {
      const list = Array.isArray(state.rules) ? state.rules.slice() : [];
      const ordered = list
        .filter(Boolean)
        .slice()
        .sort((a, b) => (Number(a?.priority) || 0) - (Number(b?.priority) || 0));
      const idx = ordered.findIndex((r) => String(r?.id) === String(id));
      if (idx < 0) return;
      const nextIdx = idx + (dir === "down" ? 1 : -1);
      if (nextIdx < 0 || nextIdx >= ordered.length) return;
      const swapped = ordered.slice();
      const tmp = swapped[idx];
      swapped[idx] = swapped[nextIdx];
      swapped[nextIdx] = tmp;
      // renumber priorities densely
      setRuleOrder(swapped.map((r, i) => ({ ...r, priority: i + 1 })));
    };

    // Smart Merchant Dictionary
    const upsertMerchant = (entry) => dispatch({ type: ACTIONS.MERCHANT_UPSERT, payload: entry });
    const updateMerchant = (id, patch) => dispatch({ type: ACTIONS.MERCHANT_UPDATE, payload: { id, patch } });
    const deleteMerchant = (id) => dispatch({ type: ACTIONS.MERCHANT_DELETE, payload: id });
    const mergeMerchants = (sourceId, targetId) =>
      dispatch({ type: ACTIONS.MERCHANT_MERGE, payload: { sourceId, targetId } });
    const learnMerchant = (sample) => dispatch({ type: ACTIONS.MERCHANT_LEARN, payload: sample });


    const exportBackup = () => ({
  v: 1,
  exportedAt: Date.now(),
  data: {
    // ✅ important: tells importer how to interpret all money fields
    moneyUnit: state.moneyUnit || "satang",
    transactions: state.transactions ?? [],
    accounts: state.accounts ?? [],
    categories: state.categories ?? { expense: [], income: [] },
    budgets: state.budgets ?? [],
    recurring: state.recurring ?? [],
    merchants: state.merchants ?? [],
    rules: state.rules ?? [],
    inbox: state.inbox ?? [],
    // backward compatibility
    scanInbox: state.inbox ?? [],
    ui: state.ui ?? { view: "dashboard", editingId: null },
  },
});

    const actions = {
      navigate,
      startNewTransaction,
      startNew,
      startEditTransaction,
      startEdit,
      upsertTransaction,
      bulkUpsertTransactions,
      deleteTransaction,
      deleteManyTransactions,

      addAccount,
      updateAccount,
      adjustAccountBalance,
      deleteAccount,

      addCategory,
      deleteCategory,

      upsertBudget,
      deleteBudget,

      upsertRecurring,
      deleteRecurring,
      runRecurringNow,
      addInboxItems,
      updateInboxItem,
      removeInboxItems,
      clearApprovedInbox,
      clearAllInbox,

      addScanInboxItems,
      removeScanInboxItem,
      clearScanInbox,

      upsertRule,
      updateRule,
      deleteRule,
      moveRule,
      setRuleOrder,

      upsertMerchant,
      updateMerchant,
      deleteMerchant,
      mergeMerchants,
      learnMerchant,

      resetAll,
      importBackup,
      exportBackup,
    };

    return {
      state,
      dispatch,
      actions,
      getEditingTransaction,
      ...actions,
    };
  }, [state, getEditingTransaction]);

  return <AppStoreContext.Provider value={api}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
