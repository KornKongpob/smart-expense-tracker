/**
 * Store runtime module: Context provider, persistence wiring, and action creators.
 * This module contains the single reducer/initial-state implementation and exports runtime store APIs.
 */
// src/store/store.jsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

import { ACTIONS } from "./actions";
import {
  DEFAULT_ACCOUNTS,
  clampInt,
  createInitialState,
  normalizeAccount,
  normalizeCanonicalTransactionTime,
  normalizeInboxItem,
  normalizeRule,
  normalizeRules,
  safeSatang,
  sanitizeHierarchyOneLevel,
} from "./boot.js";

import { loadAll, saveAll, clearAll } from "../services/storage";
import { setHash } from "../utils/hashRouter";
import { clearAllBlobs, deleteBlob } from "../services/blobStore";
import { DEFAULT_CATEGORIES } from "../constants/categories";
import { generateId } from "../utils/id";
import { normalizeBackupCore } from "../utils/backupPayload.js";
import { calcAccountBalance, parseDateSafe } from "./selectors";
import { toISODate } from "../utils/format";
import { advanceRecurringDate, getRecurringAnchorDay } from "../utils/recurring";
import { resolveMoneyUnit } from "../utils/moneyUnit.js";
import {
  normalizeMerchants,
  normalizeMerchantEntry,
  mergeMerchantEntries,
  learnMerchantMapping,
  normalizeMerchantKey,
} from "../utils/merchantDictionary";
import { normalizeNewEntryIntent } from "../views/add-transaction/helpers/entryIntent.js";

const ONBOARDING_KEY = "onboarding_done_v1";
const PIN_KEY = "privacy_pin_6";
const RESET_ALL_EVENT = "app:after-reset-all";

const AppStoreContext = createContext(null);
export { createInitialState } from "./boot.js";

const slugifyId = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-ก-๙]/g, "")
    .slice(0, 40);

// ---------- reducer helpers ----------
function upsertById(list, item) {
  const id = item?.id;
  if (!id) return list;
  const exists = list.some((x) => x?.id === id);
  return exists ? list.map((x) => (x?.id === id ? item : x)) : [...list, item];
}

function bulkUpsertTx(list, txs) {
  let next = list.slice();
  for (const tx of txs || []) {
    if (!tx?.id) continue;
    const i = next.findIndex((t) => t.id === tx.id);
    if (i >= 0) next[i] = tx;
    else next.push(tx);
  }
  return next;
}

// ---------- merchant helpers ----------
function rewriteMerchantValue(val, aliasKeySet, targetCanonical) {
  const key = normalizeMerchantKey(val);
  if (!key) return val;
  if (!aliasKeySet.has(key)) return val;
  return targetCanonical;
}

function rewriteMerchantAcrossTransactions(transactions, aliasKeySet, targetCanonical) {
  const list = Array.isArray(transactions) ? transactions : [];
  let changed = false;
  const next = list.map((t) => {
    const before = String(t?.merchant || "");
    const after = rewriteMerchantValue(before, aliasKeySet, targetCanonical);
    if (after !== before) {
      changed = true;
      return { ...t, merchant: after };
    }
    return t;
  });
  return changed ? next : list;
}

function rewriteMerchantAcrossInbox(inbox, aliasKeySet, targetCanonical) {
  const list = Array.isArray(inbox) ? inbox : [];
  let changed = false;
  const next = list.map((it) => {
    const before = String(it?.merchant || "");
    const after = rewriteMerchantValue(before, aliasKeySet, targetCanonical);
    if (after !== before) {
      changed = true;
      return normalizeInboxItem({ ...it, merchant: after });
    }
    return it;
  });
  return changed ? next : list;
}

// ---------- recurring generation ----------
// ✅ Safety cap per run (prevents accidental backfill flood)
// NOTE: we still allow users to run multiple times; UI will warn when truncated.
const MAX_RECURRING_CREATE_PER_RUN = 200;

function generateDueTransactionsForRecurring(r, todayISO) {
  if (!r?.enabled) return { txs: [], nextRecurring: r };

  const today = parseDateSafe(todayISO);
  const start = parseDateSafe(r.startDate || todayISO);
  const anchorDay = getRecurringAnchorDay(r);

  let nextDue = r.lastGenerated
    ? advanceRecurringDate(parseDateSafe(r.lastGenerated), r.frequency, r.interval, anchorDay)
    : start;

  if (nextDue.getTime() > today.getTime()) return { txs: [], nextRecurring: r };

  const txs = [];
  let lastGenDate = r.lastGenerated ? parseDateSafe(r.lastGenerated) : null;

  let truncated = false;
  let nextDueISO = null;

  let safety = 0;
  while (nextDue.getTime() <= today.getTime()) {
    safety += 1;
    // Safety cap: prevent huge accidental backfills from flooding the UI
    if (safety > MAX_RECURRING_CREATE_PER_RUN) {
      truncated = true;
      nextDueISO = toISODate(nextDue);
      break;
    }

    const iso = toISODate(nextDue);

    txs.push({
      id: `rec_${r.id}_${iso}`,
      type: r.type === "income" ? "income" : "expense",
      amount: safeSatang(r.amount, 0),
      category: r.categoryId,
      accountId: r.accountId,
      date: iso,
      note: String(r.note || "Recurring").trim() || "Recurring",
      isTransfer: false,
      transferId: null,
      ref: null,
      source: "recurring",
      meta: { kind: "recurring", recurringId: r.id || null, dueDate: iso },
    });

    lastGenDate = nextDue;
    nextDue = advanceRecurringDate(nextDue, r.frequency, r.interval, anchorDay);
  }

  // If we didn't hit cap but there is still something due (edge-case), keep nextDueISO
  if (!nextDueISO && nextDue?.getTime?.() <= today.getTime()) nextDueISO = toISODate(nextDue);

  const nextRecurring = {
    ...r,
    lastGenerated: lastGenDate ? toISODate(lastGenDate) : r.lastGenerated || null,
  };

  return { txs, nextRecurring, truncated, nextDueISO, cap: MAX_RECURRING_CREATE_PER_RUN };
}

