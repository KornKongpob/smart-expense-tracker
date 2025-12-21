// src/services/storage.js
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

function normalizeBoot(data, defaults = {}) {
  const obj = data && typeof data === "object" ? data : {};

  // allow both legacy shape (plain state) and versioned shape
  const root = obj.data && typeof obj.data === "object" ? obj.data : obj;

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

  const categories =
    root.categories && typeof root.categories === "object"
      ? root.categories
      : defaults.defaultCategories && typeof defaults.defaultCategories === "object"
      ? defaults.defaultCategories
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

  const ui =
    root.ui && typeof root.ui === "object"
      ? root.ui
      : defaults.defaultUI && typeof defaults.defaultUI === "object"
      ? defaults.defaultUI
      : undefined;

  return { transactions, accounts, categories, budgets, recurring, ui };
}

/**
 * ✅ Primary API used by src/store/store.jsx
 * loadAll({ defaultAccounts, defaultCategories, defaultBudgets, defaultRecurring })
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

  const data = payload && typeof payload === "object" ? payload : {};

  const record = {
    v: STORAGE_VERSION,
    updatedAt: Date.now(),
    data: {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      categories: data.categories && typeof data.categories === "object" ? data.categories : { expense: [], income: [] },
      budgets: Array.isArray(data.budgets) ? data.budgets : [],
      recurring: Array.isArray(data.recurring) ? data.recurring : [],
      ui: data.ui && typeof data.ui === "object" ? data.ui : undefined,
    },
  };

  const json = safeStringifyJSON(record);
  if (!json) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // ignore quota / serialization errors
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
