// src/store/store.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

import { ACTIONS } from "./actions";

import { loadAll, saveAll, clearAll } from "../services/storage";
import { DEFAULT_CATEGORIES } from "../constants/categories";
import { ACCOUNT_ICONS } from "../constants/presets.jsx"; // ✅ for iconId validation + future UI usage
import { generateId } from "../utils/id";
import { calcAccountBalance, parseDateSafe } from "./selectors";
import { toISODate } from "../utils/format";

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

const ensureCategories = (cats) => {
  const expense = toArray(cats?.expense);
  const income = toArray(cats?.income);
  return {
    expense: expense.length ? expense : DEFAULT_CATEGORIES.expense,
    income: income.length ? income : DEFAULT_CATEGORIES.income,
  };
};

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

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

  const openingBalance = safeNum(a?.openingBalance, 0);

  return {
    ...a,
    id,
    name,
    type,
    color,
    icon,
    iconId,
    openingBalance,

    accountNumber: a?.accountNumber ? digitsOnly(a.accountNumber) : "",
    creditLimit: safeNum(a?.creditLimit, 0),
    statementDay: clampInt(a?.statementDay, 1, 31, 1),
    dueDay: clampInt(a?.dueDay, 1, 31, 25),
    cardLast4: a?.cardLast4 ? digitsOnly(a.cardLast4) : "",
  };
}

function normalizeBoot(boot) {
  const transactions = toArray(boot?.transactions);

  const accountsRaw = toArray(boot?.accounts);
  const accounts = (accountsRaw.length ? accountsRaw : DEFAULT_ACCOUNTS).map(normalizeAccount);

  const cats = boot?.categories && typeof boot.categories === "object" ? boot.categories : DEFAULT_CATEGORIES;
  const categories = ensureCategories(cats);

  const budgets = toArray(boot?.budgets);
  const recurring = toArray(boot?.recurring);

  const ui = boot?.ui && typeof boot.ui === "object" ? boot.ui : undefined;

  return {
    transactions,
    accounts,
    categories,
    budgets,
    recurring,
    ui,
  };
}

export function createInitialState(boot = {}) {
  const tx = toArray(boot?.transactions);
  const acc = toArray(boot?.accounts);
  const cats = ensureCategories(boot?.categories);

  // ✅ Always enforce normalized accounts (even if provided)
  const normalizedAccounts = acc.length ? acc.map(normalizeAccount) : DEFAULT_ACCOUNTS.map(normalizeAccount);

  return {
    transactions: tx,
    accounts: normalizedAccounts,
    categories: cats,
    budgets: toArray(boot?.budgets),
    recurring: toArray(boot?.recurring),
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

// ---------- recurring generation ----------
function addDaysLocal(dateObj, n) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

function addMonthsLocal(dateObj, n) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth() + n, dateObj.getDate());
}

function advanceRecurringDate(dateObj, frequency, interval) {
  const itv = clampInt(interval, 1, 120, 1);
  if (frequency === "weekly") return addDaysLocal(dateObj, 7 * itv);
  return addMonthsLocal(dateObj, itv); // monthly default
}

