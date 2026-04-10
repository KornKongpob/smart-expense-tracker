import { DEFAULT_CATEGORIES } from "../constants/categories.js";
import { THAI_INSTITUTION_PRESET_MAP } from "../constants/institutions.js";
import { generateId } from "../utils/id.js";
import { parseDigitsList as parseDigitsListUtil, choosePrimaryDigits, digitsOnly } from "../utils/accountMatch.js";
import { parseDateSafe } from "./selectors.js";
import { normalizeTimeHHmm, toISODate } from "../utils/format.js";
import { parseMoneyToSatang, ensureSatangInt } from "../utils/money.js";
import { normalizeMerchants } from "../utils/merchantDictionary.js";

/**
 * Default account used when boot payload has no accounts.
 * Kept here so the same default flows through load, import, and reset paths.
 */
export const DEFAULT_ACCOUNTS = [
  {
    id: "acc_cash",
    name: "เงินสด",
    type: "cash",
    color: "#1DD1A1",
    icon: "💵",
    iconId: "cash",
    institutionId: "cash_wallet",
    openingBalance: 0,
    accountNumber: "",
    creditLimit: 0,
    statementDay: 1,
    dueDay: 25,
    cardLast4: "",
  },
];

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
          ...c,
          id,
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

  for (const d of defs) {
    const id = String(d?.id || "").trim();
    if (!id || seen.has(id)) continue;
    out.push({ ...d, id, parentId: String(d?.parentId || "").trim() });
    seen.add(id);
  }

  return out;
};

export const sanitizeHierarchyOneLevel = (list) => {
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

    if (parentId) {
      const p = byId.get(parentId);
      const ppid = String(p?.parentId || "").trim();
      if (ppid) parentId = "";
    }

    next.push({ ...c, parentId });
  }

  return next;
};

export const ensureCategories = (cats) => {
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

  return {
    expense: sanitizeAndMigrate("expense", mergedExpense),
    income: sanitizeAndMigrate("income", mergedIncome),
  };
};

const safeNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const coerceSatang = (v, fallback = 0) => {
  if (v == null || v === "") return fallback;

  if (typeof v === "number") {
    if (!Number.isFinite(v)) return fallback;
    if (!Number.isInteger(v)) return parseMoneyToSatang(v);
    return Math.round(v);
  }

  const s = String(v).trim();
  if (!s) return fallback;

  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  return parseMoneyToSatang(s);
};

export const safeSatang = (v, fallback = 0) => {
  const n = coerceSatang(v, NaN);
  return Number.isFinite(n) ? ensureSatangInt(n, fallback) : fallback;
};

const normalizeMoneyFromUnit = (v, unit) => {
  const u = String(unit || "").toLowerCase();
  if (u === "satang") return safeSatang(v, 0);
  return parseMoneyToSatang(v);
};

