// src/store/selectors.js
// Central selectors + safe date helpers
// ✅ Goal: make date handling stable across timezone (especially for YYYY-MM-DD strings)

import { digitsOnly } from "../utils/accountMatch";

export const nonTransfer = (t) => !t?.isTransfer;

// -----------------------------
// Safe date parsing utilities
// -----------------------------
// Why we need this:
// - Many parts of the app store dates as "YYYY-MM-DD" (date-only).
// - JS Date("YYYY-MM-DD") is parsed as UTC in many runtimes, which can shift day in some timezones.
// - We want "YYYY-MM-DD" to always mean "local date at midnight" consistently.

export function parseDateSafe(input, fallback = new Date()) {
  // Accept Date | string | number
  if (input == null || input === "") return fallback instanceof Date ? fallback : new Date();

  // Date instance
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? input : new Date();
  }

  // timestamp (ms)
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : new Date();
  }

  const s = String(input).trim();
  if (!s) return fallback instanceof Date ? fallback : new Date();

  /**
   * ✅ If the string begins with YYYY-MM-DD
   * treat it as "local date" and ignore timezone shifting.
   * We also accept strings like:
   * - "2025-12-22"
   * - "2025-12-22T10:00:00Z"
   * - "2025-12-22 10:00"
   */
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    // guard invalid numeric parts
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return new Date();

    // local midnight (stable)
    const local = new Date(y, mo - 1, d);
    return Number.isFinite(local.getTime()) ? local : new Date();
  }

  // Otherwise, let Date parse (ISO with time or other formats)
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

