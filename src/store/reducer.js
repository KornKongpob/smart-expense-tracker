// src/store/reducer.js
import { ACTIONS } from "./actions";

// แปลงให้เป็น array แบบปลอดภัย (รองรับเคสเก็บเป็น object มาก่อน)
const toArray = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
};

const ensureCategories = (cats) => {
  const expense = toArray(cats?.expense);
  const income = toArray(cats?.income);
  return {
    expense: Array.isArray(expense) ? expense : [],
    income: Array.isArray(income) ? income : [],
  };
};

// fallback id generator (reducer ไม่ควร import utils เพิ่ม)
const rid = (prefix = "id") => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function createInitialState(boot = {}) {
  return {
    transactions: toArray(boot.transactions),
    accounts: toArray(boot.accounts),
    categories: ensureCategories(boot.categories || { expense: [], income: [] }),

    budgets: toArray(boot.budgets),
    recurring: toArray(boot.recurring),

    // ✅ ui ต้องมีเสมอ
    ui: {
      view: boot?.ui?.view || "dashboard",
      editingId: boot?.ui?.editingId || null,
    },
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.INIT: {
      return createInitialState(action.payload ?? {});
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
      const exists = state.transactions.some((t) => t?.id === tx?.id);

      const transactions = exists
        ? state.transactions.map((t) => (t.id === tx.id ? tx : t))
        : [...state.transactions, tx];

      return {
        ...state,
        transactions,
        ui: { ...state.ui, editingId: null, view: "dashboard" },
      };
    }

    // ✅ สำคัญ: รองรับ Scan Queue และ Transfer edit (สร้าง/แก้หลายรายการในครั้งเดียว)
    case ACTIONS.BULK_UPSERT_TRANSACTIONS: {
      const incoming = toArray(action.payload);

      const transactions = [...(state.transactions || [])];
      const indexById = new Map();
      transactions.forEach((t, idx) => indexById.set(t?.id, idx));

      for (const tx of incoming) {
        if (!tx) continue;
        const id = tx.id || rid("tx");
        const nextTx = { ...tx, id };

        const idx = indexById.get(id);
        if (idx != null) {
          transactions[idx] = nextTx;
        } else {
          indexById.set(id, transactions.length);
          transactions.push(nextTx);
        }
      }

      return {
        ...state,
        transactions,
        ui: { ...state.ui, editingId: null, view: "dashboard" },
      };
    }

    case ACTIONS.DELETE_TRANSACTION: {
      const id = action.payload;
      const transactions = (state.transactions || []).filter((t) => t?.id !== id);
      const editingId = state.ui.editingId === id ? null : state.ui.editingId;

      return {
        ...state,
        transactions,
        ui: { ...state.ui, editingId, view: "dashboard" },
      };
    }

    case ACTIONS.ADD_ACCOUNT: {
      return { ...state, accounts: [...(state.accounts || []), action.payload] };
    }

    case ACTIONS.UPDATE_ACCOUNT: {
      const updated = action.payload;
      return {
        ...state,
        accounts: (state.accounts || []).map((a) => (a?.id === updated?.id ? { ...a, ...updated } : a)),
      };
    }

    case ACTIONS.DELETE_ACCOUNT: {
      const id = action.payload;
      const accounts = (state.accounts || []).filter((a) => a?.id !== id);
      const transactions = (state.transactions || []).filter((t) => t?.accountId !== id);
      return { ...state, accounts, transactions };
    }

    case ACTIONS.ADD_CATEGORY: {
      const { type, category } = action.payload || {};
      if (!type || !category) return state;

      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: [...(state.categories?.[type] || []), category],
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
          [type]: (state.categories?.[type] || []).filter((c) => c?.id !== id),
        },
      };
    }

    // =======================
    // ✅ Budgets
    // =======================
    case ACTIONS.UPSERT_BUDGET: {
      const b = action.payload || {};
      if (!b.month || !b.categoryId) return state;

      const budgets = [...(state.budgets || [])];

      // match by id first, else by month+categoryId (กันกรณี id ไม่ส่งมา)
      let idx = b.id ? budgets.findIndex((x) => x?.id === b.id) : -1;
      if (idx < 0) idx = budgets.findIndex((x) => x?.month === b.month && x?.categoryId === b.categoryId);

      const next = { ...b, id: b.id || budgets[idx]?.id || rid("bud") };

      if (idx >= 0) budgets[idx] = { ...budgets[idx], ...next };
      else budgets.push(next);

      return { ...state, budgets };
    }

    case ACTIONS.DELETE_BUDGET: {
      const id = action.payload;
      const budgets = (state.budgets || []).filter((b) => b?.id !== id);
      return { ...state, budgets };
    }

    // =======================
    // ✅ Recurring
    // =======================
    case ACTIONS.UPSERT_RECURRING: {
      const r = action.payload || {};
      const recurring = [...(state.recurring || [])];

      // match by id (ถ้าไม่มี id ให้สร้าง)
      const id = r.id || rid("rec");
      const idx = recurring.findIndex((x) => x?.id === id);

      const next = { ...r, id };

      if (idx >= 0) recurring[idx] = { ...recurring[idx], ...next };
      else recurring.push(next);

      return { ...state, recurring };
    }

    case ACTIONS.DELETE_RECURRING: {
      const id = action.payload;
      const recurring = (state.recurring || []).filter((r) => r?.id !== id);
      return { ...state, recurring };
    }

    // เผื่ออนาคต: สร้าง tx จาก recurring แบบ action เดียว
    case ACTIONS.APPLY_RECURRING_GENERATION: {
      const payload = action.payload || {};
      const newTransactions = toArray(payload.newTransactions);
      const updatedRecurring = toArray(payload.updatedRecurring);

      const transactions = [...(state.transactions || [])];
      const indexById = new Map();
      transactions.forEach((t, idx) => indexById.set(t?.id, idx));

      for (const tx of newTransactions) {
        if (!tx) continue;
        const id = tx.id || rid("tx");
        const nextTx = { ...tx, id };
        const idx = indexById.get(id);
        if (idx != null) transactions[idx] = nextTx;
        else {
          indexById.set(id, transactions.length);
          transactions.push(nextTx);
        }
      }

      const recurring = [...(state.recurring || [])];
      for (const r of updatedRecurring) {
        if (!r) continue;
        const id = r.id || rid("rec");
        const idx = recurring.findIndex((x) => x?.id === id);
        const next = { ...r, id };
        if (idx >= 0) recurring[idx] = { ...recurring[idx], ...next };
        else recurring.push(next);
      }

      return {
        ...state,
        transactions,
        recurring,
        ui: { ...state.ui, view: "dashboard", editingId: null },
      };
    }

    case ACTIONS.RESET_ALL:
    case ACTIONS.IMPORT_BACKUP: {
      return createInitialState(action.payload ?? {});
    }

    default:
      return state;
  }
}
