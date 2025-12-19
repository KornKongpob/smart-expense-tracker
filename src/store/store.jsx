// src/store/store.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

import { ACTIONS } from "./actions";
import { reducer, createInitialState } from "./reducer";

import { loadAll, saveAll, clearAll } from "../services/storage";
import { DEFAULT_CATEGORIES } from "../constants/categories";
import { generateId, generateTransferId } from "../utils/id";
import { calcAccountBalance } from "./selectors";
import { toISODate } from "../utils/format";

// ===== defaults (กันแอพพังถ้า localStorage ว่าง) =====
const DEFAULT_ACCOUNTS = [
  { id: "acc_cash", name: "เงินสด", color: "#1DD1A1", icon: "💵", openingBalance: 0 },
];

const AppStoreContext = createContext(null);

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const boot = loadAll({
      defaultAccounts: DEFAULT_ACCOUNTS,
      defaultCategories: DEFAULT_CATEGORIES,
    });
    return createInitialState(boot);
  });

  // persist (save เสมอ)
  useEffect(() => {
    saveAll({
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
    });
  }, [state.transactions, state.accounts, state.categories]);

  // ===== selectors/helpers =====
  const getEditingTransaction = useMemo(() => {
    return () => {
      const id = state?.ui?.editingId;
      if (!id) return null;
      return state.transactions.find((t) => t.id === id) || null;
    };
  }, [state.transactions, state?.ui?.editingId]);

  // ===== actions =====
  const api = useMemo(() => {
    const navigate = (view) => dispatch({ type: ACTIONS.NAVIGATE, payload: view });

    const startNew = () => dispatch({ type: ACTIONS.START_NEW_TRANSACTION });
    const startNewTransaction = startNew;

    const startEdit = (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id });
    const startEditTransaction = startEdit;

    const setTransactions = (next) => dispatch({ type: ACTIONS.SET_TRANSACTIONS, payload: next ?? [] });

    const upsertTransaction = (tx) => {
      const next = {
        ...tx,
        id: tx?.id || generateId(),
        amount: safeNumber(tx?.amount, 0),
        type: tx?.type || "expense",
        category: tx?.category || "",
        accountId: tx?.accountId || "",
        date: tx?.date || toISODate(new Date()),
        note: String(tx?.note || ""),
        isTransfer: !!tx?.isTransfer,
        transferId: tx?.transferId || null,
      };
      dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload: next });
    };

    // ✅ delete: if transfer => delete both sides
    const deleteTransaction = (id) => {
      const tx = state.transactions.find((t) => t.id === id);
      if (tx?.isTransfer && tx?.transferId) {
        const next = state.transactions.filter((t) => t.transferId !== tx.transferId);
        setTransactions(next);
        // force back to dashboard
        navigate("dashboard");
        return;
      }
      dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: id });
    };

    const addAccount = (account) => {
      const next = {
        id: account?.id || generateId(),
        name: String(account?.name || "").trim() || "บัญชีใหม่",
        color: account?.color || "#1DD1A1",
        icon: (account?.icon || "💳").trim(),
        openingBalance: safeNumber(account?.openingBalance, 0),
      };
      dispatch({ type: ACTIONS.ADD_ACCOUNT, payload: next });
    };

    const updateAccount = (patch) => {
      dispatch({ type: ACTIONS.UPDATE_ACCOUNT, payload: patch });
    };

    const deleteAccount = (id) => dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: id });

    /**
     * ✅ ปรับยอดบัญชีให้เท่ากับ desiredBalance
     * - recordAsTransaction = false => ปรับ openingBalance อย่างเดียว (ไม่ไปอยู่ในสถิติ)
     * - recordAsTransaction = true  => สร้าง transaction ปรับยอด (ไปอยู่ในสถิติ)
     */
    const adjustAccountBalance = ({ accountId, desiredBalance, recordAsTransaction }) => {
      const current = calcAccountBalance(state.accounts, state.transactions, accountId);
      const desired = safeNumber(desiredBalance, current);
      const delta = desired - current;

      if (Math.abs(delta) < 0.000001) return;

      if (!recordAsTransaction) {
        // ปรับ openingBalance ให้ผลรวมสุดท้าย = desired
        const acc = state.accounts.find((a) => a.id === accountId);
        const opening = safeNumber(acc?.openingBalance, 0);
        const nextOpening = opening + delta;

        dispatch({
          type: ACTIONS.UPDATE_ACCOUNT_OPENING_BALANCE,
          payload: { id: accountId, openingBalance: nextOpening },
        });
        return;
      }

      // record as transaction (income if delta>0, expense if delta<0)
      const type = delta >= 0 ? "income" : "expense";
      const amount = Math.abs(delta);

      // choose category id that exists
      const catId = type === "income" ? "refund" : "other";

      const tx = {
        id: generateId(),
        type,
        amount,
        category: catId,
        accountId,
        date: toISODate(new Date()),
        note: "ปรับยอดบัญชี",
        isTransfer: false,
        transferId: null,
      };

      // ไม่บังคับไปหน้า add — แค่เพิ่มใน list แล้วอยู่หน้าเดิม
      const next = [...state.transactions, tx];
      setTransactions(next);
    };

    // ✅ Transfer: create 2 transactions linked by transferId
    const createTransfer = ({ fromAccountId, toAccountId, amount, date, note }) => {
      const amt = safeNumber(amount, 0);
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || amt <= 0) return null;

      const transferId = generateTransferId();
      const when = date || toISODate(new Date());
      const memo = String(note || "Transfer");

      const outTx = {
        id: generateId(),
        type: "expense",
        amount: amt,
        category: "other",
        accountId: fromAccountId,
        date: when,
        note: memo,
        isTransfer: true,
        transferId,
      };

      const inTx = {
        id: generateId(),
        type: "income",
        amount: amt,
        category: "refund",
        accountId: toAccountId,
        date: when,
        note: memo,
        isTransfer: true,
        transferId,
      };

      const next = [...state.transactions, outTx, inTx];
      setTransactions(next);
      navigate("dashboard");
      return transferId;
    };

    // ✅ Update transfer (edit): rewrite both sides by transferId
    const updateTransfer = ({ transferId, fromAccountId, toAccountId, amount, date, note }) => {
      const amt = safeNumber(amount, 0);
      if (!transferId || !fromAccountId || !toAccountId || fromAccountId === toAccountId || amt <= 0) return;

      const when = date || toISODate(new Date());
      const memo = String(note || "Transfer");

      const next = state.transactions.map((t) => {
        if (t.transferId !== transferId) return t;

        if (t.type === "expense") {
          return { ...t, accountId: fromAccountId, amount: amt, date: when, note: memo, isTransfer: true };
        }
        if (t.type === "income") {
          return { ...t, accountId: toAccountId, amount: amt, date: when, note: memo, isTransfer: true };
        }
        return t;
      });

      setTransactions(next);
      navigate("dashboard");
    };

    // ✅ Categories: accept both call styles
    // 1) addCategory({ type, category })
    // 2) addCategory({ type, name, icon, color })
    const addCategory = (payload) => {
      const type = payload?.type;
      if (type !== "expense" && type !== "income") return;

      const category =
        payload?.category && typeof payload.category === "object"
          ? payload.category
          : {
              id: generateId(),
              name: String(payload?.name || "").trim() || "หมวดใหม่",
              icon: String(payload?.icon || "🏷️"),
              color: String(payload?.color || "#C8D6E5"),
            };

      dispatch({ type: ACTIONS.ADD_CATEGORY, payload: { type, category } });
    };

    const deleteCategory = ({ type, id }) => dispatch({ type: ACTIONS.DELETE_CATEGORY, payload: { type, id } });

    const resetAll = () => {
      clearAll();
      dispatch({
        type: ACTIONS.RESET_ALL,
        payload: {
          transactions: [],
          accounts: DEFAULT_ACCOUNTS,
          categories: DEFAULT_CATEGORIES,
        },
      });
    };

    const importBackup = (payload) => dispatch({ type: ACTIONS.IMPORT_BACKUP, payload });

    const exportBackup = () => ({
      transactions: state.transactions ?? [],
      accounts: state.accounts ?? [],
      categories: state.categories ?? { expense: [], income: [] },
    });

    // ✅ IMPORTANT: Provide BOTH top-level functions and `actions` object
    // so old components won't break.
    const actions = {
      navigate,
      startNew,
      startNewTransaction,
      startEdit,
      startEditTransaction,
      upsertTransaction,
      deleteTransaction,
      setTransactions,
      addAccount,
      updateAccount,
      deleteAccount,
      adjustAccountBalance,
      createTransfer,
      updateTransfer,
      addCategory,
      deleteCategory,
      resetAll,
      importBackup,
      exportBackup,
      getEditingTransaction,
    };

    return {
      // state
      state,
      dispatch,

      // selectors
      getEditingTransaction,

      // top-level actions (new code should use these)
      navigate,
      startNew,
      startNewTransaction,
      startEdit,
      startEditTransaction,
      upsertTransaction,
      deleteTransaction,
      setTransactions,
      addAccount,
      updateAccount,
      deleteAccount,
      adjustAccountBalance,
      createTransfer,
      updateTransfer,
      addCategory,
      deleteCategory,
      resetAll,
      importBackup,
      exportBackup,

      // backward compat for Navbar/old code
      actions,
    };
  }, [state, getEditingTransaction]);

  return <AppStoreContext.Provider value={api}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