function generateDueTransactionsForRecurring(r, todayISO) {
  if (!r?.enabled) return { txs: [], nextRecurring: r };

  const today = parseDateSafe(todayISO);
  const start = parseDateSafe(r.startDate || todayISO);

  let nextDue = r.lastGenerated
    ? advanceRecurringDate(parseDateSafe(r.lastGenerated), r.frequency, r.interval)
    : start;

  if (nextDue.getTime() > today.getTime()) return { txs: [], nextRecurring: r };

  const txs = [];
  let lastGenDate = r.lastGenerated ? parseDateSafe(r.lastGenerated) : null;

  let safety = 0;
  while (nextDue.getTime() <= today.getTime()) {
    safety += 1;
    if (safety > 500) break;

    const iso = toISODate(nextDue);

    txs.push({
      id: generateId(),
      type: r.type === "income" ? "income" : "expense",
      amount: safeNum(r.amount, 0),
      category: r.categoryId,
      accountId: r.accountId,
      date: iso,
      note: String(r.note || "Recurring").trim() || "Recurring",
      isTransfer: false,
      transferId: null,
      ref: null,
      source: "recurring",
      meta: { kind: "recurring", recurringId: r.id || null },
    });

    lastGenDate = nextDue;
    nextDue = advanceRecurringDate(nextDue, r.frequency, r.interval);
  }

  const nextRecurring = {
    ...r,
    lastGenerated: lastGenDate ? toISODate(lastGenDate) : r.lastGenerated || null,
  };

  return { txs, nextRecurring };
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
      const id = action.payload;
      const accounts = state.accounts.filter((a) => a.id !== id);
      const transactions = state.transactions.filter((t) => t.accountId !== id);
      return { ...state, accounts, transactions };
    }

    case ACTIONS.ADD_CATEGORY: {
      const { type, category } = action.payload || {};
      if (!type || !category) return state;
      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: [...(state.categories[type] || []), category],
        },
      };
    }

    case ACTIONS.DELETE_CATEGORY: {
      const { type, id } = action.payload || {};
      if (!type || !id) return state;
      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: (state.categories[type] || []).filter((c) => c.id !== id),
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
        limit: safeNum(b.limit, 0),
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
        amount: safeNum(r.amount, 0),
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
      defaultUI: { view: "dashboard", editingId: null },
    });

    return createInitialState(normalizeBoot(boot));
  });

  // ✅ persist (include ui to keep view/editingId stable)
  useEffect(() => {
    saveAll({
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
      budgets: state.budgets,
      recurring: state.recurring,
      ui: state.ui,
    });
  }, [state.transactions, state.accounts, state.categories, state.budgets, state.recurring, state.ui]);

  const getEditingTransaction = useMemo(() => {
    return () => {
      const id = state?.ui?.editingId;
      if (!id) return null;
      return state.transactions.find((t) => t.id === id) || null;
    };
  }, [state.transactions, state?.ui?.editingId]);

  const api = useMemo(() => {
    const navigate = (view) => dispatch({ type: ACTIONS.NAVIGATE, payload: view });

    const startNewTransaction = () => dispatch({ type: ACTIONS.START_NEW_TRANSACTION });
    const startNew = startNewTransaction;

    const startEditTransaction = (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id });
    const startEdit = startEditTransaction;

    const upsertTransaction = (tx) => {
      const id = tx?.id || generateId();
      const amount = safeNum(tx?.amount, 0);
      const date = tx?.date ? String(tx.date).slice(0, 10) : toISODate(new Date());

      const cleaned = {
        ...tx,
        id,
        amount,
        date,
        note: String(tx?.note || ""),
        isTransfer: !!tx?.isTransfer,
      };

      dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload: cleaned });
    };

    const bulkUpsertTransactions = (txs, { navigateToDashboard = true } = {}) => {
      const list = Array.isArray(txs) ? txs : [];
      dispatch({
        type: ACTIONS.BULK_UPSERT_TRANSACTIONS,
        payload: list.map((tx) => {
          const id = tx?.id || generateId();
          const amount = safeNum(tx?.amount, 0);
          const date = tx?.date ? String(tx.date).slice(0, 10) : toISODate(new Date());
          return {
            ...tx,
            id,
            amount,
            date,
            note: String(tx?.note || ""),
            isTransfer: !!tx?.isTransfer,
          };
        }),
        meta: { navigateToDashboard },
      });
    };

    const deleteTransaction = (id) => dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: id });

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

    const deleteAccount = (id) => dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: id });

    /**
     * ✅ Adjust account balance
     * - recordAsTransaction = true: create an income/expense tx (shows in stats)
     * - recordAsTransaction = false: modify openingBalance to match desired (silent fix)
     */
    const adjustAccountBalance = ({ accountId, desiredBalance, recordAsTransaction }) => {
      const desired = safeNum(desiredBalance, NaN);
      if (!Number.isFinite(desired)) return;

      const current = calcAccountBalance(state.accounts, state.transactions, accountId);
      const delta = desired - current;
      if (Math.abs(delta) < 0.000001) return;

      const acc = state.accounts.find((a) => a.id === accountId);
      if (!acc) return;

      if (recordAsTransaction) {
        const isIncome = delta > 0;
        const fallbackCat =
          isIncome ? state.categories.income?.[0]?.id || "salary" : state.categories.expense?.[0]?.id || "other";

        upsertTransaction({
          id: generateId(),
          type: isIncome ? "income" : "expense",
          amount: Math.abs(delta),
          category: fallbackCat,
          accountId,
          date: toISODate(new Date()),
          note: "ปรับยอดบัญชี",
          isTransfer: false,
          meta: { kind: "adjust_balance" },
        });

        dispatch({ type: ACTIONS.NAVIGATE, payload: "accounts" });
      } else {
        const opening = safeNum(acc.openingBalance, 0);
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

      for (const r of state.recurring || []) {
        const { txs, nextRecurring: nr } = generateDueTransactionsForRecurring(r, todayISO);
        if (txs.length) created.push(...txs);
        nextRecurring.push(nr);
      }

      if (created.length) {
        dispatch({
          type: ACTIONS.APPLY_RECURRING_GENERATION,
          payload: { transactions: created, recurring: nextRecurring },
        });
      }

      return created.length;
    };

    const resetAll = () => {
      clearAll();
      dispatch({
        type: ACTIONS.RESET_ALL,
        payload: {
          transactions: [],
          accounts: DEFAULT_ACCOUNTS,
          categories: DEFAULT_CATEGORIES,
          budgets: [],
          recurring: [],
          ui: { view: "dashboard", editingId: null },
        },
      });
    };

    const importBackup = (payload) => dispatch({ type: ACTIONS.IMPORT_BACKUP, payload });

    const exportBackup = () => ({
      transactions: state.transactions ?? [],
      accounts: state.accounts ?? [],
      categories: state.categories ?? { expense: [], income: [] },
      budgets: state.budgets ?? [],
      recurring: state.recurring ?? [],
      ui: state.ui ?? { view: "dashboard", editingId: null },
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
