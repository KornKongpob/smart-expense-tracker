// src/services/storage.js
/**
 * Storage layer for Smart Expense Tracker
 * - รองรับทั้ง format เก่า (เก็บ state ตรงๆ) และ format ใหม่ (versioned: { v, updatedAt, data })
 * - ทำให้การอ่าน/เขียน “ทนทาน” ต่อข้อมูลเสีย / schema เปลี่ยน
 * - ป้องกันแอพพังจาก localStorage quota / JSON parse error
 *
 * NOTE:
 * - ไฟล์นี้ไม่ยุ่งกับ UX/UI โดยตรง แต่เป็นแกนสำคัญให้แอพ “ทำงานถูกต้องและสอดคล้องกัน”
 */

const STORAGE_KEY = "smart-expense-tracker_v1";
const STORAGE_VERSION = 1;

function hasWindow() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeParseJSON(raw) {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function safeStringifyJSON(data) {
  try {
    return JSON.stringify(data ?? null);
  } catch {
    return null;
  }
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function ensureArray(v, fallback = []) {
  return Array.isArray(v) ? v : fallback;
}

function ensureCategoriesShape(v) {
  // categories ต้องมี expense/income เป็น array
  if (!isPlainObject(v)) return { expense: [], income: [] };
  const expense = ensureArray(v.expense, []);
  const income = ensureArray(v.income, []);
  return { expense, income };
}

function normalizeBoot(data, defaults = {}) {
  const obj = isPlainObject(data) ? data : {};

  // allow both legacy shape (plain state) and versioned shape
  const root = isPlainObject(obj.data) ? obj.data : obj;

  const transactions = Array.isArray(root.transactions)
    ? root.transactions
    : Array.isArray(defaults.defaultTransactions)
    ? defaults.defaultTransactions
    : [];

  const accounts = Array.isArray(root.accounts)
    ? root.accounts
    : Array.isArray(defaults.defaultAccounts)
    ? defaults.defaultAccounts
    : [];

  const categories = isPlainObject(root.categories)
    ? ensureCategoriesShape(root.categories)
    : isPlainObject(defaults.defaultCategories)
    ? ensureCategoriesShape(defaults.defaultCategories)
    : { expense: [], income: [] };

  const budgets = Array.isArray(root.budgets)
    ? root.budgets
    : Array.isArray(defaults.defaultBudgets)
    ? defaults.defaultBudgets
    : [];

  const recurring = Array.isArray(root.recurring)
    ? root.recurring
    : Array.isArray(defaults.defaultRecurring)
    ? defaults.defaultRecurring
    : [];

  const scanInbox = Array.isArray(root.scanInbox)
    ? root.scanInbox
    : Array.isArray(defaults.defaultScanInbox)
    ? defaults.defaultScanInbox
    : [];

  const inbox = Array.isArray(root.inbox)
    ? root.inbox
    : Array.isArray(defaults.defaultInbox)
    ? defaults.defaultInbox
    : [];

  const ui = isPlainObject(root.ui)
    ? root.ui
    : isPlainObject(defaults.defaultUI)
    ? defaults.defaultUI
    : undefined;

  const rules = Array.isArray(root.rules)
    ? root.rules
    : Array.isArray(defaults.defaultRules)
    ? defaults.defaultRules
    : [];

  const merchants = Array.isArray(root.merchants)
    ? root.merchants
    : Array.isArray(defaults.defaultMerchants)
    ? defaults.defaultMerchants
    : [];

  return { transactions, accounts, categories, budgets, recurring, inbox, scanInbox, rules, merchants, ui };
}

/**
 * ✅ Primary API used by src/store/store.jsx
 * loadAll({ defaultAccounts, defaultCategories, defaultBudgets, defaultRecurring, defaultUI })
 */
export function loadAll(defaults = {}) {
  if (!hasWindow()) {
    return normalizeBoot(null, defaults);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeBoot(null, defaults);

    const parsed = safeParseJSON(raw);
    return normalizeBoot(parsed, defaults);
  } catch {
    return normalizeBoot(null, defaults);
  }
}

/**
 * ✅ Primary API used by src/store/store.jsx
 * saveAll({ transactions, accounts, categories, budgets, recurring, ui })
 */
export function saveAll(payload) {
  if (!hasWindow()) return;

  const data = isPlainObject(payload) ? payload : {};

  // บังคับ shape ขั้นต่ำ เพื่อลดโอกาส state เพี้ยน
  const record = {
    v: STORAGE_VERSION,
    updatedAt: Date.now(),
    data: {
      transactions: ensureArray(data.transactions, []),
      accounts: ensureArray(data.accounts, []),
      categories: ensureCategoriesShape(data.categories),
      budgets: ensureArray(data.budgets, []),
      recurring: ensureArray(data.recurring, []),
      rules: ensureArray(data.rules, []),
      merchants: ensureArray(data.merchants, []),
      inbox: ensureArray(data.inbox, ensureArray(data.scanInbox, [])),
      // backward compatibility: keep writing scanInbox too
      scanInbox: ensureArray(data.scanInbox, ensureArray(data.inbox, [])),
      ui: isPlainObject(data.ui) ? data.ui : undefined,
    },
  };

  const json = safeStringifyJSON(record);
  if (!json) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // ignore quota / serialization errors
    // (ป้องกันแอพ crash เมื่อ storage เต็ม หรือ iOS Safari โยน error)
  }
}

/**
 * ✅ Primary API used by src/store/store.jsx
 */
export function clearAll() {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Legacy/simple APIs (kept for compatibility)
 * - loadState/saveState/clearState operate on the same key
 * - They store raw state directly (non-versioned)
 *
 * เหมาะกับการ “อ่านข้อมูลเก่า” แต่แนะนำให้ store.jsx ใช้ loadAll/saveAll เป็นหลัก
 */
export function loadState() {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return safeParseJSON(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  if (!hasWindow()) return;

  // NOTE: saveState เป็น legacy — จะเก็บแบบ plain state (ไม่ใส่ {v,data})
  // เก็บไว้เพื่อ backward compatibility เท่านั้น
  const json = safeStringifyJSON(state ?? null);
  if (!json) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // ignore quota / serialization errors
  }
}

export function clearState() {
  clearAll();
}

export function downloadBackupJSON(data, filename = "backup.json") {
  if (!hasWindow()) return;

  try {
    const json = JSON.stringify(data ?? {}, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Some iOS Safari versions don't fully support "download" attribute
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_self";
    document.body.appendChild(a);

    a.click();
    a.remove();

    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 1000);
  } catch {
    // Fallback: open JSON in new tab (last resort)
    try {
      const json = JSON.stringify(data ?? {}, null, 2);
      const w = window.open();
      if (w) {
        w.document.open();
        w.document.write(`<pre>${escapeHtml(json)}</pre>`);
        w.document.close();
      }
    } catch {
      // ignore
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Optional helpers (safe to keep)
export function exportBackup(state) {
  // คืนค่า raw object (ใช้กับ UI export/import ได้)
  return state ?? {};
}

export function importBackup(jsonText) {
  try {
    const data = JSON.parse(String(jsonText || "{}"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export { STORAGE_KEY };
