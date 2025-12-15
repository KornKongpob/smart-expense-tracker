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
      view: "dashboard", // dashboard | add | stats | accounts | categories | more
      editingId: null, // ถ้ามีค่า = edit mode
    },
  };
}

function upsertOne(list, tx) {
  const exists = list.some((t) => t.id === tx.id);
  return exists ? list.map((t) => (t.id === tx.id ? tx : t)) : [...list, tx];
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
      // กด + ต้องล้าง editingId เพื่อให้ Scan กลับมา
      return { ...state, ui: { ...state.ui, editingId: null, view: "add" } };
    }

    case ACTIONS.START_EDIT_TRANSACTION: {
      return { ...state, ui: { ...state.ui, editingId: action.payload, view: "add" } };
    }

    case ACTIONS.UPSERT_TRANSACTION: {
      const tx = action.payload;
      const nextTransactions = upsertOne(state.transactions, tx);

      return {
        ...state,
        transactions: nextTransactions,
        ui: { ...state.ui, editingId: null, view: "dashboard" },
      };
    }

    // ✅ Transfer: upsert ออก+เข้า เป็นชุด
    case ACTIONS.UPSERT_TRANSFER: {
      const { outTx, inTx } = action.payload;

      let next = state.transactions;
      next = upsertOne(next, outTx);
      next = upsertOne(next, inTx);

      return {
        ...state,
        transactions: next,
        ui: { ...state.ui, editingId: null, view: "dashboard" },
      };
    }

    case ACTIONS.DELETE_TRANSFER_GROUP: {
      const groupId = action.payload;
      const nextTransactions = state.transactions.filter((t) => t.transferGroupId !== groupId);

      // ถ้ากำลัง edit อยู่และเป็น transfer group เดียวกัน ให้เคลียร์
      const editingTx = state.transactions.find((t) => t.id === state.ui.editingId);
      const nextEditingId =
        editingTx?.transferGroupId && editingTx.transferGroupId === groupId ? null : state.ui.editingId;

      return {
        ...state,
        transactions: nextTransactions,
        ui: { ...state.ui, editingId: nextEditingId, view: "dashboard" },
      };
    }

    case ACTIONS.DELETE_TRANSACTION: {
      const id = action.payload;
      const target = state.transactions.find((t) => t.id === id);

      // ✅ ถ้าลบรายการ transfer ให้ลบทั้งชุด
      if (target?.isTransfer && target.transferGroupId) {
        const groupId = target.transferGroupId;
        const nextTransactions = state.transactions.filter((t) => t.transferGroupId !== groupId);
        const editingId = state.ui.editingId === id ? null : state.ui.editingId;

        return {
          ...state,
          transactions: nextTransactions,
          ui: { ...state.ui, editingId, view: "dashboard" },
        };
      }

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

    case ACTIONS.DELETE_ACCOUNT: {
      const id = action.payload;

      // ✅ ลบ transaction ของ account นี้
      const removedTxs = state.transactions.filter((t) => t.accountId === id);

      // ✅ ถ้ามี transfer ที่ฝั่งหนึ่งถูกลบ -> ต้องลบทั้ง group เพื่อไม่ให้ค้างครึ่งเดียว
      const removedGroups = new Set(
        removedTxs.filter((t) => t.isTransfer && t.transferGroupId).map((t) => t.transferGroupId)
      );

      let nextTransactions = state.transactions.filter((t) => t.accountId !== id);
      if (removedGroups.size) {
        nextTransactions = nextTransactions.filter((t) => !removedGroups.has(t.transferGroupId));
      }

      const nextAccounts = state.accounts.filter((a) => a.id !== id);

      return {
        ...state,
        accounts: nextAccounts,
        transactions: nextTransactions,
        ui: { ...state.ui, view: "accounts" },
      };
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