export const clampInt = (v, min, max, fallback) => {
  const n = Math.trunc(safeNum(v, fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const hasValidIconId = (iconId) => {
  const id = String(iconId || "").trim();
  return !!id;
};

const hasValidInstitutionId = (institutionId) => {
  const id = String(institutionId || "").trim();
  if (!id) return false;
  return !!THAI_INSTITUTION_PRESET_MAP[id];
};

const uniqueDigitsList = (list) => {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(list) ? list : []) {
    const token = digitsOnly(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
};

const deriveFallbackMatchDigits = (...values) => {
  const tokens = [];
  for (const value of values) {
    const token = digitsOnly(value);
    if (!token) continue;
    if (token.length <= 6) {
      tokens.push(token);
      continue;
    }
    tokens.push(token.slice(-6));
    tokens.push(token.slice(-4));
  }
  return uniqueDigitsList(tokens);
};

export function normalizeAccount(a) {
  const id = a?.id || generateId();
  const name = String(a?.name || "").trim() || "บัญชีใหม่";
  const type = String(a?.type || "cash").trim() || "cash";
  const color = String(a?.color || "#1DD1A1");
  const icon = String(a?.icon || "💳");
  const iconId = hasValidIconId(a?.iconId) ? String(a.iconId) : "";
  const institutionId = hasValidInstitutionId(a?.institutionId) ? String(a.institutionId) : "";
  const openingBalance = safeSatang(a?.openingBalance, 0);
  const currency = String(a?.currency || "THB").trim().toUpperCase() || "THB";

  let accountNumber = a?.accountNumber ? digitsOnly(a.accountNumber).slice(0, 20) : "";
  let cardNumber = a?.cardNumber ? digitsOnly(a.cardNumber).slice(0, 19) : "";

  if (type === "credit") {
    if (!cardNumber && accountNumber) cardNumber = accountNumber;
    accountNumber = "";
  } else if (!accountNumber && cardNumber) {
    accountNumber = cardNumber;
    cardNumber = "";
  }

  const explicitDigitsInput = [
    Array.isArray(a?.digitsList) ? a.digitsList.join(" ") : "",
    Array.isArray(a?.matchDigits) ? a.matchDigits.join(" ") : "",
    a?.digits || "",
    a?.matchDigits || "",
    a?.cardDigits || "",
    a?.lastDigits || "",
  ]
    .filter(Boolean)
    .join(" ");

  const explicitDigitsList = parseDigitsListUtil(explicitDigitsInput);
  const digitsList = explicitDigitsList.length
    ? explicitDigitsList
    : deriveFallbackMatchDigits(accountNumber, cardNumber, a?.cardLast4);
  const primaryDigits = choosePrimaryDigits(digitsList);
  const digits = primaryDigits ? digitsOnly(primaryDigits).slice(-4) : "";

  let cardLast4 = a?.cardLast4 ? digitsOnly(a.cardLast4).slice(-4) : "";
  if (!cardLast4 && cardNumber) cardLast4 = cardNumber.slice(-4);
  if (!cardLast4 && type === "credit" && digits) cardLast4 = digitsOnly(digits).slice(-4);

  return {
    ...a,
    id,
    name,
    type,
    color,
    icon,
    iconId,
    institutionId,
    openingBalance,
    currency,
    digits,
    digitsList,
    matchDigits: digitsList,
    accountNumber,
    cardNumber,
    creditLimit: safeSatang(a?.creditLimit, 0),
    statementDay: clampInt(a?.statementDay, 1, 31, 1),
    dueDay: clampInt(a?.dueDay, 1, 31, 25),
    cardLast4,
  };
}

const normalizeNestedAmountEntries = (value, convertAmount) => {
  if (!Array.isArray(value)) return value;

  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;

    const next = { ...entry };

    if (Object.prototype.hasOwnProperty.call(next, "amount")) {
      next.amount = convertAmount(next.amount);
    }

    if (Array.isArray(next.lines)) {
      next.lines = normalizeNestedAmountEntries(next.lines, convertAmount);
    }

    if (Array.isArray(next.groups)) {
      next.groups = normalizeNestedAmountEntries(next.groups, convertAmount);
    }

    if (Array.isArray(next.receiptLines)) {
      next.receiptLines = normalizeNestedAmountEntries(next.receiptLines, convertAmount);
    }

    if (Array.isArray(next.children)) {
      next.children = normalizeNestedAmountEntries(next.children, convertAmount);
    }

    return next;
  });
};

const normalizeWrappedRoot = (boot) =>
  boot && typeof boot === "object" && boot.data && typeof boot.data === "object" ? boot.data : boot;

export function normalizeBootPayload(boot) {
  const root = normalizeWrappedRoot(boot);
  const fromUnit = String(root?.moneyUnit || root?.amountUnit || "").toLowerCase() === "baht" ? "baht" : "satang";
  const convertAmount = (v) => normalizeMoneyFromUnit(v, fromUnit);

  const transactions = toArray(root?.transactions).map((t) => {
    const tx = t && typeof t === "object" ? { ...t } : {};
    tx.amount = convertAmount(tx.amount);
    tx.receiptLines = normalizeNestedAmountEntries(tx.receiptLines, convertAmount);
    tx.groups = normalizeNestedAmountEntries(tx.groups, convertAmount);
    tx.lines = normalizeNestedAmountEntries(tx.lines, convertAmount);
    return tx;
  });

  const accountsRaw = toArray(root?.accounts);
  const accountsSeed = accountsRaw.length ? accountsRaw : DEFAULT_ACCOUNTS;
  const accounts = accountsSeed.map((a) =>
    normalizeAccount({
      ...(a && typeof a === "object" ? a : {}),
      openingBalance: convertAmount(a?.openingBalance),
      creditLimit: convertAmount(a?.creditLimit),
    })
  );

  const cats = root?.categories && typeof root.categories === "object" ? root.categories : DEFAULT_CATEGORIES;
  const categories = ensureCategories(cats);

  const budgets = toArray(root?.budgets).map((b) => ({
    ...(b && typeof b === "object" ? b : {}),
    limit: convertAmount(b?.limit),
  }));

  const recurring = toArray(root?.recurring).map((r) => ({
    ...(r && typeof r === "object" ? r : {}),
    amount: convertAmount(r?.amount),
  }));

  const convertInboxItem = (it) => {
    const o = it && typeof it === "object" ? { ...it } : {};
    o.amount = convertAmount(o.amount);
    o.groups = normalizeNestedAmountEntries(o.groups, convertAmount);
    o.lines = normalizeNestedAmountEntries(o.lines, convertAmount);
    o.receiptLines = normalizeNestedAmountEntries(o.receiptLines, convertAmount);
    return o;
  };

  const scanInbox = toArray(root?.scanInbox).map(convertInboxItem);
  const inbox = toArray(root?.inbox).map(convertInboxItem);

  const rules = toArray(root?.rules).map((r) => {
    const rr = r && typeof r === "object" ? { ...r } : {};
    const c = rr.conditions && typeof rr.conditions === "object" ? { ...rr.conditions } : {};
    if (c.amountMin != null && String(c.amountMin).trim() !== "") c.amountMin = convertAmount(c.amountMin);
    else c.amountMin = null;
    if (c.amountMax != null && String(c.amountMax).trim() !== "") c.amountMax = convertAmount(c.amountMax);
    else c.amountMax = null;
    rr.conditions = c;
    return rr;
  });

  const merchants = toArray(root?.merchants).map((m) => ({ ...(m && typeof m === "object" ? m : {}) }));
  const ui = root?.ui && typeof root.ui === "object" ? root.ui : undefined;

  return {
    transactions,
    accounts,
    categories,
    budgets,
    recurring,
    merchants,
    inbox,
    scanInbox,
    rules,
    ui,
    moneyUnit: "satang",
  };
}

export function normalizeRule(raw, fallbackPriority = 1000) {
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
      amountMin:
        conditions.amountMin != null && String(conditions.amountMin).trim() !== ""
          ? safeSatang(conditions.amountMin, NaN)
          : null,
      amountMax:
        conditions.amountMax != null && String(conditions.amountMax).trim() !== ""
          ? safeSatang(conditions.amountMax, NaN)
          : null,
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

export function normalizeRules(list) {
  const arr = toArray(list).filter(Boolean);
  const withP = arr.map((r, idx) => normalizeRule(r, 1000 + idx));
  withP.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  return withP.map((r, idx) => ({ ...r, priority: idx + 1 }));
}

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

const normalizeNestedEntry = (raw) => {
  const entry = raw && typeof raw === "object" ? raw : {};
  const categoryId = String(entry.categoryId || entry.category || "").trim();
  const next = {
    ...entry,
    categoryId,
    category: categoryId,
  };

  if (Object.prototype.hasOwnProperty.call(next, "amount")) {
    next.amount = safeSatang(next.amount, 0);
  }

  if (Array.isArray(next.children)) {
    next.children = next.children.map((child) => normalizeNestedEntry(child));
  }

  return next;
};

const readNestedTimeCandidates = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const scanMeta = source.scanMeta && typeof source.scanMeta === "object" ? source.scanMeta : {};
  const slip = source.slip && typeof source.slip === "object" ? source.slip : {};

  return [
    source.time,
    source.transactionTime,
    source.txTime,
    source.localTime,
    source.timeText,
    meta.time,
    meta.transactionTime,
    meta?.slip?.time,
    scanMeta.time,
    scanMeta?.slip?.time,
    slip.time,
  ];
};

function normalizeCanonicalTime(raw) {
  for (const candidate of readNestedTimeCandidates(raw)) {
    const normalized = normalizeTimeHHmm(candidate);
    if (normalized) return normalized;
  }
  return "";
}

export function normalizeCanonicalTransactionTime(raw) {
  return normalizeCanonicalTime(raw);
}

export function normalizeCanonicalInboxTime(raw) {
  return normalizeCanonicalTime(raw);
}

function normalizeTransaction(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const id = String(t.id || generateId());
  const amount = safeSatang(t.amount, 0);
  const date = t?.date ? String(t.date).slice(0, 10) : toISODate(new Date());
  const time = normalizeCanonicalTransactionTime(t);
  const dateMs = date ? parseDateSafe(date).getTime() : 0;
  const createdAt = Number(t.createdAt || t.addedAt || t.updatedAt || dateMs || Date.now());
  const updatedAt = Number(t.updatedAt || createdAt);
  const location = normalizeLocation(t.location);
  const categoryId = String(t.categoryId || t.category || "").trim();

  return {
    ...t,
    id,
    amount,
    date,
    time,
    categoryId,
    category: categoryId,
    note: String(t.note || ""),
    createdAt,
    updatedAt,
    isTransfer: !!t.isTransfer,
    location: location || null,
    receiptLines: Array.isArray(t.receiptLines) ? t.receiptLines.map((line) => normalizeNestedEntry(line)) : t.receiptLines ?? null,
  };
}

export function normalizeInboxItem(raw) {
  const it = raw && typeof raw === "object" ? raw : {};
  const id = it.id || generateId();
  const createdAt = Number(it.createdAt || it.receivedAt || Date.now());
  const status = (String(it.status || "") || "").toLowerCase() === "approved" ? "approved" : "pending";
  const type = String(it.type || it.txType || "expense");
  const amount = safeSatang(it.amount, 0);
  const date = it.date ? String(it.date).slice(0, 10) : toISODate(new Date());
  const time = normalizeCanonicalInboxTime(it);
  const categoryId = String(it.categoryId || it.category || "").trim();
  const referenceId = String(it.referenceId || it.ref || "");

  return {
    ...it,
    id,
    createdAt,
    status,
    type,
    txType: type,
    amount,
    date,
    time,
    categoryId,
    category: categoryId,
    accountId: String(it.accountId || ""),
    fromAccountId: String(it.fromAccountId || ""),
    toAccountId: String(it.toAccountId || ""),
    merchant: String(it.merchant || ""),
    note: String(it.note || ""),
    ref: referenceId,
    referenceId,
    attachmentId: it.attachmentId || null,
    fileHash: String(it.fileHash || "").trim() || null,
    groups: Array.isArray(it.groups) ? it.groups.map((group) => normalizeNestedEntry(group)) : it.groups ?? [],
    lines: Array.isArray(it.lines) ? it.lines.map((line) => normalizeNestedEntry(line)) : it.lines ?? [],
    receiptLines: Array.isArray(it.receiptLines)
      ? it.receiptLines.map((line) => normalizeNestedEntry(line))
      : it.receiptLines ?? null,
  };
}

function migrateScanInboxToInbox(scanInbox) {
  const list = Array.isArray(scanInbox) ? scanInbox : [];
  return list.map((x) => normalizeInboxItem({ ...x, status: "pending" }));
}

export function createInitialState(boot = {}) {
  const normalized = normalizeBootPayload(boot);
  const tx = toArray(normalized?.transactions).map(normalizeTransaction);
  const acc = toArray(normalized?.accounts);
  const cats = ensureCategories(normalized?.categories);
  const moneyUnit = String(normalized?.moneyUnit || "satang").toLowerCase() === "baht" ? "baht" : "satang";
  const normalizedAccounts = acc.length ? acc.map(normalizeAccount) : DEFAULT_ACCOUNTS.map(normalizeAccount);
  const inbox = toArray(normalized?.inbox).length
    ? toArray(normalized?.inbox).map(normalizeInboxItem)
    : migrateScanInboxToInbox(toArray(normalized?.scanInbox));

  return {
    moneyUnit,
    transactions: tx,
    accounts: normalizedAccounts,
    categories: cats,
    budgets: toArray(normalized?.budgets),
    recurring: toArray(normalized?.recurring),
    merchants: normalizeMerchants(normalized?.merchants),
    inbox,
    scanInbox: inbox,
    rules: normalizeRules(normalized?.rules),
    ui: {
      view: normalized?.ui?.view || "dashboard",
      editingId: normalized?.ui?.editingId || null,
    },
  };
}
