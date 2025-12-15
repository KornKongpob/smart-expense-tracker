// src/store/store.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { ACTIONS } from "./actions";
import { reducer, createInitialState } from "./reducer";
import { DEFAULT_CATEGORIES } from "../constants/categories";
import { loadAll, saveAll, clearAll } from "../services/storage";
import { generateId } from "../utils/id";
import { calcAccountTxNet } from "./selectors";
import { toISODate } from "../utils/format";

// ----- defaults -----
const DEFAULT_ACCOUNTS = [
  { id: "acc_cash", name: "เงินสด", icon: "💵", color: "#1DD1A1", openingBalance: 0 },
];

// map legacy "type" -> emoji
const LEGACY_TYPE_TO_EMOJI = {
  cash: "💵",
  bank: "🏦",
  card: "💳",
  saving: "🐷",
  wallet: "👛",
  digital: "📱",
  invest: "📈",
  gold: "🥇",
  business: "💼",
  safe: "🔒",
};

function migrateAccounts(accounts = []) {
  return accounts.map((a) => {
    const icon =
      a.icon ||
      (a.type ? LEGACY_TYPE_TO_EMOJI[a.type] : null) ||
      "💳";

    return {
      id: a.id,
      name: a.name ?? "บัญชี",
      icon,
      color: a.color ?? "#54A0FF",
      openingBalance: Number.isFinite(Number(a.openingBalance)) ? Number(a.openingBalance) : 0,
      // keep legacy fields (optional)
      ...(a.type ? { type: a.type } : {}),
    };
  });
}

function bootstrap() {
  const loaded = loadAll({
    defaultAccounts: DEFAULT_ACCOUNTS,
    defaultCategories: DEFAULT_CATEGORIES,
  });

  const accounts = migrateAccounts(loaded.accounts?.length ? loaded.accounts : DEFAULT_ACCOUNTS);

  return {
    transactions: loaded.transactions ?? [],
    accounts,
    categories: loaded.categories ?? DEFAULT_CATEGORIES,
  };
}

// ----- context -----
const AppStoreContext = createContext(null);

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(bootstrap()));

  useEffect(() => {
    saveAll({
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
    });
  }, [state.transactions, state.accounts, state.categories]);

  const api = useMemo(() => {
    const navigate = (view) => dispatch({ type: ACTIONS.NAVIGATE, payload: view });

    const startNew = () => dispatch({ type: ACTIONS.START_NEW_TRANSACTION });
    const startEdit = (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id });

    const upsertTransaction = (tx) =>
      dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload: tx });

    const deleteTransaction = (id) =>
      dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: id });

    const addAccount = (account) =>
      dispatch({ type: ACTIONS.ADD_ACCOUNT, payload: account });

    const updateAccount = (account) =>
      dispatch({ type: ACTIONS.UPDATE_ACCOUNT, payload: account });

    const deleteAccount = (id) =>
      dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: id });

    const getEditingTransaction = () => {
      const id = state.ui.editingId;
      if (!id) return null;
      return state.transactions.find((t) => t.id === id) || null;
    };

    const getAccountBalance = (accountId) => {
      const acc = state.accounts.find((a) => a.id === accountId);
      const opening = Number(acc?.openingBalance || 0);
      const net = calcAccountTxNet(state.transactions, accountId);
      return opening + net;
    };

    const adjustAccountBalance = ({
      accountId,
      desiredBalance,
      recordAsTransaction,
    }) => {
      const desired = Number(desiredBalance);
      if (!Number.isFinite(desired)) return;

      const current = getAccountBalance(accountId);
      const delta = desired - current;

      // no change
      if (Math.abs(delta) < 0.01) return;

      if (recordAsTransaction) {
        // บันทึกเป็น transaction (เข้า totals/stats ด้วย)
        const isIncome = delta > 0;
        upsertTransaction({
          id: generateId(),
          type: isIncome ? "income" : "expense",
          amount: Math.abs(delta),
          category: isIncome ? "refund" : "other", // ใช้หมวดที่มีอยู่จริง
          accountId,
          date: toISODate(new Date()),
          note: "ปรับยอดบัญชี",
          isTransfer: false,
        });
      } else {
        // ไม่บันทึกเป็น transaction -> ปรับ openingBalance ให้ยอดรวมตรง
        const txNet = calcAccountTxNet(state.transactions, accountId);
        const openingBalance = desired - txNet;
        updateAccount({ id: accountId, openingBalance });
      }
    };

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

    return {
      state,
      dispatch,

      navigate,
      startNew,
      startEdit,

      upsertTransaction,
      deleteTransaction,

      addAccount,
      updateAccount,
      deleteAccount,

      getEditingTransaction,
      getAccountBalance,
      adjustAccountBalance,

      resetAll,
    };
  }, [state]);

  return <AppStoreContext.Provider value={api}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
