// src/store/store.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { ACTIONS } from "./actions";
import { reducer, createInitialState } from "./reducer";

import { loadAll, saveAll, clearAll, exportBackup } from "../services/storage";
import { DEFAULT_CATEGORIES } from "../constants/categories";
import { generateId, generateTransferId } from "../utils/id";

const AppStoreContext = createContext(null);

const DEFAULT_ACCOUNTS = [
  { id: "acc_cash", name: "เงินสด", type: "cash", color: "#1DD1A1" },
];

function bootstrap() {
  const { transactions, accounts, categories } = loadAll({
    defaultAccounts: DEFAULT_ACCOUNTS,
    defaultCategories: DEFAULT_CATEGORIES,
  });

  return { transactions, accounts, categories };
}

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(bootstrap()));

  // persist model changes
  useEffect(() => {
    saveAll({
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
    });
  }, [state.transactions, state.accounts, state.categories]);

  // helpers
  const getTxById = (id) => state.transactions.find((t) => t.id === id) || null;

  const getTransferPairByGroupId = (groupId) => {
    const group = state.transactions.filter((t) => t.transferGroupId === groupId);
    const outTx = group.find((t) => t.transferSide === "out") || null;
    const inTx = group.find((t) => t.transferSide === "in") || null;
    return { outTx, inTx };
  };

  // ✅ editing entry (รองรับ transfer)
  const getEditingEntry = () => {
    const id = state.ui.editingId;
    if (!id) return null;

    const tx = getTxById(id);
    if (!tx) return null;

    if (tx.isTransfer && tx.transferGroupId) {
      const { outTx, inTx } = getTransferPairByGroupId(tx.transferGroupId);
      if (!outTx || !inTx) return null;

      return {
        mode: "transfer",
        transferGroupId: tx.transferGroupId,
        amount: outTx.amount,
        date: outTx.date,
        note: outTx.note || "",
        fromAccountId: outTx.accountId,
        toAccountId: inTx.accountId,
        outId: outTx.id,
        inId: inTx.id,
      };
    }

    return { mode: "transaction", ...tx };
  };

  const actions = useMemo(() => {
    return {
      // nav
      navigate: (view) => dispatch({ type: ACTIONS.NAVIGATE, payload: view }),
      startNewTransaction: () => dispatch({ type: ACTIONS.START_NEW_TRANSACTION }),
      startEditTransaction: (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id }),

      // transaction
      upsertTransaction: (tx) => {
        const payload = {
          id: tx.id ?? generateId(),
          amount: Number(tx.amount || 0),
          type: tx.type,
          category: tx.category,
          accountId: tx.accountId,
          date: tx.date,
          note: tx.note || "",
          isTransfer: !!tx.isTransfer,
          transferGroupId: tx.transferGroupId ?? null,
          transferSide: tx.transferSide ?? null,
          transferAccountId: tx.transferAccountId ?? null,
        };

        dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload });
      },

      deleteTransaction: (id) => dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: id }),

      // ✅ transfer
      upsertTransfer: ({
        transferGroupId,
        outId,
        inId,
        amount,
        date,
        note,
        fromAccountId,
        toAccountId,
      }) => {
        const groupId = transferGroupId ?? generateTransferId();
        const amt = Number(amount || 0);

        const outTx = {
          id: outId ?? generateId(),
          type: "expense",
          category: "transfer",
          accountId: fromAccountId,
          date,
          note: note || "Transfer",
          amount: amt,
          isTransfer: true,
          transferGroupId: groupId,
          transferSide: "out",
          transferAccountId: toAccountId,
        };

        const inTx = {
          id: inId ?? generateId(),
          type: "income",
          category: "transfer",
          accountId: toAccountId,
          date,
          note: note || "Transfer",
          amount: amt,
          isTransfer: true,
          transferGroupId: groupId,
          transferSide: "in",
          transferAccountId: fromAccountId,
        };

        dispatch({ type: ACTIONS.UPSERT_TRANSFER, payload: { outTx, inTx } });
      },

      deleteTransferGroup: (groupId) => dispatch({ type: ACTIONS.DELETE_TRANSFER_GROUP, payload: groupId }),

      // accounts
      addAccount: ({ name, type, color }) => {
        dispatch({
          type: ACTIONS.ADD_ACCOUNT,
          payload: { id: generateId(), name, type, color },
        });
      },

      deleteAccount: (id) => dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: id }),

      // categories
      addCategory: ({ type, name, icon, color }) => {
        dispatch({
          type: ACTIONS.ADD_CATEGORY,
          payload: { type, category: { id: generateId(), name, icon, color } },
        });
      },

      deleteCategory: ({ type, id }) => dispatch({ type: ACTIONS.DELETE_CATEGORY, payload: { type, id } }),

      // backup/reset
      exportBackup: () => exportBackup(state),
      importBackup: (payload) => dispatch({ type: ACTIONS.IMPORT_BACKUP, payload }),

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

      // getters
      getEditingEntry,
      // backward compat (ชื่อเก่า)
      getEditingTransaction: getEditingEntry,
    };
  }, [state]);

  // ✅ return แบบ destructure ง่าย ๆ (รองรับโค้ดเก่าที่เรียก navigate/startNew/... ตรงๆ)
  const value = useMemo(() => {
    return {
      state,
      dispatch,
      ...actions,
      actions, // เผื่อบางไฟล์ใช้ actions.navigate
    };
  }, [state, actions]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
