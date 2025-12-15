// src/store/reducer.js

import { ACTIONS } from "./actions";
import { generateId } from "../utils/id";

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
      const exists = state.transactions.some((t) => t.id === tx.id);

      const nextTransactions = exists
        ? state.transactions.map((t) => (t.id === tx.id ? tx : t))
        : [...state.transactions, { ...tx, id: tx.id || generateId() }];

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
      // ✅ FIX: กันพังจาก view ที่ส่งมาไม่มี id
      const a = action.payload || {};
      const next = {
        id: a.id || generateId(),
        name: (a.name || "").trim() || "บัญชีใหม่",
        type: a.type || "cash",
        color: a.color || "#1DD1A1",
      };

      return { ...state, accounts: [...state.accounts, next] };
    }

    case ACTIONS.DELETE_ACCOUNT: {
      const id = action.payload;

      // ✅ Guard: ต้องมีอย่างน้อย 1 บัญชี
      if (state.accounts.length <= 1) return state;

      const nextAccounts = state.accounts.filter((a) => a.id !== id);

      // ✅ FIX: ลบ transaction ที่เกี่ยวข้องทั้งหมด
      // - ลบรายการที่ accountId ตรงกับบัญชีที่ลบ
      // - ถ้าเป็น transfer และมี transferId ให้ลบ “ทั้งคู่” ของ transfer ด้วย
      const transferIdsInvolvingThisAccount = new Set(
        state.transactions
          .filter(
            (t) =>
              t?.isTransfer === true &&
              (t.accountId === id || t.fromAccountId === id || t.toAccountId === id)
          )
          .map((t) => t.transferId)
          .filter(Boolean)
      );

      const nextTransactions = state.transactions.filter((t) => {
        if (!t) return false;

        // รายการที่ผูกกับบัญชีนี้โดยตรง
        if (t.accountId === id) return false;

        // เผื่อโครงสร้าง transfer แบบเก็บ from/to ใน record เดียว
        if (t.fromAccountId === id || t.toAccountId === id) return false;

        // ถ้า transferId อยู่ในชุดที่เกี่ยวข้องกับบัญชีนี้ -> ลบทั้งคู่
        if (t.isTransfer && t.transferId && transferIdsInvolvingThisAccount.has(t.transferId))
          return false;

        return true;
      });

      // ✅ ถ้ากำลังแก้ไข transaction ที่โดนลบไปแล้ว ให้เคลียร์
      const editingId = state.ui.editingId;
      const stillExists = nextTransactions.some((t) => t.id === editingId);
      const nextEditingId = stillExists ? editingId : null;

      return {
        ...state,
        accounts: nextAccounts,
        transactions: nextTransactions,
        ui: { ...state.ui, editingId: nextEditingId },
      };
    }

    case ACTIONS.ADD_CATEGORY: {
      const { type, category } = action.payload; // type: expense|income
      const c = category || {};

      const next = {
        id: c.id || generateId(),
        name: (c.name || "").trim() || "หมวดใหม่",
        icon: c.icon || "🏷️",
        color: c.color || "#C8D6E5",
      };

      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: [...state.categories[type], next],
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
