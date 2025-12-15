// src/store/reducer.js
import { ACTIONS } from "./actions";

export function createInitialState({
  transactions = [],
  accounts = [],
  categories = { expense: [], income: [] },
}) {
  return {
    transactions,
    accounts,
    categories,
    ui: {
      view: "dashboard",
      editingId: null,
    },
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.INIT: {
      return createInitialState(action.payload);
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
      const exists = state.transactions.some((t) => t.id === tx.id);

      const nextTransactions = exists
        ? state.transactions.map((t) => (t.id === tx.id ? tx : t))
        : [...state.transactions, tx];

      return {
        ...state,
        transactions: nextTransactions,
        ui: { ...state.ui, editingId: null, view: "dashboard" },
      };
    }

    case ACTIONS.DELETE_TRANSACTION: {
      const id = action.payload;
      const nextTransactions = state.transactions.filter((t) => t.id !== id);
      const editingId = state.ui.editingId === id ? null : state.ui.editingId;

      return {
        ...state,
        transactions: nextTransactions,
        ui: { ...state.ui, editingId, view: "dashboard" },
      };
    }

    case ACTIONS.ADD_ACCOUNT: {
      return { ...state, accounts: [...state.accounts, action.payload] };
    }

    case ACTIONS.UPDATE_ACCOUNT: {
      const updated = action.payload; // {id, ...fields}
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
      };
    }

    case ACTIONS.DELETE_ACCOUNT: {
      const id = action.payload;
      const nextAccounts = state.accounts.filter((a) => a.id !== id);
      const nextTransactions = state.transactions.filter((t) => t.accountId !== id);
      return { ...state, accounts: nextAccounts, transactions: nextTransactions };
    }

    case ACTIONS.ADD_CATEGORY: {
      const { type, category } = action.payload;
      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: [...state.categories[type], category],
        },
      };
    }

    case ACTIONS.DELETE_CATEGORY: {
      const { type, id } = action.payload;
      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: state.categories[type].filter((c) => c.id !== id),
        },
      };
    }

    case ACTIONS.RESET_ALL: {
      return createInitialState(action.payload);
    }

    case ACTIONS.IMPORT_BACKUP: {
      return createInitialState(action.payload);
    }

    default:
      return state;
  }
}