// ---------- reducer ----------
export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.INIT: {
      return createInitialState(action.payload ?? {});
    }

    case ACTIONS.NAVIGATE: {
      return { ...state, ui: { ...state.ui, view: action.payload } };
    }

    case ACTIONS.START_NEW_TRANSACTION: {
      return {
        ...state,
        ui: {
          ...state.ui,
          editingId: null,
          view: "add",
          newEntryIntent: normalizeNewEntryIntent(action.payload),
        },
      };
    }

    case ACTIONS.CONSUME_NEW_TRANSACTION_INTENT: {
      if (!state?.ui?.newEntryIntent) return state;
      return {
        ...state,
        ui: { ...state.ui, newEntryIntent: null },
      };
    }

    case ACTIONS.START_EDIT_TRANSACTION: {
      return { ...state, ui: { ...state.ui, editingId: action.payload, view: "add" } };
    }

    case ACTIONS.UPSERT_TRANSACTION: {
      const tx = action.payload;
      const transactions = upsertById(state.transactions, tx);
      return {
        ...state,
        transactions,
        ui: { ...state.ui, editingId: null, view: "dashboard" },
      };
    }

    case ACTIONS.BULK_UPSERT_TRANSACTIONS: {
      const txs = Array.isArray(action.payload) ? action.payload : [];
      const transactions = bulkUpsertTx(state.transactions, txs);

      const navigateToDashboard = action?.meta?.navigateToDashboard !== false;
      return {
        ...state,
        transactions,
        ui: navigateToDashboard ? { ...state.ui, editingId: null, view: "dashboard" } : state.ui,
      };
    }

    case ACTIONS.DELETE_TRANSACTION: {
      const id = action.payload;
      const transactions = state.transactions.filter((t) => t.id !== id);
      const editingId = state.ui.editingId === id ? null : state.ui.editingId;
      return {
        ...state,
        transactions,
        ui: { ...state.ui, editingId, view: "dashboard" },
      };
    }

    case ACTIONS.DELETE_MANY_TRANSACTIONS: {
      const ids = Array.isArray(action.payload) ? action.payload : [];
      const delSet = new Set(ids.map((x) => String(x || "")).filter(Boolean));
      if (!delSet.size) return state;

      const transactions = (state.transactions || []).filter((t) => !delSet.has(String(t?.id || "")));
      const editingId = delSet.has(String(state.ui.editingId || "")) ? null : state.ui.editingId;

      const navigateToDashboard = action?.meta?.navigateToDashboard !== false;
      return {
        ...state,
        transactions,
        ui: navigateToDashboard ? { ...state.ui, editingId, view: "dashboard" } : { ...state.ui, editingId },
      };
    }

    case ACTIONS.ADD_ACCOUNT: {
      return { ...state, accounts: [...state.accounts, normalizeAccount(action.payload)] };
    }

    case ACTIONS.UPDATE_ACCOUNT: {
      const updated = action.payload;
      if (!updated?.id) return state;
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === updated.id ? normalizeAccount({ ...a, ...updated }) : a)),
      };
    }

    case ACTIONS.DELETE_ACCOUNT: {
      const payload = action.payload;
      const id = typeof payload === "string" ? payload : payload?.id;
      if (!id) return state;

      const accounts = (state.accounts || []).filter((a) => a.id !== id);

      // ✅ Cascade delete transactions belonging to this account
      let cascadeTxIds = Array.isArray(payload?.cascadeTxIds) ? payload.cascadeTxIds : null;
      if (!cascadeTxIds) {
        const txs = Array.isArray(state.transactions) ? state.transactions : [];
        const idsToDelete = new Set();
        const transferIdsToDelete = new Set();

        const isTransferLikeTx = (t) => {
          if (!t) return false;
          if (t.isTransfer) return true;
          const tid = String(t.transferId || "").trim();
          if (tid) return true;
          const c = String(t.category || "").toLowerCase().trim();
          return c === "transfer";
        };

        for (const t of txs) {
          if (String(t?.accountId || "").trim() !== String(id)) continue;
          const tid = String(t?.id || "").trim();
          if (tid) idsToDelete.add(tid);
          if (isTransferLikeTx(t)) {
            const trId = String(t?.transferId || "").trim();
            if (trId) transferIdsToDelete.add(trId);
          }
        }

        if (transferIdsToDelete.size) {
          for (const t of txs) {
            if (!isTransferLikeTx(t)) continue;
            const trId = String(t?.transferId || "").trim();
            if (!trId || !transferIdsToDelete.has(trId)) continue;
            const tid = String(t?.id || "").trim();
            if (tid) idsToDelete.add(tid);
          }
        }

        cascadeTxIds = Array.from(idsToDelete);
      }

      const delSet = new Set((cascadeTxIds || []).map((x) => String(x || "")).filter(Boolean));
      const transactions = delSet.size ? (state.transactions || []).filter((t) => !delSet.has(String(t?.id || ""))) : state.transactions;

      // ✅ Prevent orphan references in other data sources (fallback to first remaining account)
      const fallbackAccountId = String(accounts?.[0]?.id || "");

      const recurring = (state.recurring || []).map((r) =>
        String(r?.accountId || "") === String(id) ? { ...r, accountId: fallbackAccountId } : r
      );

      const replaceInboxAccount = (currentId, counterpartId) => {
        if (String(currentId || "") !== String(id)) return String(currentId || "");
        if (!fallbackAccountId) return "";
        return String(counterpartId || "") === fallbackAccountId ? "" : fallbackAccountId;
      };

      const patchInboxAccount = (it) => {
        if (!it) return it;
        const next = { ...it };
        const txType = String(next.type || next.txType || "").toLowerCase().trim();

        if (txType === "transfer" || txType === "credit_payment") {
          next.fromAccountId = replaceInboxAccount(next.fromAccountId, next.toAccountId);
          next.toAccountId = replaceInboxAccount(next.toAccountId, next.fromAccountId);
          if (String(next.accountId || "") === String(id)) {
            next.accountId = String(next.fromAccountId || next.toAccountId || "");
          }
          return normalizeInboxItem(next);
        }

        if (String(next.accountId || "") === String(id)) next.accountId = fallbackAccountId;
        return normalizeInboxItem(next);
      };
      const inbox = (state.inbox || []).map(patchInboxAccount);

      const editingId = delSet.has(String(state.ui.editingId || "")) ? null : state.ui.editingId;
      const view = delSet.has(String(state.ui.editingId || "")) ? "dashboard" : state.ui.view;

      return {
        ...state,
        accounts,
        transactions,
        recurring,
        inbox,
        scanInbox: inbox,
        ui: { ...state.ui, editingId, view },
      };
    }

    case ACTIONS.ADD_CATEGORY: {
      const { type, category } = action.payload || {};
      if (!type || !category) return state;
      if (type !== "expense" && type !== "income") return state;

      const now = Date.now();
      const list = state.categories[type] || [];

      const id = String(category?.id || "").trim();
      if (!id) return state;

      // --- normalize parentId (1-level) ---
      const byId = new Map();
      for (const c of list || []) {
        const cid = String(c?.id || "").trim();
        if (cid) byId.set(cid, c);
      }

      let parentId = String(category?.parentId || "").trim();
      if (parentId === id) parentId = "";
      if (parentId && !byId.has(parentId)) parentId = "";
      if (parentId) {
        const p = byId.get(parentId);
        const ppid = String(p?.parentId || "").trim();
        const pDel = !!(p?.isDeleted || p?.deletedAt);
        if (ppid || pDel) parentId = ""; // prevent 3-level or deleted parent
      }

      // If this category is currently a parent of others, it must remain a main category.
      const hasChildren = (list || []).some((c) => String(c?.parentId || "").trim() === id && !(c?.isDeleted || c?.deletedAt));
      if (hasChildren) parentId = "";

      // ✅ Upsert by id, and ensure the category becomes active (not tombstoned)
      const cleaned = {
        ...category,
        id,
        parentId,
        deletedAt: null,
        isDeleted: false,
        updatedAt: now,
      };

      const exists = list.some((c) => String(c?.id || "") === id);
      const nextList = exists
        ? list.map((c) => (String(c?.id || "") === id ? { ...c, ...cleaned } : c))
        : [...list, cleaned];

      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: sanitizeHierarchyOneLevel(nextList),
        },
      };
    }

    case ACTIONS.DELETE_CATEGORY: {
      const { type, id } = action.payload || {};
      if (!type || !id) return state;
      if (type !== "expense" && type !== "income") return state;

      const now = Date.now();
      const list = state.categories[type] || [];
      const targetId = String(id).trim();
      if (!targetId) return state;

      // Cascade tombstone: delete category + all descendants
      const childrenByParent = new Map();
      for (const c of list || []) {
        const pid = String(c?.parentId || "").trim();
        const cid = String(c?.id || "").trim();
        if (!pid || !cid) continue;
        const arr = childrenByParent.get(pid) || [];
        arr.push(cid);
        childrenByParent.set(pid, arr);
      }

      const idsToDelete = new Set();
      const q = [targetId];
      while (q.length) {
        const cur = q.shift();
        if (!cur || idsToDelete.has(cur)) continue;
        idsToDelete.add(cur);
        const kids = childrenByParent.get(cur) || [];
        for (const kid of kids) {
          if (!idsToDelete.has(kid)) q.push(kid);
        }
      }

      let changed = false;
      const nextList = list.map((c) => {
        const cid = String(c?.id || "").trim();
        if (!idsToDelete.has(cid)) return c;
        if (c?.isDeleted || c?.deletedAt) {
          // already tombstoned, but keep updatedAt fresh so UI refreshes
          return { ...c, updatedAt: now };
        }
        changed = true;
        return {
          ...c,
          isDeleted: true,
          deletedAt: c?.deletedAt || now,
          updatedAt: now,
        };
      });

      if (!changed) return state;

      return {
        ...state,
        categories: {
          ...state.categories,
          [type]: sanitizeHierarchyOneLevel(nextList),
        },
      };
    }


    // ----- budgets -----
    case ACTIONS.UPSERT_BUDGET: {
      const b = action.payload || {};
      const id = b.id || generateId();

      const existsSameKey = (state.budgets || []).find((x) => x?.month === b.month && x?.categoryId === b.categoryId);
      const finalId = existsSameKey?.id || id;

      const nextBudget = {
        id: finalId,
        month: String(b.month || ""),
        categoryId: String(b.categoryId || ""),
        limit: safeSatang(b.limit, 0),
        alertPct: clampInt(b.alertPct, 1, 100, 90),
      };

      const budgets = upsertById(state.budgets || [], nextBudget);
      return { ...state, budgets };
    }

    case ACTIONS.DELETE_BUDGET: {
      const id = action.payload;
      const budgets = (state.budgets || []).filter((b) => b.id !== id);
      return { ...state, budgets };
    }

    // ----- recurring -----
    case ACTIONS.UPSERT_RECURRING: {
      const r = action.payload || {};
      const id = r.id || generateId();

      const nextRecurring = {
        id,
        enabled: r.enabled !== false,
        type: r.type === "income" ? "income" : "expense",
        amount: safeSatang(r.amount, 0),
        categoryId: String(r.categoryId || ""),
        accountId: String(r.accountId || ""),
        note: String(r.note || "Recurring").trim() || "Recurring",
        startDate: String(r.startDate || toISODate(new Date())).slice(0, 10),
        frequency: r.frequency === "weekly" ? "weekly" : "monthly",
        interval: clampInt(r.interval, 1, 120, 1),
        lastGenerated: r.lastGenerated ? String(r.lastGenerated).slice(0, 10) : null,
      };

      const recurring = upsertById(state.recurring || [], nextRecurring);
      return { ...state, recurring };
    }

    case ACTIONS.DELETE_RECURRING: {
      const id = action.payload;
      const recurring = (state.recurring || []).filter((r) => r.id !== id);
      return { ...state, recurring };
    }

    case ACTIONS.APPLY_RECURRING_GENERATION: {
      const txs = action.payload?.transactions || [];
      const nextRecurring = action.payload?.recurring || state.recurring;
      const transactions = bulkUpsertTx(state.transactions, txs);
      return { ...state, transactions, recurring: nextRecurring };
    }


    // ----- automation rules -----
    case ACTIONS.RULE_UPSERT: {
      const incoming = action.payload || {};
      const nextRule = normalizeRule(incoming, (state.rules || []).length + 1);
      const rules = normalizeRules(upsertById(state.rules || [], nextRule));
      return { ...state, rules };
    }

    case ACTIONS.RULE_UPDATE: {
      const { id, patch } = action.payload || {};
      if (!id) return state;
      const existing = (state.rules || []).find((r) => String(r?.id) === String(id));
      if (!existing) return state;
      const merged = { ...existing, ...(patch || {}), id: existing.id };
      const nextRule = normalizeRule(merged, existing.priority || 9999);
      const rules = normalizeRules(upsertById(state.rules || [], nextRule));
      return { ...state, rules };
    }

    case ACTIONS.RULE_DELETE: {
      const id = action.payload;
      const rules = normalizeRules((state.rules || []).filter((r) => String(r?.id) !== String(id)));
      return { ...state, rules };
    }

    case ACTIONS.RULE_SET_ORDER: {
      const next = Array.isArray(action.payload) ? action.payload : [];
      return { ...state, rules: normalizeRules(next) };
    }


    // ----- Smart Merchant Dictionary -----
    case ACTIONS.MERCHANT_UPSERT: {
      const incoming = action.payload || {};
      const nextEntry = normalizeMerchantEntry(incoming);
      const merchants = normalizeMerchants(upsertById(state.merchants || [], nextEntry));
      return { ...state, merchants };
    }

    case ACTIONS.MERCHANT_UPDATE: {
      const { id, patch } = action.payload || {};
      if (!id) return state;
      const list = Array.isArray(state.merchants) ? state.merchants : [];
      const existing = list.find((m) => String(m?.id) === String(id)) || null;
      if (!existing) return state;

      const beforeCanonical = String(existing.canonical || "");
      const merged = normalizeMerchantEntry({ ...existing, ...(patch || {}), id: existing.id });

      // If canonical changed, keep previous canonical as alias and rewrite existing data
      let finalEntry = merged;
      const afterCanonical = String(merged.canonical || "");
      if (afterCanonical && beforeCanonical && normalizeMerchantKey(afterCanonical) !== normalizeMerchantKey(beforeCanonical)) {
        const aliases = Array.isArray(merged.aliases) ? merged.aliases.slice() : [];
        aliases.push(beforeCanonical);
        finalEntry = normalizeMerchantEntry({ ...merged, aliases });
      }

      let merchants = normalizeMerchants(upsertById(list, finalEntry));

      // rewrite tx/inbox merchants if canonical changed
      let transactions = state.transactions;
      let inbox = state.inbox;
      if (afterCanonical && beforeCanonical && normalizeMerchantKey(afterCanonical) !== normalizeMerchantKey(beforeCanonical)) {
        const aliasKeySet = new Set([normalizeMerchantKey(beforeCanonical)].filter(Boolean));
        transactions = rewriteMerchantAcrossTransactions(state.transactions || [], aliasKeySet, afterCanonical);
        inbox = rewriteMerchantAcrossInbox(state.inbox || [], aliasKeySet, afterCanonical);
      }

      return { ...state, merchants, transactions, inbox, scanInbox: inbox };
    }

    case ACTIONS.MERCHANT_DELETE: {
      const id = action.payload;
      const merchants = normalizeMerchants((state.merchants || []).filter((m) => String(m?.id) !== String(id)));
      return { ...state, merchants };
    }

    case ACTIONS.MERCHANT_MERGE: {
      const { sourceId, targetId } = action.payload || {};
      if (!sourceId || !targetId) return state;
      if (String(sourceId) === String(targetId)) return state;
      const list = Array.isArray(state.merchants) ? state.merchants : [];
      const source = list.find((m) => String(m?.id) === String(sourceId)) || null;
      const target = list.find((m) => String(m?.id) === String(targetId)) || null;
      if (!source || !target) return state;

      const merged = mergeMerchantEntries(target, source);
      const mergedList = normalizeMerchants(
        list
          .filter((m) => String(m?.id) !== String(sourceId))
          .map((m) => (String(m?.id) === String(targetId) ? merged : m))
      );

      const aliasKeys = new Set(
        [source?.canonical, ...(Array.isArray(source?.aliases) ? source.aliases : [])]
          .map((x) => normalizeMerchantKey(x))
          .filter(Boolean)
      );

      const canonical = String(merged?.canonical || target?.canonical || "").trim();
      const transactions = canonical ? rewriteMerchantAcrossTransactions(state.transactions || [], aliasKeys, canonical) : state.transactions;
      const inbox = canonical ? rewriteMerchantAcrossInbox(state.inbox || [], aliasKeys, canonical) : state.inbox;

      return { ...state, merchants: mergedList, transactions, inbox, scanInbox: inbox };
    }

    case ACTIONS.MERCHANT_LEARN: {
      const sample = action.payload || {};
      const merchants = learnMerchantMapping(state.merchants || [], sample);
      return { ...state, merchants };
    }



    // ----- inbox (pending/approved) -----
    case ACTIONS.INBOX_UPSERT_MANY:
    case ACTIONS.SCAN_INBOX_ADD_MANY: {
      const items = Array.isArray(action.payload) ? action.payload : [];
      let inbox = state.inbox || [];
      for (const raw of items) {
        if (!raw) continue;
        const normalized = normalizeInboxItem(raw);
        inbox = upsertById(inbox, normalized);
      }
      // keep scanInbox in sync for backward compatibility
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_UPDATE_ONE: {
      const { id, patch } = action.payload || {};
      if (!id) return state;
      const inbox = (state.inbox || []).map((it) => (it?.id === id ? normalizeInboxItem({ ...it, ...patch, id }) : it));
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_REMOVE_MANY: {
      const ids = Array.isArray(action.payload) ? action.payload : [];
      const idSet = new Set(ids.map(String));
      const inbox = (state.inbox || []).filter((it) => !idSet.has(String(it?.id)));
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.SCAN_INBOX_REMOVE: {
      const id = action.payload;
      const inbox = (state.inbox || []).filter((x) => String(x?.id) !== String(id));
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_CLEAR_APPROVED: {
      const inbox = (state.inbox || []).filter((it) => String(it?.status || '').toLowerCase() !== 'approved');
      return { ...state, inbox, scanInbox: inbox };
    }

    case ACTIONS.INBOX_CLEAR_ALL:
    case ACTIONS.SCAN_INBOX_CLEAR: {
      return { ...state, inbox: [], scanInbox: [] };
    }

// ----- reset/import -----
    case ACTIONS.RESET_ALL:
    case ACTIONS.IMPORT_BACKUP: {
      return createInitialState(action.payload ?? {});
    }

    default:
      return state;
  }
}

// ---------- provider ----------
export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const boot = loadAll({
      defaultAccounts: DEFAULT_ACCOUNTS,
      defaultCategories: DEFAULT_CATEGORIES,
      defaultBudgets: [],
      defaultRecurring: [],
      defaultMerchants: [],
      defaultRules: [],
      defaultInbox: [],
      defaultScanInbox: [],
      defaultUI: { view: "dashboard", editingId: null },
    });

    return createInitialState(boot);
  });

  // ✅ persist (include ui to keep view/editingId stable)
  useEffect(() => {
    saveAll({
      moneyUnit: resolveMoneyUnit(state.moneyUnit, "satang"),
      transactions: state.transactions,
      accounts: state.accounts,
      categories: state.categories,
      budgets: state.budgets,
      recurring: state.recurring,
      merchants: state.merchants,
      rules: state.rules,
      inbox: state.inbox,
      // backward compatibility
      scanInbox: state.inbox,
      ui: state.ui,
    });
  }, [
    state.transactions,
    state.accounts,
    state.categories,
    state.budgets,
    state.recurring,
    state.merchants,
    state.rules,
    state.inbox,
    state.ui,
    state.moneyUnit,
  ]);

  const getEditingTransaction = useMemo(() => {
    return () => {
      const id = state?.ui?.editingId;
      if (!id) return null;
      return state.transactions.find((t) => t.id === id) || null;
    };
  }, [state.transactions, state?.ui?.editingId]);

  const api = useMemo(() => {
    const navigate = (view) => {
      setHash(view);
      dispatch({ type: ACTIONS.NAVIGATE, payload: view });
    };

    const startNewTransaction = (intent = null) =>
      dispatch({ type: ACTIONS.START_NEW_TRANSACTION, payload: normalizeNewEntryIntent(intent) });
    const startNew = startNewTransaction;
    const consumeNewTransactionIntent = () => dispatch({ type: ACTIONS.CONSUME_NEW_TRANSACTION_INTENT });

    const startEditTransaction = (id) => dispatch({ type: ACTIONS.START_EDIT_TRANSACTION, payload: id });
    const startEdit = startEditTransaction;

    const upsertTransaction = (tx) => {
      const id = tx?.id || generateId();
      const amount = safeSatang(tx?.amount, 0);
      const date = tx?.date ? String(tx.date).slice(0, 10) : toISODate(new Date());

      const now = Date.now();
      const prev = (state.transactions || []).find((t) => t?.id === id) || null;
      const createdAt = Number(tx?.createdAt || prev?.createdAt || now);
      const time = normalizeCanonicalTransactionTime({ ...(prev || {}), ...(tx || {}) });

      const cleaned = {
        // ✅ preserve fields that the current form doesn't edit (e.g., merchant/evidence/attachment)
        ...(prev || {}),
        ...(tx || {}),
        id,
        amount,
        date,
        time,
        note: String(tx?.note || ""),
        createdAt,
        updatedAt: now,
        isTransfer: !!tx?.isTransfer,
      };

      dispatch({ type: ACTIONS.UPSERT_TRANSACTION, payload: cleaned });
    };

    const bulkUpsertTransactions = (txs, { navigateToDashboard = true } = {}) => {
      const list = Array.isArray(txs) ? txs : [];
      const now = Date.now();
      const prevById = new Map((state.transactions || []).map((t) => [String(t?.id || ""), t]));
      dispatch({
        type: ACTIONS.BULK_UPSERT_TRANSACTIONS,
        payload: list.map((tx) => {
          const id = tx?.id || generateId();
          const amount = safeSatang(tx?.amount, 0);
          const date = tx?.date ? String(tx.date).slice(0, 10) : toISODate(new Date());
          const prev = prevById.get(String(id)) || null;
          const createdAt = Number(tx?.createdAt || prev?.createdAt || now);
          const time = normalizeCanonicalTransactionTime({ ...(prev || {}), ...(tx || {}) });
          return {
            // ✅ preserve fields that the current form doesn't edit (e.g., merchant/evidence/attachment)
            ...(prev || {}),
            ...(tx || {}),
            id,
            amount,
            date,
            time,
            note: String(tx?.note || ""),
            createdAt,
            updatedAt: now,
            isTransfer: !!tx?.isTransfer,
          };
        }),
        meta: { navigateToDashboard },
      });
    };

    // ✅ Attachment cleanup (IndexedDB blobs)
    // When deleting transactions, also delete orphaned blobs to prevent storage leaks.
    const cleanupBlobsForTxIds = (ids) => {
      const txs = Array.isArray(state.transactions) ? state.transactions : [];
      const delSet = new Set((Array.isArray(ids) ? ids : []).map((x) => String(x || "")).filter(Boolean));
      if (!delSet.size) return;

      const attachmentIds = new Set();
      for (const t of txs) {
        const tid = String(t?.id || "");
        if (!tid || !delSet.has(tid)) continue;
        const aid = String(t?.attachmentId || "").trim();
        if (aid) attachmentIds.add(aid);
      }

      for (const aid of attachmentIds) {
        // Only delete if nothing else (outside of delSet) still references this blob.
        const stillUsed = txs.some(
          (t) => !delSet.has(String(t?.id || "")) && String(t?.attachmentId || "").trim() === aid
        );
        if (stillUsed) continue;
        try {
          void deleteBlob(aid);
        } catch {
          // ignore
        }
      }
    };

    const deleteTransaction = (id) => {
      const tid = String(id || "").trim();
      if (!tid) return;
      cleanupBlobsForTxIds([tid]);
      dispatch({ type: ACTIONS.DELETE_TRANSACTION, payload: tid });
    };

    const deleteManyTransactions = (ids, { navigateToDashboard = true } = {}) => {
      const list = Array.isArray(ids) ? ids.filter(Boolean).map((x) => String(x).trim()).filter(Boolean) : [];
      if (!list.length) return;
      const uniq = Array.from(new Set(list));
      cleanupBlobsForTxIds(uniq);
      dispatch({ type: ACTIONS.DELETE_MANY_TRANSACTIONS, payload: uniq, meta: { navigateToDashboard } });
    };

    const addAccount = (account) => {
      const next = normalizeAccount({
        ...account,
        id: account?.id || generateId(),
      });
      dispatch({ type: ACTIONS.ADD_ACCOUNT, payload: next });
    };

    const updateAccount = (partial) => {
      if (!partial?.id) return;
      dispatch({ type: ACTIONS.UPDATE_ACCOUNT, payload: partial });
    };

    // ✅ Cascade delete (Option B): delete the account AND all transactions belonging to it.
    // Also delete the counterpart legs for transfers, to avoid leaving a one-sided transfer.
    const deleteAccount = (id) => {
      const accId = String(id || "").trim();
      if (!accId) return;

      const txs = Array.isArray(state.transactions) ? state.transactions : [];
      const idsToDelete = new Set();
      const transferIdsToDelete = new Set();

      const isTransferLikeTx = (t) => {
        if (!t) return false;
        if (t.isTransfer) return true;
        const tid = String(t.transferId || "").trim();
        if (tid) return true;
        const c = String(t.category || "").toLowerCase().trim();
        return c === "transfer";
      };

      for (const t of txs) {
        if (String(t?.accountId || "").trim() !== accId) continue;
        const tid = String(t?.id || "").trim();
        if (tid) idsToDelete.add(tid);
        if (isTransferLikeTx(t)) {
          const trId = String(t?.transferId || "").trim();
          if (trId) transferIdsToDelete.add(trId);
        }
      }

      if (transferIdsToDelete.size) {
        for (const t of txs) {
          if (!isTransferLikeTx(t)) continue;
          const trId = String(t?.transferId || "").trim();
          if (!trId || !transferIdsToDelete.has(trId)) continue;
          const tid = String(t?.id || "").trim();
          if (tid) idsToDelete.add(tid);
        }
      }

      const cascadeTxIds = Array.from(idsToDelete);
      if (cascadeTxIds.length) cleanupBlobsForTxIds(cascadeTxIds);

      dispatch({ type: ACTIONS.DELETE_ACCOUNT, payload: { id: accId, cascadeTxIds } });
    };

    /**
     * ✅ Adjust account balance
     * - recordAsTransaction = true: create an income/expense tx (shows in stats)
     * - recordAsTransaction = false: modify openingBalance to match desired (silent fix)
     */
    const adjustAccountBalance = ({ accountId, desiredBalance, recordAsTransaction }) => {
      const desired = safeSatang(desiredBalance, NaN);
      if (!Number.isFinite(desired)) return;

      const current = safeSatang(calcAccountBalance(state.accounts, state.transactions, accountId), 0);
      const delta = desired - current;
      if (!delta) return;

      const acc = state.accounts.find((a) => a.id === accountId);
      if (!acc) return;

      if (recordAsTransaction) {
        const isIncome = delta > 0;
        const category = "adjust_balance";

        // ✅ Use a fresh id (avoid undefined variables + prevent accidental overwrite)
        const id = generateId();

        upsertTransaction({
          id,
          type: isIncome ? "income" : "expense",
          amount: Math.abs(delta),
          category,
          accountId,
          date: toISODate(new Date()),
          note: "ปรับยอดบัญชี",
          isTransfer: false,
          meta: { kind: "adjust_balance" },
        });
      } else {
        const opening = safeSatang(acc.openingBalance, 0);
        updateAccount({ id: accountId, openingBalance: opening + delta });
      }
    };

    const addCategory = (payload) => {
      const type = payload?.type || "expense";
      const category = payload?.category || payload;
      const name = String(category?.name || "").trim() || "หมวดหมู่ใหม่";

      const next = {
        ...category,
        id: category?.id || slugifyId(name) || generateId(),
        name,
        icon: String(category?.icon || "🏷️"),
        color: String(category?.color || "#C8D6E5"),
      };

      dispatch({ type: ACTIONS.ADD_CATEGORY, payload: { type, category: next } });
    };

    const deleteCategory = ({ type, id }) => dispatch({ type: ACTIONS.DELETE_CATEGORY, payload: { type, id } });

    // budgets
    const upsertBudget = (b) => dispatch({ type: ACTIONS.UPSERT_BUDGET, payload: b });
    const deleteBudget = (id) => dispatch({ type: ACTIONS.DELETE_BUDGET, payload: id });

    // recurring
    const upsertRecurring = (r) => dispatch({ type: ACTIONS.UPSERT_RECURRING, payload: r });
    const deleteRecurring = (id) => dispatch({ type: ACTIONS.DELETE_RECURRING, payload: id });

    const runRecurringNow = () => {
      const todayISO = toISODate(new Date());

      const created = [];
      const nextRecurring = [];
      const truncatedRules = [];

      for (const r of state.recurring || []) {
        const { txs, nextRecurring: nr, truncated, nextDueISO, cap } = generateDueTransactionsForRecurring(r, todayISO);
        if (txs.length) created.push(...txs);
        nextRecurring.push(nr);
        if (truncated) {
          truncatedRules.push({ id: String(r?.id || ""), nextDueISO: nextDueISO || null, cap: cap || MAX_RECURRING_CREATE_PER_RUN });
        }
      }

      if (created.length) {
        dispatch({
          type: ACTIONS.APPLY_RECURRING_GENERATION,
          payload: { transactions: created, recurring: nextRecurring },
        });
      }

      return { createdCount: created.length, truncatedRules, cap: MAX_RECURRING_CREATE_PER_RUN, todayISO };
    };

    const resetAll = () => {
      // clear persistent attachments as well
      try {
        clearAllBlobs();
      } catch {
        // ignore
      }
      clearAll();
      try {
        localStorage.removeItem(ONBOARDING_KEY);
        localStorage.removeItem(PIN_KEY);
      } catch {
        // ignore
      }
      try {
        sessionStorage.removeItem("add.entryMode.force");
        sessionStorage.removeItem("add.scanUploadKind.force");
        sessionStorage.removeItem("add.txType.force");
      } catch {
        // ignore
      }
      dispatch({
        type: ACTIONS.RESET_ALL,
        payload: {
          transactions: [],
          accounts: DEFAULT_ACCOUNTS,
          categories: DEFAULT_CATEGORIES,
          budgets: [],
          recurring: [],
          merchants: [],
          rules: [],
          inbox: [],
          scanInbox: [],
          ui: { view: "dashboard", editingId: null },
        },
      });
      try {
        window.dispatchEvent(new CustomEvent(RESET_ALL_EVENT));
      } catch {
        // ignore
      }
    };

    const importBackup = (payload) => {
      const normalizedPayload = normalizeBackupCore(payload);

      // ✅ Backup does not include binary attachments; clear old blobs to avoid orphans.
      try {
        void clearAllBlobs();
      } catch {
        // ignore
      }
      dispatch({ type: ACTIONS.IMPORT_BACKUP, payload: normalizedPayload });
    };
    // inbox
    const addInboxItems = (items) => dispatch({ type: ACTIONS.INBOX_UPSERT_MANY, payload: items });
    const updateInboxItem = (id, patch) => dispatch({ type: ACTIONS.INBOX_UPDATE_ONE, payload: { id, patch } });
    const removeInboxItems = (ids) => dispatch({ type: ACTIONS.INBOX_REMOVE_MANY, payload: ids });
    const clearApprovedInbox = () => dispatch({ type: ACTIONS.INBOX_CLEAR_APPROVED });
    const clearAllInbox = () => dispatch({ type: ACTIONS.INBOX_CLEAR_ALL });

    // backward compatible scan inbox API (alias)
    const addScanInboxItems = addInboxItems;
    const removeScanInboxItem = (id) => dispatch({ type: ACTIONS.SCAN_INBOX_REMOVE, payload: id });
    const clearScanInbox = clearAllInbox;

    // automation rules
    const upsertRule = (rule) => dispatch({ type: ACTIONS.RULE_UPSERT, payload: rule });
    const updateRule = (id, patch) => dispatch({ type: ACTIONS.RULE_UPDATE, payload: { id, patch } });
    const deleteRule = (id) => dispatch({ type: ACTIONS.RULE_DELETE, payload: id });

    const setRuleOrder = (nextRules) => dispatch({ type: ACTIONS.RULE_SET_ORDER, payload: nextRules });

    const moveRule = (id, dir) => {
      const list = Array.isArray(state.rules) ? state.rules.slice() : [];
      const ordered = list
        .filter(Boolean)
        .slice()
        .sort((a, b) => (Number(a?.priority) || 0) - (Number(b?.priority) || 0));
      const idx = ordered.findIndex((r) => String(r?.id) === String(id));
      if (idx < 0) return;
      const nextIdx = idx + (dir === "down" ? 1 : -1);
      if (nextIdx < 0 || nextIdx >= ordered.length) return;
      const swapped = ordered.slice();
      const tmp = swapped[idx];
      swapped[idx] = swapped[nextIdx];
      swapped[nextIdx] = tmp;
      // renumber priorities densely
      setRuleOrder(swapped.map((r, i) => ({ ...r, priority: i + 1 })));
    };

    // Smart Merchant Dictionary
    const upsertMerchant = (entry) => dispatch({ type: ACTIONS.MERCHANT_UPSERT, payload: entry });
    const updateMerchant = (id, patch) => dispatch({ type: ACTIONS.MERCHANT_UPDATE, payload: { id, patch } });
    const deleteMerchant = (id) => dispatch({ type: ACTIONS.MERCHANT_DELETE, payload: id });
    const mergeMerchants = (sourceId, targetId) =>
      dispatch({ type: ACTIONS.MERCHANT_MERGE, payload: { sourceId, targetId } });
    const learnMerchant = (sample) => dispatch({ type: ACTIONS.MERCHANT_LEARN, payload: sample });


    const exportBackup = () => ({
  v: 1,
  exportedAt: Date.now(),
  data: {
    // ✅ important: tells importer how to interpret all money fields
    moneyUnit: resolveMoneyUnit(state.moneyUnit, "satang"),
    transactions: state.transactions ?? [],
    accounts: state.accounts ?? [],
    categories: state.categories ?? { expense: [], income: [] },
    budgets: state.budgets ?? [],
    recurring: state.recurring ?? [],
    merchants: normalizeMerchants(state.merchants ?? []),
    rules: state.rules ?? [],
    inbox: state.inbox ?? [],
    // backward compatibility
    scanInbox: state.inbox ?? [],
    ui: {
      view: state.ui?.view || "dashboard",
      editingId: state.ui?.editingId || null,
    },
  },
});

    const actions = {
      navigate,
      startNewTransaction,
      startNew,
      consumeNewTransactionIntent,
      startEditTransaction,
      startEdit,
      upsertTransaction,
      bulkUpsertTransactions,
      deleteTransaction,
      deleteManyTransactions,

      addAccount,
      updateAccount,
      adjustAccountBalance,
      deleteAccount,

      addCategory,
      deleteCategory,

      upsertBudget,
      deleteBudget,

      upsertRecurring,
      deleteRecurring,
      runRecurringNow,
      addInboxItems,
      updateInboxItem,
      removeInboxItems,
      clearApprovedInbox,
      clearAllInbox,

      addScanInboxItems,
      removeScanInboxItem,
      clearScanInbox,

      upsertRule,
      updateRule,
      deleteRule,
      moveRule,
      setRuleOrder,

      upsertMerchant,
      updateMerchant,
      deleteMerchant,
      mergeMerchants,
      learnMerchant,

      resetAll,
      importBackup,
      exportBackup,
    };

    return {
      state,
      dispatch,
      actions,
      getEditingTransaction,
      ...actions,
    };
  }, [state, getEditingTransaction]);

  return <AppStoreContext.Provider value={api}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