export function toISODateSafe(input) {
  // Always returns "YYYY-MM-DD"
  const d = parseDateSafe(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toMonthKey(input) {
  // Always returns "YYYY-MM"
  const d = parseDateSafe(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// -----------------------------
// Receipt scan / duplication helpers
// -----------------------------
export function isDuplicateByRef(transactions, ref) {
  const r = String(ref || "").trim();
  if (!r) return false;
  return (transactions || []).some((t) => String(t?.ref || "").trim() === r);
}

/**
 * ✅ Fuzzy duplicate detection for scanned / inbox items.
 * Heuristic score = date proximity + amount closeness + (merchant/ref/digits/account).
 * Returns best match (if any).
 */
export function findFuzzyDuplicate(transactions, candidate, opts = {}) {
  const options = {
    maxDays: Number(opts.maxDays) || 7,
    // A hard cap to avoid obviously-non-duplicate matches
    maxAbsAmountDiff: Number(opts.maxAbsAmountDiff) || 2000,
    // Relative cap (e.g., 5% of amount)
    maxRelAmountDiff: Number(opts.maxRelAmountDiff) || 0.05,
    threshold: Number(opts.threshold) || 0.62,
    ...opts,
  };

  const candAmount = Number(candidate?.amount);
  if (!Number.isFinite(candAmount) || candAmount <= 0) {
    return { isDuplicate: false, score: 0, reasons: [], matchId: null, match: null };
  }

  const candDate = parseDateSafe(candidate?.date);
  const candType = String(candidate?.txType || candidate?.type || "").toLowerCase();
  const candRef = String(candidate?.referenceId || candidate?.ref || "").trim();
  const candMerchant = String(candidate?.merchant || "").trim();
  const candNote = String(candidate?.note || "").trim();

  const candAccountId = String(candidate?.accountId || "").trim();
  const candFromAccountId = String(candidate?.fromAccountId || "").trim();
  const candToAccountId = String(candidate?.toAccountId || "").trim();

  const candFromDigits = digitsOnly(candidate?.fromDigits || candidate?.from_account || "");
  const candToDigits = digitsOnly(candidate?.toDigits || candidate?.to_account || candidate?.counterparty_digits || "");

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[\s\u200b]+/g, " ")
      .replace(/[^a-z0-9ก-๙\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const tokens = (s) => {
    const t = norm(s);
    if (!t) return [];
    // keep meaningful tokens only
    return t
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length >= 2)
      .slice(0, 30);
  };

  const jaccard = (a, b) => {
    const A = new Set(a);
    const B = new Set(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const uni = A.size + B.size - inter;
    return uni ? inter / uni : 0;
  };

  const daysDiff = (a, b) => {
    const ms = Math.abs(a.getTime() - b.getTime());
    return ms / (1000 * 60 * 60 * 24);
  };

  const lastN = (s, n) => {
    const d = digitsOnly(s || "");
    if (!d) return "";
    return d.length <= n ? d : d.slice(-n);
  };

  const candRefDigits = lastN(candRef, 12);
  const candMerchantTokens = tokens(candMerchant);
  const candNoteTokens = tokens(candNote);
  const candTextTokens = Array.from(new Set([...candMerchantTokens, ...candNoteTokens]));

  const scoreAmount = (a, b) => {
    const diff = Math.abs(a - b);
    const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1);
    if (diff <= 1) return 0.4; // 1 satang (0.01 THB)
    if (diff <= 100) return 0.34; // 1 THB
    if (diff <= 200) return 0.3; // 2 THB
    if (diff <= 500) return 0.22; // 5 THB
    if (diff <= 1000) return 0.16; // 10 THB
    if (rel <= 0.01) return 0.16;
    if (rel <= 0.02) return 0.1;
    return 0;
  };

  const scoreDate = (d) => {
    if (d <= 0.01) return 0.25;
    if (d <= 1) return 0.22;
    if (d <= 2) return 0.18;
    if (d <= 3) return 0.14;
    if (d <= options.maxDays) return 0.08;
    return 0;
  };

  const scoreMerchant = (m1Tokens, m2Tokens, m1Raw, m2Raw) => {
    const a = norm(m1Raw);
    const b = norm(m2Raw);
    if (!a || !b) return 0;
    if (a === b) return 0.2;
    if (a.includes(b) || b.includes(a)) return 0.17;
    const j = jaccard(m1Tokens, m2Tokens);
    if (j >= 0.5) return 0.15;
    if (j >= 0.33) return 0.1;
    return 0;
  };

  const scoreDigits = (candFrom, candTo, tDigitsAll) => {
    const c4 = [lastN(candFrom, 4), lastN(candTo, 4)].filter(Boolean);
    const c6 = [lastN(candFrom, 6), lastN(candTo, 6)].filter(Boolean);
    if (!c4.length && !c6.length) return 0;
    const t4 = tDigitsAll.map((x) => lastN(x, 4)).filter(Boolean);
    const t6 = tDigitsAll.map((x) => lastN(x, 6)).filter(Boolean);
    const hit6 = c6.some((x) => t6.includes(x));
    if (hit6) return 0.22;
    const hit4 = c4.some((x) => t4.includes(x));
    if (hit4) return 0.18;
    return 0;
  };

  const scoreRef = (candRefRaw, tRefRaw) => {
    const a = String(candRefRaw || "").trim();
    const b = String(tRefRaw || "").trim();
    if (!a || !b) return 0;
    if (a === b) return 1; // immediate

    const ad = lastN(a, 12);
    const bd = lastN(b, 12);
    if (ad && bd && (ad === bd || ad.endsWith(bd) || bd.endsWith(ad))) return 0.18;

    const na = norm(a);
    const nb = norm(b);
    if (na && nb && (na.includes(nb) || nb.includes(na))) return 0.15;
    return 0;
  };

  let best = { score: 0, match: null, matchId: null, reasons: [] };

  for (const t of transactions || []) {
    if (!t) continue;

    const tAmount = Number(t?.amount);
    if (!Number.isFinite(tAmount) || tAmount <= 0) continue;

    const tDate = parseDateSafe(t?.date);
    const dDays = daysDiff(candDate, tDate);
    if (dDays > options.maxDays) continue;

    const absDiff = Math.abs(candAmount - tAmount);
    const relDiff = absDiff / Math.max(Math.abs(candAmount), Math.abs(tAmount), 1);
    if (absDiff > Math.max(options.maxAbsAmountDiff, options.maxRelAmountDiff * Math.max(candAmount, tAmount))) continue;

    const tIsTransfer = !!t?.isTransfer;
    const tType = String(t?.type || "").toLowerCase();
    // Candidate type filtering:
    // - transfer/credit_payment candidates match transfer transactions only
    // - expense/income candidates prefer non-transfer transactions with same type
    if (candType === "transfer" || candType === "credit_payment") {
      if (!tIsTransfer) continue;
    } else if (candType === "expense" || candType === "income") {
      if (tIsTransfer) continue;
      if (tType && tType !== candType) continue;
    }

    const tRef = String(t?.ref || t?.referenceId || "").trim();
    const refScore = scoreRef(candRef, tRef);
    if (refScore === 1) {
      return {
        isDuplicate: true,
        score: 1,
        reasons: ["ref exact match"],
        matchId: String(t?.id || ""),
        match: t,
      };
    }

    const tMerchant = String(t?.merchant || "").trim();
    const tNote = String(t?.note || "").trim();
    const tMerchantTokens = tokens(tMerchant);
    const tNoteTokens = tokens(tNote);
    const tTextTokens = Array.from(new Set([...tMerchantTokens, ...tNoteTokens]));

    const tAccountId = String(t?.accountId || "").trim();

    // try to derive digits from historical tx
    const tDigitsAll = [
      t?.fromDigits,
      t?.toDigits,
      t?.from_account,
      t?.to_account,
      t?.counterparty_digits,
    ]
      .map((x) => digitsOnly(x || ""))
      .filter(Boolean);
    const digitsScore = scoreDigits(candFromDigits, candToDigits, tDigitsAll);

    const amountScore = scoreAmount(candAmount, tAmount);
    const dateScore = scoreDate(dDays);

    // Merchant similarity: prefer merchant first, fallback to note text tokens
    const merchScore = scoreMerchant(candMerchantTokens, tMerchantTokens, candMerchant, tMerchant);
    const noteScore = scoreMerchant(candTextTokens, tTextTokens, candNote || candMerchant, tNote || tMerchant);
    const textScore = Math.max(merchScore, noteScore);

    // Account match bonus
    let accScore = 0;
    if (candType === "expense" || candType === "income") {
      if (candAccountId && tAccountId && candAccountId === tAccountId) accScore = 0.08;
    } else {
      // transfer-like: compare against expense side accountId (from)
      if (candFromAccountId && tAccountId && candFromAccountId === tAccountId) accScore = 0.08;
    }

    // Compose score
    let score = 0;
    const reasons = [];
    if (amountScore) {
      score += amountScore;
      reasons.push("amount close");
    }
    if (dateScore) {
      score += dateScore;
      reasons.push("date close");
    }
    if (refScore) {
      score += refScore;
      reasons.push("ref similar");
    }
    if (textScore) {
      score += textScore;
      reasons.push("merchant/note similar");
    }
    if (digitsScore) {
      score += digitsScore;
      reasons.push("digits match");
    }
    if (accScore) {
      score += accScore;
      reasons.push("account match");
    }

    // Require at least some evidence besides amount+date to reduce false positives
    const hasIdentityEvidence = refScore > 0 || textScore > 0 || digitsScore > 0 || accScore > 0;
    const passes = score >= options.threshold && amountScore >= 0.16 && dateScore > 0 && hasIdentityEvidence;

    if (passes && score > best.score) {
      best = {
        score,
        match: t,
        matchId: String(t?.id || ""),
        reasons,
      };
    }
  }

  if (best.match) {
    return {
      isDuplicate: true,
      score: best.score,
      reasons: best.reasons,
      matchId: best.matchId,
      match: best.match,
    };
  }

  // No match
  return { isDuplicate: false, score: 0, reasons: [], matchId: null, match: null };
}

// -----------------------------
// Totals / balances
// -----------------------------
export function calcTotals(transactions) {
  let income = 0;
  let expense = 0;

  for (const t of transactions || []) {
    if (!t) continue;
    if (t.isTransfer) continue; // transfers should not affect "income/expense totals"
    if (t.isSplitParent) continue; // split parent is UI-only (avoid double count)

    const amt = Number(t.amount) || 0;
    if (t.type === "income") {
      income += amt;
    } else if (t.type === "expense") {
      // ✅ Receipt adjustment: discount is stored as expense with adjustmentEffect="subtract"
      // so it reduces total expense instead of increasing it.
      const ae = String(t.adjustmentEffect || "").toLowerCase().trim();
      expense += ae === "subtract" ? -amt : amt;
    }
  }

  return {
    income,
    expense,
    net: income - expense,
  };
}

/**
 * ✅ Net effect of transactions on a specific account
 * - income => +amount
 * - expense => -amount
 * - transfer txs are usually stored as expense/income with isTransfer=true
 *   For balance, we DO count them because they still move money for that account.
 */
export function calcAccountTxNet(transactions, accountId) {
  const accId = String(accountId || "").trim();
  if (!accId) return 0;

  return (transactions || [])
    .filter((t) => t?.accountId === accId)
    .reduce((sum, t) => {
      if (t?.isSplitParent) return sum; // UI-only
      const amt = Number(t?.amount) || 0;
      if (t?.type === "income") return sum + amt;
      if (t?.type === "expense") {
        const ae = String(t?.adjustmentEffect || "").toLowerCase().trim();
        return ae === "subtract" ? sum + amt : sum - amt;
      }
      return sum;
    }, 0);
}

/**
 * ✅ Opening balance + net transactions
 * This matches how AccountsView displays and how store.jsx adjusts openingBalance.
 */
export function calcAccountBalance(accounts, transactions, accountId) {
  const accId = String(accountId || "").trim();
  if (!accId) return 0;

  const acc = (accounts || []).find((a) => a?.id === accId);
  const opening = Number(acc?.openingBalance || 0);
  return opening + calcAccountTxNet(transactions, accId);
}

/**
 * ✅ required by BudgetsView.jsx + DashboardView.jsx + AddTransactionView.jsx
 * Returns Map(categoryId => spentAmount) for the given monthKey "YYYY-MM"
 * - excludes transfers
 * - counts only expense transactions
 */
export function calcSpentByCategoryInMonth(transactions, monthKey, categoriesForHierarchy = null) {
  const mk = String(monthKey || "").trim(); // "YYYY-MM"
  const map = new Map();
  if (!mk) return map;

  // Optional: aggregate spending into main categories (parent buckets)
  const parentById = new Map();
  if (categoriesForHierarchy) {
    const list = Array.isArray(categoriesForHierarchy)
      ? categoriesForHierarchy
      : [
          ...(Array.isArray(categoriesForHierarchy?.expense) ? categoriesForHierarchy.expense : []),
          ...(Array.isArray(categoriesForHierarchy?.income) ? categoriesForHierarchy.income : []),
        ];

    for (const c of list || []) {
      const id = String(c?.id || "").trim();
      if (!id) continue;
      const pid = String(c?.parentId || "").trim();
      parentById.set(id, pid && pid !== id ? pid : "");
    }
  }

  const ancestorMemo = new Map();
  const getAncestors = (id) => {
    const key = String(id || "").trim();
    if (!key) return [];
    if (ancestorMemo.has(key)) return ancestorMemo.get(key);

    const out = [];
    const seen = new Set();
    let cur = key;
    for (let i = 0; i < 8; i++) {
      const pid = String(parentById.get(cur) || "").trim();
      if (!pid) break;
      if (seen.has(pid)) break;
      seen.add(pid);
      out.push(pid);
      cur = pid;
    }
    ancestorMemo.set(key, out);
    return out;
  };

  for (const t of transactions || []) {
    if (!t) continue;
    if (t.isTransfer) continue; // ✅ transfers should not count as spending
    if (t.isSplitParent) continue; // split parent is UI-only
    if (t.type !== "expense") continue;

    const iso = toISODateSafe(t.date);
    if (!iso.startsWith(mk)) continue;

    const cat = String(t.category || "").trim();
    if (!cat) continue;

    const amt = Number(t.amount) || 0;
    const ae = String(t.adjustmentEffect || "").toLowerCase().trim();
    const signed = ae === "subtract" ? -amt : amt;

    map.set(cat, (map.get(cat) || 0) + signed);

    if (parentById.size) {
      for (const anc of getAncestors(cat)) {
        map.set(anc, (map.get(anc) || 0) + signed);
      }
    }
  }

  return map;
}


export function getBudget(budgets, month, categoryId) {
  const m = String(month || "").trim();
  const c = String(categoryId || "").trim();
  if (!m || !c) return null;

  return (
    (budgets || []).find(
      (b) => String(b.month || "").trim() === m && String(b.categoryId || "").trim() === c
    ) || null
  );
}

/**
 * Optional (safe) helpers you might use later:
 * - sum transactions in month
 * - get transactions of day
 * Kept small and pure (not used unless imported).
 */
export function getTransactionsInMonth(transactions, monthKey) {
  const mk = String(monthKey || "").trim();
  if (!mk) return [];
  return (transactions || []).filter((t) => toISODateSafe(t?.date).startsWith(mk));
}

export function getTransactionsOnDate(transactions, isoDate) {
  const d = String(isoDate || "").slice(0, 10);
  if (!d) return [];
  return (transactions || []).filter((t) => toISODateSafe(t?.date) === d);
}
