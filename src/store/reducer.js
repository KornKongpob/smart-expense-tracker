// src/store/reducer.js
/**
 * Reducer (pure) สำหรับจัดการ state transitions
 * เป้าหมาย:
 * 1) สอดคล้องกับ src/store/store.jsx และ ACTIONS ทั้งหมด
 * 2) รองรับ payload หลายรูปแบบแบบปลอดภัย (กัน state พังจากข้อมูลเก่า/backup)
 * 3) รองรับ BULK_UPSERT_TRANSACTIONS (scan queue / transfer) และ APPLY_RECURRING_GENERATION
 *
 * IMPORTANT: ไฟล์นี้ “ไม่ควร” ไปยุ่งกับ UI/Glassmorphism โดยตรง (เป็นเรื่องของ components/css)
 */

import { ACTIONS } from "./actions";

// -------------------------
// Helpers (pure / safe)
// -------------------------
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

const toArray = (v) => {
  if (Array.isArray(v)) return v;
  if (isObj(v)) return Object.values(v);
  return [];
};

const ensureCategories = (cats) => {
  const c = isObj(cats) ? cats : {};
  const expense = toArray(c.expense).filter(Boolean);
  const income = toArray(c.income).filter(Boolean);
  return { expense, income };
};

const rid = (prefix = "id") => {
  try {
    // modern browsers
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    // ignore
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

function upsertById(list, item, { idKey = "id" } = {}) {
  const arr = toArray(list);
  const id = item?.[idKey];
  if (!id) return arr;

  const idx = arr.findIndex((x) => x?.[idKey] === id);
  if (idx >= 0) {
    const next = arr.slice();
    next[idx] = item;
    return next;
  }
  return [...arr, item];
}

function bulkUpsertById(list, items, { idKey = "id" } = {}) {
  const base = toArray(list).slice();
  const incoming = toArray(items);

  const indexById = new Map();
  base.forEach((x, i) => indexById.set(x?.[idKey], i));

  for (const it of incoming) {
    if (!it) continue;
    const id = it?.[idKey] || rid(idKey);
    const nextItem = { ...it, [idKey]: id };

    const idx = indexById.get(id);
    if (idx != null && idx >= 0) {
      base[idx] = nextItem;
    } else {
      indexById.set(id, base.length);
      base.push(nextItem);
    }
  }

  return base;
}

// -------------------------
// Initial State
// -------------------------
export function createInitialState(boot = {}) {
  const b = isObj(boot) ? boot : {};

  return {
    transactions: toArray(b.transactions),
    accounts: toArray(b.accounts),
    categories: ensureCategories(b.categories || { expense: [], income: [] }),

    budgets: toArray(b.budgets),
    recurring: toArray(b.recurring),

    ui: {
      view: b?.ui?.view || "dashboard",
      editingId: b?.ui?.editingId || null,
    },
  };
}

// -------------------------
// Reducer
// -------------------------
export function reducer(state, action) {
  const s = isObj(state) ? state : createInitialState({});
  const a = isObj(action) ? action : { type: "__UNKNOWN__" };

  switch (a.type) {
    // boot / navigation
    case ACTIONS.INIT: {
      return createInitialState(a.payload ?? {});
    }

    case ACTIONS.NAVIGATE: {
      return { ...s, ui: { ...s.ui, view: a.payload } };
    }

    // transactions
    case ACTIONS.START_NEW_TRANSACTION: {
      return { ...s, ui: { ...s.ui, editingId: null, view: "add" } };
    }

    case ACTIONS.START_EDIT_TRANSACTION: {
      return { ...s, ui: { ...s.ui, editingId: a.payload, view: "add" } };
    }

    case ACTIONS.UPSERT_TRANSACTION: {
      const tx0 = a.payload || {};
      const id = tx0?.id || rid("tx");

      const tx = { ...tx0, id };
      const transactions = upsertById(s.transactions, tx);

      return {
        ...s,
        transactions,
        ui: { ...s.ui, editingId: null, view: "dashboard" },
      };
    }

    /**
     * ✅ สำคัญ: รองรับ Scan Queue / Transfer edit
     * store.jsx ส่ง meta: { navigateToDashboard }
     */
    case ACTIONS.BULK_UPSERT_TRANSACTIONS: {
      const incoming = a.payload;
      const transactions = bulkUpsertById(s.transactions, incoming);

      const navigateToDashboard = a?.meta?.navigateToDashboard !== false;

      return {
        ...s,
        transactions,
        ui: navigateToDashboard ? { ...s.ui, editingId: null, view: "dashboard" } : s.ui,
      };
    }

    case ACTIONS.DELETE_TRANSACTION: {
      const id = a.payload;
      const transactions = toArray(s.transactions).filter((t) => t?.id !== id);

      const editingId = s?.ui?.editingId === id ? null : s?.ui?.editingId;

      return {
        ...s,
        transactions,
        ui: { ...s.ui, editingId, view: "dashboard" },
      };
    }

    case ACTIONS.DELETE_MANY_TRANSACTIONS: {
      const ids = Array.isArray(a.payload) ? a.payload.map(String) : [];
      if (!ids.length) return s;

      const idSet = new Set(ids);
      const transactions = toArray(s.transactions).filter((t) => !idSet.has(String(t?.id || "")));
      const editingId = idSet.has(String(s?.ui?.editingId || "")) ? null : s?.ui?.editingId;

      const navigateToDashboard = a?.meta?.navigateToDashboard !== false;
      return {
        ...s,
        transactions,
        ui: navigateToDashboard ? { ...s.ui, editingId, view: "dashboard" } : { ...s.ui, editingId },
      };
    }

    // accounts
    case ACTIONS.ADD_ACCOUNT: {
      const acc0 = a.payload || {};
      const id = acc0?.id || rid("acc");
      const account = { ...acc0, id };

      return { ...s, accounts: [...toArray(s.accounts), account] };
    }

    case ACTIONS.UPDATE_ACCOUNT: {
      const updated = a.payload || {};
      if (!updated?.id) return s;

      const accounts = toArray(s.accounts).map((x) => (x?.id === updated.id ? { ...x, ...updated } : x));
      return { ...s, accounts };
    }

    case ACTIONS.DELETE_ACCOUNT: {
      const id = a.payload;

      const accounts = toArray(s.accounts).filter((x) => x?.id !== id);

      const txsAll = toArray(s.transactions);
      const idsToDelete = new Set();
      const transferIdsToDelete = new Set();

      const isTransferLike = (t) => {
        const trId = String(t?.transferId || "").trim();
        const cat = String(t?.category || "").trim().toLowerCase();
        return !!t?.isTransfer || !!trId || cat === "transfer";
      };

      for (const t of txsAll) {
        if (String(t?.accountId || "").trim() !== String(id || "").trim()) continue;
        const tid = String(t?.id || "").trim();
        if (tid) idsToDelete.add(tid);
        if (isTransferLike(t)) {
          const trId = String(t?.transferId || "").trim();
          if (trId) transferIdsToDelete.add(trId);
        }
      }

      if (transferIdsToDelete.size) {
        for (const t of txsAll) {
          if (!isTransferLike(t)) continue;
          const trId = String(t?.transferId || "").trim();
          if (!trId || !transferIdsToDelete.has(trId)) continue;
          const tid = String(t?.id || "").trim();
          if (tid) idsToDelete.add(tid);
        }
      }

      const transactions = idsToDelete.size
        ? txsAll.filter((t) => !idsToDelete.has(String(t?.id || "").trim()))
        : txsAll;

      // keep recurring/inbox usable by pointing to a fallback account
      const fallbackAccountId = accounts?.[0]?.id || "";
      const recurring = toArray(s.recurring).map((r) =>
        String(r?.accountId || "").trim() === String(id || "").trim() ? { ...r, accountId: fallbackAccountId } : r
      );
      const inbox = toArray(s.inbox).map((it) =>
        String(it?.accountId || "").trim() === String(id || "").trim() ? { ...it, accountId: fallbackAccountId } : it
      );
      const scanInbox = toArray(s.scanInbox).map((it) =>
        String(it?.accountId || "").trim() === String(id || "").trim() ? { ...it, accountId: fallbackAccountId } : it
      );

      const editingId = String(s?.ui?.editingId || "").trim();
      const editingDeleted = editingId && idsToDelete.has(editingId);

      return {
        ...s,
        accounts,
        transactions,
        recurring,
        inbox,
        scanInbox,
        ui: editingDeleted ? { ...s.ui, editingId: null, view: "dashboard" } : s.ui,
      };
    }

    // categories
    case ACTIONS.ADD_CATEGORY: {
      const type = a?.payload?.type;
      const category0 = a?.payload?.category;

      if (!type || !category0) return s;

      const category = {
        ...category0,
        id: category0?.id || rid("cat"),
        // ✅ active by default (tombstone uses deletedAt)
        deletedAt: null,
        isDeleted: false,
      };

      const nextCats = ensureCategories(s.categories);
      const list = toArray(nextCats[type]);
      const exists = list.some((c) => c?.id === category.id);
      const nextList = exists
        ? list.map((c) => (c?.id === category.id ? { ...c, ...category } : c))
        : [...list, category];

      return {
        ...s,
        categories: {
          ...nextCats,
          [type]: nextList,
        },
      };
    }

    case ACTIONS.DELETE_CATEGORY: {
      const type = a?.payload?.type;
      const id = a?.payload?.id;

      if (!type || !id) return s;

      const nextCats = ensureCategories(s.categories);
      return {
        ...s,
        categories: {
          ...nextCats,
          // ✅ tombstone (keep for historical reports)
          [type]: toArray(nextCats[type]).map((c) =>
            c?.id === id
              ? {
                  ...c,
                  deletedAt: c?.deletedAt || Date.now(),
                  isDeleted: true,
                }
              : c
          ),
        },
      };
    }

    // budgets
    case ACTIONS.UPSERT_BUDGET: {
      const b0 = a.payload || {};
      const id = b0?.id || rid("bud");

      // match by month+categoryId if exists (กัน id ไม่ส่ง)
      const budgets = toArray(s.budgets).slice();
      const idx =
        budgets.findIndex((x) => x?.id === id) >= 0
          ? budgets.findIndex((x) => x?.id === id)
          : budgets.findIndex((x) => x?.month === b0?.month && x?.categoryId === b0?.categoryId);

      const next = { ...b0, id: budgets[idx]?.id || id };

      if (idx >= 0) budgets[idx] = { ...budgets[idx], ...next };
      else budgets.push(next);

      return { ...s, budgets };
    }

    case ACTIONS.DELETE_BUDGET: {
      const id = a.payload;
      const budgets = toArray(s.budgets).filter((b) => b?.id !== id);
      return { ...s, budgets };
    }

    // recurring
    case ACTIONS.UPSERT_RECURRING: {
      const r0 = a.payload || {};
      const id = r0?.id || rid("rec");

      const recurring = upsertById(toArray(s.recurring), { ...r0, id });
      return { ...s, recurring };
    }

    case ACTIONS.DELETE_RECURRING: {
      const id = a.payload;
      const recurring = toArray(s.recurring).filter((r) => r?.id !== id);
      return { ...s, recurring };
    }

    /**
     * ✅ ให้สอดคล้องกับ store.jsx:
     * dispatch({ type: APPLY_RECURRING_GENERATION, payload: { transactions: created, recurring: nextRecurring } })
     */
    case ACTIONS.APPLY_RECURRING_GENERATION: {
      const txs = a?.payload?.transactions;
      const nextRecurring = a?.payload?.recurring;

      const transactions = bulkUpsertById(s.transactions, txs);
      const recurring = bulkUpsertById(s.recurring, nextRecurring);

      return {
        ...s,
        transactions,
        recurring,
        ui: { ...s.ui, view: "dashboard", editingId: null },
      };
    }

    // reset/import
    case ACTIONS.RESET_ALL:
    case ACTIONS.IMPORT_BACKUP: {
      return createInitialState(a.payload ?? {});
    }

    default:
      return s;
  }
}
