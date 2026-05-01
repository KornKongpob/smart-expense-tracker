// src/utils/transferGrouping.js
// Centralized helpers to:
// - Pair "2 legs" transfer transactions (expense + income) into a single logical group
// - Detect "credit card payment" groups (bank/cash -> credit card)
// - Provide "display once" utilities for Dashboard / TransactionCard
//
// This module is intentionally resilient to older / inconsistent data.
// It uses multiple strategies to pair legs: transferId, ref, and heuristics (amount/date/type).

import { isCreditAccount } from "./accountMatch.js";
import { isTransferTransaction } from "../domain/ledger/transactionTypes.js";

const EPS = 1; // 1 satang

function safeString(v) {
  return v == null ? "" : String(v).trim();
}

function safeNumber(v) {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function normMoney(v) {
  const n = safeNumber(v);
  if (n == null) return null;
  // Amounts are stored as SATANG (integer)
  return Math.round(n);
}

function moneyEq(a, b, eps = EPS) {
  const x = normMoney(a);
  const y = normMoney(b);
  if (x == null || y == null) return false;
  return Math.abs(Math.abs(x) - Math.abs(y)) <= eps;
}

function normDate(v) {
  const s = safeString(v);
  if (!s) return "";
  return s.slice(0, 10);
}

function dateEq(a, b) {
  const x = normDate(a);
  const y = normDate(b);
  if (!x || !y) return false;
  return x === y;
}

function normalizeLooseText(s) {
  return safeString(s)
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\wก-๙\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTransferLike(tx) {
  return isTransferTransaction(tx);
}

function getAccountById(accounts, id) {
  const aid = safeString(id);
  if (!aid) return null;
  return (accounts || []).find((a) => safeString(a?.id) === aid) || null;
}

function pickCanonicalFromGroup(groupTxs) {
  const list = Array.isArray(groupTxs) ? groupTxs.filter(Boolean) : [];
  if (!list.length) return null;

  // Prefer "expense" leg to represent the group in the UI
  const out = list.find((t) => safeString(t.type) === "expense");
  if (out) return out;

  const inn = list.find((t) => safeString(t.type) === "income");
  if (inn) return inn;

  // fallback: stable pick by id
  return list.slice().sort((a, b) => safeString(a.id).localeCompare(safeString(b.id)))[0];
}

/**
 * Try to pair a transfer leg into { outTx, inTx }.
 *
 * Strategy priority:
 *  1) transferId exact match (strongest)
 *  2) ref exact match (with amount/date scoring)
 *  3) heuristic match by (amount + date + opposite type + note similarity)
 *
 * Always returns an object for transfer-like tx:
 *  - may contain only one side if pair can't be found (single-leg transfer).
 */
export function getTransferPair(tx, allTxs = []) {
  if (!isTransferLike(tx)) return null;

  const transferId = safeString(tx.transferId);
  const ref = safeString(tx.ref);
  const date = normDate(tx.date);
  const amount = normMoney(tx.amount);

  const candidates = (allTxs || []).filter((t) => t && t !== tx && isTransferLike(t));

  // --- 1) by transferId ---
  if (transferId) {
    const same = candidates.filter((t) => safeString(t.transferId) === transferId);
    const group = [tx, ...same];
    const outTx = group.find((t) => safeString(t.type) === "expense") || null;
    const inTx = group.find((t) => safeString(t.type) === "income") || null;
    const canonical = pickCanonicalFromGroup(group);
    return { outTx, inTx, canonical, group };
  }

  // --- 2) by ref ---
  if (ref) {
    const sameRef = candidates.filter((t) => safeString(t.ref) && safeString(t.ref) === ref);
    if (sameRef.length) {
      const scored = sameRef
        .map((t) => {
          let score = 0;
          if (date && dateEq(t.date, date)) score += 2;
          if (amount != null && moneyEq(t.amount, amount)) score += 3;
          if (safeString(t.type) && safeString(tx.type) && safeString(t.type) !== safeString(tx.type)) score += 1;
          // boost: both category transfer
          if (safeString(t.category) === "transfer" && safeString(tx.category) === "transfer") score += 0.5;
          return { t, score };
        })
        .sort((a, b) => b.score - a.score);

      const best = scored[0]?.t || null;
      if (best) {
        const group = [tx, best];
        const outTx = group.find((t) => safeString(t.type) === "expense") || null;
        const inTx = group.find((t) => safeString(t.type) === "income") || null;
        const canonical = pickCanonicalFromGroup(group);
        return { outTx, inTx, canonical, group, ref };
      }
    }
  }

  // --- 3) heuristic ---
  const n1 = normalizeLooseText(tx.note || "");
  const byHeuristic = candidates
    .map((t) => {
      let score = 0;

      // Strong signal: same amount
      if (amount != null && moneyEq(t.amount, amount)) score += 3;

      // Strong signal: same date
      if (date && dateEq(t.date, date)) score += 2;

      // Prefer opposite type
      if (safeString(t.type) && safeString(tx.type) && safeString(t.type) !== safeString(tx.type)) score += 1;

      // Mild: similar note
      const n2 = normalizeLooseText(t.note || "");
      if (n1 && n2) {
        if (n1 === n2) score += 1;
        else if (n1.includes(n2) || n2.includes(n1)) score += 0.5;
      }

      return { t, score };
    })
    .filter((x) => x.score >= 4) // require at least (amount+date) or (amount + date/opposite + similarity)
    .sort((a, b) => b.score - a.score);

  const best = byHeuristic[0]?.t || null;
  if (best) {
    const group = [tx, best];
    const outTx = group.find((t) => safeString(t.type) === "expense") || null;
    const inTx = group.find((t) => safeString(t.type) === "income") || null;
    const canonical = pickCanonicalFromGroup(group);
    return { outTx, inTx, canonical, group };
  }

  // single leg fallback
  return {
    outTx: safeString(tx.type) === "expense" ? tx : null,
    inTx: safeString(tx.type) === "income" ? tx : null,
    canonical: tx,
    group: [tx],
  };
}

/**
 * Extract (fromAccountId,toAccountId) from a pair.
 * Uses:
 *  - expense leg as from
 *  - income leg as to
 * Best-effort when one side missing.
 */
export function getTransferEndpoints(pair) {
  if (!pair) return { fromAccountId: "", toAccountId: "" };

  const out = pair.outTx;
  const inn = pair.inTx;

  const fromAccountId =
    safeString(out?.accountId) ||
    (safeString(inn?.type) === "expense" ? safeString(inn?.accountId) : "") ||
    "";
  const toAccountId =
    safeString(inn?.accountId) ||
    (safeString(out?.type) === "income" ? safeString(out?.accountId) : "") ||
    "";

  return { fromAccountId, toAccountId };
}

/**
 * Classify a transfer group:
 * - "credit_payment" when money moves from non-credit account -> credit account
 * - otherwise "transfer"
 */
export function classifyTransferGroup(pair, accounts = []) {
  if (!pair) return "transfer";

  const { fromAccountId, toAccountId } = getTransferEndpoints(pair);
  const fromAcc = getAccountById(accounts, fromAccountId);
  const toAcc = getAccountById(accounts, toAccountId);

  if (!fromAcc || !toAcc) return "transfer";

  if (!isCreditAccount(fromAcc) && isCreditAccount(toAcc)) return "credit_payment";
  return "transfer";
}

/**
 * For list rendering: hide secondary legs when a canonical leg exists.
 *
 * - If we can determine a canonical tx for the group and it's not the current tx => hide.
 * - Conservative: if we can't determine canonical => do NOT hide.
 */
export function shouldHideTransferLeg(tx, allTxs = []) {
  if (!isTransferLike(tx)) return false;

  const pair = getTransferPair(tx, allTxs);
  if (!pair || !pair.canonical) return false;

  const canonId = safeString(pair.canonical.id);
  const myId = safeString(tx.id);
  if (!canonId || !myId) return false;

  return canonId !== myId;
}

/**
 * Normalized "group info" object for transfer / credit card payment.
 * This is intended to be the single source of truth for UI components.
 */
export function buildTransferGroupInfo(tx, allTxs = [], accounts = []) {
  if (!isTransferLike(tx)) return null;

  const pair = getTransferPair(tx, allTxs);
  if (!pair || !pair.canonical) return null;

  const { fromAccountId, toAccountId } = getTransferEndpoints(pair);

  const outTx = pair.outTx || null;
  const inTx = pair.inTx || null;
  const canonicalTx = pair.canonical;

  const kind = classifyTransferGroup(pair, accounts);

  const amount = normMoney(outTx?.amount ?? inTx?.amount ?? canonicalTx.amount);
  const date = normDate(outTx?.date ?? inTx?.date ?? canonicalTx.date) || "";
  const ref = safeString(outTx?.ref ?? inTx?.ref ?? canonicalTx.ref) || "";
  const note = safeString(outTx?.note ?? inTx?.note ?? canonicalTx.note) || "";

  // Prefer transferId if present, else use ref-based group id when safe
  const groupId =
    safeString(outTx?.transferId || inTx?.transferId || canonicalTx.transferId || "") ||
    (ref ? `ref:${ref}` : `tx:${safeString(canonicalTx.id)}`);

  return {
    kind, // "transfer" | "credit_payment"
    groupId,
    canonicalTx,
    outTx,
    inTx,
    fromAccountId,
    toAccountId,
    amount,
    date,
    ref,
    note,
    fromAccount: getAccountById(accounts, fromAccountId),
    toAccount: getAccountById(accounts, toAccountId),
    // helpful for edit flows
    legIds: {
      outId: safeString(outTx?.id),
      inId: safeString(inTx?.id),
      canonicalId: safeString(canonicalTx?.id),
    },
  };
}

/**
 * Collapse transactions so transfer groups appear once (canonical leg).
 *
 * Returns:
 *  - display: the list of txs to render (same tx objects; no mutation)
 *  - groupInfoByTxId: Map(txId -> groupInfo) for quick lookup
 *
 * The input order is preserved as much as possible.
 */
export function collapseTransfersForDisplay(transactions = [], accounts = []) {
  const txs = Array.isArray(transactions) ? transactions : [];
  const seenGroupIds = new Set();

  const display = [];
  const groupInfoByTxId = new Map();

  for (const tx of txs) {
    if (!isTransferLike(tx)) {
      display.push(tx);
      continue;
    }

    const info = buildTransferGroupInfo(tx, txs, accounts);

    // If we can't build group info, show tx as-is (safe default)
    if (!info || !info.canonicalTx) {
      display.push(tx);
      continue;
    }

    // Only render the canonical leg
    if (safeString(info.canonicalTx.id) !== safeString(tx.id)) continue;

    // Deduplicate by groupId when possible
    const gid = safeString(info.groupId);
    if (gid && seenGroupIds.has(gid)) continue;
    if (gid) seenGroupIds.add(gid);

    display.push(info.canonicalTx);
    groupInfoByTxId.set(safeString(info.canonicalTx.id), info);
  }

  return { display, groupInfoByTxId };
}

export default {
  isTransferLike,
  getTransferPair,
  getTransferEndpoints,
  classifyTransferGroup,
  shouldHideTransferLeg,
  buildTransferGroupInfo,
  collapseTransfersForDisplay,
};
