import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

import { ACTIONS } from "./actions";
import { reducer, createInitialState } from "./reducer";

import { loadAll, saveAll, clearAll, exportBackup as exportBackupFile } from "../services/storage";
import { DEFAULT_CATEGORIES } from "../constants/categories";
import { generateId, generateTransferId } from "../utils/id";
import { calcAccountBalance, monthKeyOf } from "./selectors";

const DEFAULT_ACCOUNTS = [
  {
    id: "acc_cash",
    name: "เงินสด",
    type: "cash", // cash | bank | credit
    color: "#1DD1A1",
    icon: "💵",
    openingBalance: 0,
    accountNumber: "", // optional digits
    cardLast4: "", // optional
    creditLimit: 0,
    statementDay: 25,
    dueDay: 5,
  },
];

const AppStoreContext = createContext(null);

function slugId(name) {
  const s = String(name || "").trim().toLowerCase();
  const id = s
    .replace(/[^\wก-๙\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 24);
  return id || generateId();
}

function normalizeDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function matchAccountFromHint(accounts, hint) {
  // hint: { from_account_no, card_last4, payment_method }
  const fromNo = normalizeDigits(hint?.from_account_no);
  const toNo = normalizeDigits(hint?.to_account_no);
  const last4 = normalizeDigits(hint?.card_last4).slice(-4);

  // 1) match bank account number (endsWith)
  if (fromNo) {
    const hit = accounts.find((a) => {
      const accNo = normalizeDigits(a.accountNumber);
      return accNo && (accNo.endsWith(fromNo.slice(-4)) || accNo.endsWith(fromNo.slice(-6)) || accNo === fromNo);
    });
    if (hit) return hit.id;
  }

  // 2) if transfer and only to-account known, still try match from by NOT matching to
  if (toNo) {
    const hit = accounts.find((a) => {
      const accNo = normalizeDigits(a.accountNumber);
      return accNo && (accNo.endsWith(toNo.slice(-4)) || accNo.endsWith(toNo.slice(-6)) || accNo === toNo);
    });
    // ถ้าเจอแต่เป็น “to” ให้ไม่เลือกอัตโนมัติเป็น from
    // (ปล่อยให้ user เลือกเองใน queue)
    if (hit) return null;
  }

  // 3) match credit card last4
  if (last4) {
    const hit = accounts.find((a) => String(a.cardLast4 || "").replace(/\D/g, "").slice(-4) === last4);
    if (hit) return hit.id;
  }

  return null;
}

function findCategoryId(state, type, catValue) {
  const list = state.categories?.[type] || [];
  const raw = String(catValue || "").trim();

  // if looks like known ids
  const byId = list.find((c) => c.id === raw);
  if (byId) return byId.id;

  // match by name
  const low = raw.toLowerCase();
  const byName = list.find((c) => String(c.name || "").toLowerCase() === low);
  if (byName) return byName.id;

  // map common
  const common = ["food","transport","shopping","bills","health","entertainment","other","transfer","income"];
  const byCommon = common.find((x) => low.includes(x));
  if (byCommon && list.find((c) => c.id === byCommon)) return byCommon;

  return null;
}

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => {
      const boot = loadAll({
        defaultAccounts: DEFAULT_ACCOUNTS,
        defaultCategories: DEFAULT_CATEGORIES,
        defaultBudgets: {},
        defaultRecurring: [],
      });
      return createInitialState(boot);
    }
  );

  useEffect(() => {
    saveAll({
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
      budgets: state.budgets,
      recurring: state.recurring,
    });
  }, [state.transactions, state.accounts, state.categories, state.budgets, state.recurring]);

  const getEditingTransaction = useMemo(() => {
    return () => {
      const id = state?.ui?.editingId;
      if (!id) return null;
      return state.transactions.find((t) => t.id === id) || null;
    };
  }, [state.transactions, state?.ui?.editingId]);

  const actions = useMemo(() => {
    const navigate = (view) => dispatch({ type: ACTIONS.NAVIGATE, payload: view });

    const startNewTransaction = () => dispatch({ type: ACTIONS.START_NEW_TRANSACTION });
    const startEditTransaction = (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id });

    const upsertTransaction = (tx) => {
      const clean = {
        ...tx,
        id: tx.id || generateId(),
        amount: Number(tx.amount) || 0,
        date: tx.date || new Date().toISOString().slice(0, 10),
        note: String(tx.note || ""),
        meta: tx.meta || {},
      };
      dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload: clean });
    };

    const addManyTransactions = (txs) => {
      const clean = (txs || []).map((t) => ({
        ...t,
        id: t.id || generateId(),
        amount: Number(t.amount) || 0,
        date: t.date || new Date().toISOString().slice(0, 10),
        note: String(t.note || ""),
        meta: t.meta || {},
      }));
      dispatch({ type: ACTIONS.ADD_MANY_TRANSACTIONS, payload: clean });
    };

    const deleteTransaction = (id) => dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: id });

    const addAccount = (account) => {
      const next = {
        id: account?.id || generateId(),
        name: String(account?.name || "").trim() || "บัญชีใหม่",
        type: account?.type || "cash",
        color: account?.color || "#1DD1A1",
        icon: (account?.icon || "💳").trim(),
        openingBalance: Number(account?.openingBalance || 0),
        accountNumber: String(account?.accountNumber || ""),
        cardLast4: String(account?.cardLast4 || "").replace(/\D/g, "").slice(-4),
        creditLimit: Number(account?.creditLimit || 0),
        statementDay: Number(account?.statementDay || 25),
        dueDay: Number(account?.dueDay || 5),
      };
      dispatch({ type: ACTIONS.ADD_ACCOUNT, payload: next });
    };

    const updateAccount = (patch) => {
      dispatch({ type: ACTIONS.UPDATE_ACCOUNT, payload: patch });
    };

    const deleteAccount = (id) => dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: id });

    const ensureCategory = ({ type, value }) => {
      const existingId = findCategoryId(state, type, value);
      if (existingId) return existingId;

      // auto create
      const name = String(value || "").trim() || "อื่นๆ";
      const id = slugId(name);

      // prevent duplicate id collision
      const list = state.categories?.[type] || [];
      const finalId = list.some((c) => c.id === id) ? generateId() : id;

      const category = {
        id: finalId,
        name,
        icon: "🏷️",
        color: "#C8D6E5",
        auto: true,
      };

      dispatch({ type: ACTIONS.ADD_CATEGORY, payload: { type, category } });
      return category.id;
    };

    const addCategory = ({ type, name, icon, color, id }) => {
      const category = {
        id: id || slugId(name),
        name: String(name || "").trim() || "หมวดใหม่",
        icon: icon || "🏷️",
        color: color || "#C8D6E5",
      };
      dispatch({ type: ACTIONS.ADD_CATEGORY, payload: { type, category } });
    };

    const deleteCategory = ({ type, id }) => dispatch({ type: ACTIONS.DELETE_CATEGORY, payload: { type, id } });

    const adjustAccountBalance = ({ accountId, desiredBalance, recordAsTransaction, date, note }) => {
      const current = calcAccountBalance(state.accounts, state.transactions, accountId);
      const desired = Number(desiredBalance);
      if (!Number.isFinite(desired)) return;

      // update openingBalance to achieve desired (opening = desired - txNet)
      // txNet = current - opening
      const acc = state.accounts.find((a) => a.id === accountId);
      const opening = Number(acc?.openingBalance || 0);
      const txNet = current - opening;
      const newOpening = desired - txNet;

      dispatch({ type: ACTIONS.UPDATE_ACCOUNT, payload: { id: accountId, openingBalance: newOpening } });

      if (recordAsTransaction) {
        const delta = desired - current;
        if (delta !== 0) {
          upsertTransaction({
            type: delta >= 0 ? "income" : "expense",
            amount: Math.abs(delta),
            category: delta >= 0 ? ensureCategory({ type: "income", value: "adjustment" }) : ensureCategory({ type: "expense", value: "adjustment" }),
            accountId,
            date: date || new Date().toISOString().slice(0, 10),
            note: note || "ปรับยอดบัญชี",
            isTransfer: false,
            meta: { system: "balance_adjust" },
          });
        }
      }
    };

    const transferFunds = ({ fromAccountId, toAccountId, amount, date, note, ref }) => {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return;

      const transferId = generateTransferId();
      const when = date || new Date().toISOString().slice(0, 10);

      const fromName = state.accounts.find((a) => a.id === fromAccountId)?.name || "";
      const toName = state.accounts.find((a) => a.id === toAccountId)?.name || "";

      const outTx = {
        id: generateId(),
        type: "expense",
        amount: amt,
        category: "transfer",
        accountId: fromAccountId,
        date: when,
        note: note || `โอนไป ${toName}`,
        isTransfer: true,
        transferId,
        meta: { transferSide: "out", toAccountId, toAccountName: toName, ref: ref || null },
      };

      const inTx = {
        id: generateId(),
        type: "income",
        amount: amt,
        category: "income",
        accountId: toAccountId,
        date: when,
        note: note || `รับโอนจาก ${fromName}`,
        isTransfer: true,
        transferId,
        meta: { transferSide: "in", fromAccountId, fromAccountName: fromName, ref: ref || null },
      };

      dispatch({ type: ACTIONS.ADD_MANY_TRANSACTIONS, payload: [outTx, inTx] });
      dispatch({ type: ACTIONS.NAVIGATE, payload: "dashboard" });
    };

    const isDuplicateRef = (ref) => {
      const r = String(ref || "").trim();
      if (!r) return false;
      return state.transactions.some((t) => String(t?.meta?.ref || "").trim() === r);
    };

    const guessAccountIdFromScan = (scan) => {
      return matchAccountFromHint(state.accounts, scan);
    };

    const setBudget = ({ monthKey, categoryId, amount }) => {
      dispatch({ type: ACTIONS.SET_BUDGET, payload: { monthKey, categoryId, amount: Number(amount) || 0 } });
    };

    const deleteBudget = ({ monthKey, categoryId }) => {
      dispatch({ type: ACTIONS.DELETE_BUDGET, payload: { monthKey, categoryId } });
    };

    const addRecurring = (rule) => {
      const next = { id: rule.id || generateId(), ...rule };
      dispatch({ type: ACTIONS.ADD_RECURRING, payload: next });
    };

    const updateRecurring = (patch) => dispatch({ type: ACTIONS.UPDATE_RECURRING, payload: patch });
    const deleteRecurring = (id) => dispatch({ type: ACTIONS.DELETE_RECURRING, payload: id });

    const runRecurringNow = () => {
      const today = new Date().toISOString().slice(0, 10);
      const txs = [];

      for (const r of state.recurring || []) {
        // very simple: create one tx when user clicks
        txs.push({
          id: generateId(),
          type: "expense",
          amount: Number(r.amount) || 0,
          category: r.categoryId,
          accountId: r.accountId,
          date: today,
          note: r.note || r.name || "Recurring",
          isTransfer: false,
          meta: { system: "recurring", recurringId: r.id },
        });
      }

      if (txs.length) dispatch({ type: ACTIONS.ADD_MANY_TRANSACTIONS, payload: txs });
    };

    const exportBackup = () => exportBackupFile(state);

    const resetAll = () => {
      clearAll();
      dispatch({
        type: ACTIONS.RESET_ALL,
        payload: {
          transactions: [],
          accounts: DEFAULT_ACCOUNTS,
          categories: DEFAULT_CATEGORIES,
          budgets: {},
          recurring: [],
        },
      });
    };

    const importBackup = (payload) => dispatch({ type: ACTIONS.IMPORT_BACKUP, payload });

    return {
      navigate,
      startNewTransaction,
      startEditTransaction,
      upsertTransaction,
      addManyTransactions,
      deleteTransaction,

      addAccount,
      updateAccount,
      deleteAccount,
      adjustAccountBalance,

      addCategory,
      deleteCategory,
      ensureCategory,

      transferFunds,

      guessAccountIdFromScan,
      isDuplicateRef,

      setBudget,
      deleteBudget,

      addRecurring,
      updateRecurring,
      deleteRecurring,
      runRecurringNow,

      exportBackup,
      resetAll,
      importBackup,

      monthKeyOf,
    };
  }, [state]);

  const api = useMemo(() => {
    return {
      state,
      actions,
      getEditingTransaction,
    };
  }, [state, actions, getEditingTransaction]);

  return <AppStoreContext.Provider value={api}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
