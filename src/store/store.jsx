// src/store/store.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

import { ACTIONS } from "./actions";
import { reducer, createInitialState } from "./reducer";

import { loadAll, saveAll, clearAll, exportBackup as exportBackupFn } from "../services/storage.js";
import { DEFAULT_CATEGORIES } from "../constants/categories.js";
import { generateId } from "../utils/id.js";

// ===== Defaults =====
const DEFAULT_ACCOUNTS = [{ id: "acc_cash", name: "เงินสด", type: "cash", color: "#1DD1A1" }];

// ===== Context =====
const AppStoreContext = createContext(null);

export function AppStoreProvider({ children }) {
  // init from localStorage
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const boot = loadAll({
      defaultAccounts: DEFAULT_ACCOUNTS,
      defaultCategories: DEFAULT_CATEGORIES,
    });
    return createInitialState(boot);
  });

  // persist (model only)
  useEffect(() => {
    saveAll({
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
    });
  }, [state.transactions, state.accounts, state.categories]);

  // ===== Helpers / Selectors =====
  const getEditingTransaction = () => {
    const id = state?.ui?.editingId;
    if (!id) return null;
    return (state.transactions || []).find((t) => t.id === id) || null;
  };

  // ===== Actions (match reducer.js) =====
  const actions = useMemo(() => {
    return {
      init: (payload) => dispatch({ type: ACTIONS.INIT, payload }),

      navigate: (view) => dispatch({ type: ACTIONS.NAVIGATE, payload: view }),

      startNewTransaction: () => dispatch({ type: ACTIONS.START_NEW_TRANSACTION }),

      startEditTransaction: (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id }),

      upsertTransaction: (tx) => {
        const withId = tx?.id ? tx : { ...tx, id: generateId() };
        dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload: withId });
      },

      deleteTransaction: (id) => dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: id }),

      addAccount: (account) => {
        const withId = account?.id ? account : { ...account, id: generateId() };
        dispatch({ type: ACTIONS.ADD_ACCOUNT, payload: withId });
      },

      deleteAccount: (id) => dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: id }),

      addCategory: ({ type, category }) => {
        const withId = category?.id ? category : { ...category, id: generateId() };
        dispatch({
          type: ACTIONS.ADD_CATEGORY,
          payload: { type, category: withId },
        });
      },

      deleteCategory: ({ type, id }) => {
        dispatch({
          type: ACTIONS.DELETE_CATEGORY,
          payload: { type, id },
        });
      },

      resetAll: () => {
        clearAll();
        dispatch({
          type: ACTIONS.RESET_ALL,
          payload: {
            transactions: [],
            accounts: DEFAULT_ACCOUNTS,
            categories: DEFAULT_CATEGORIES,
          },
        });
      },

      importBackup: (payload) => {
        // payload: {transactions, accounts, categories}
        dispatch({ type: ACTIONS.IMPORT_BACKUP, payload });
      },

      exportBackup: () => {
        return exportBackupFn({
          transactions: state.transactions,
          accounts: state.accounts,
          categories: state.categories,
        });
      },
    };
  }, [state.transactions, state.accounts, state.categories]);

  // ✅ Backward-compatible API: ให้ destructure ได้ตรงๆ (เหมือนที่ไฟล์อื่นใช้)
  const value = useMemo(() => {
    return {
      state,
      dispatch,
      actions,
      getEditingTransaction,

      // expose shortcuts
      navigate: actions.navigate,
      startNew: actions.startNewTransaction,
      startNewTransaction: actions.startNewTransaction,
      startEditTransaction: actions.startEditTransaction,
      upsertTransaction: actions.upsertTransaction,
      deleteTransaction: actions.deleteTransaction,
      addAccount: actions.addAccount,
      deleteAccount: actions.deleteAccount,
      addCategory: actions.addCategory,
      deleteCategory: actions.deleteCategory,
      resetAll: actions.resetAll,
      importBackup: actions.importBackup,
      exportBackup: actions.exportBackup,
    };
  }, [state, actions]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
