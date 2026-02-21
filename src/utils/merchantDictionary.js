// src/utils/merchantDictionary.js
/**
 * Smart Merchant Dictionary
 *
 * Goals
 * - Normalize merchant strings to a canonical form (e.g., "7-11 (สาขา...)" -> "7-ELEVEN")
 * - Maintain an aliasable merchant library (merge/rename)
 * - Learn simple preferences: merchant -> category/account (per tx type)
 * - Provide fast lookup for auto-fill after scan
 */

import { generateId } from "./id";

// ----------------------------
// Normalization
// ----------------------------

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

/**
 * Key used for comparisons (stable, case-insensitive, punctuation-light)
 */
export function normalizeMerchantKey(raw) {
  const s = String(raw || "")
    .replace(ZERO_WIDTH_RE, "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  return s
    .replace(/[()[\]{}]/g, " ")
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9\u0E00-\u0E7F\s/_.-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Built-in normalization (before dictionary aliasing)
 */
export function baseNormalizeMerchantName(raw) {
  let s = String(raw || "").replace(ZERO_WIDTH_RE, "").trim();
  if (!s) return "";

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  // Remove branch info inside parentheses (common Thai/EN patterns)
  // Example: "7-11 (สาขา... )" => "7-11"
  if (/\([^)]*\)/.test(s)) {
    // Prefer removing only if it looks like a branch hint
    const p = s.match(/^(.{2,80}?)\s*\(([^)]{1,80})\)\s*$/);
    if (p) {
      const inside = String(p[2] || "").toLowerCase();
      if (inside.includes("สาข") || inside.includes("branch") || inside.includes("สาขา")) {
        s = String(p[1] || "").trim();
      }
    }
  }

  // Remove trailing "สาขา..." without parentheses
  s = s.replace(/\s*[-–—:]?\s*สาขา\s+.+$/i, "").trim();

  const lower = s.toLowerCase();

  // 7-11 canonicalization
  if (/\b7\s*[-/ ]?\s*11\b/.test(lower) || /seven\s*eleven/.test(lower) || /\b7eleven\b/.test(lower)) {
    return "7-ELEVEN";
  }

  // Small helper: if it's mostly latin and short, uppercase for consistency
  const latinOnly = /^[a-z0-9\s\-&._/]+$/i.test(s);
  if (latinOnly && s.length <= 26) return s.toUpperCase();

  return s;
}

/**
 * Resolve canonical merchant name using the merchant library
 * - baseNormalize first
 * - then match against canonical/aliases by normalized key
 */
export function resolveMerchantCanonical(rawMerchant, merchantEntries = []) {
  const base = baseNormalizeMerchantName(rawMerchant);
  const key = normalizeMerchantKey(base);
  if (!key) return "";

  for (const e of merchantEntries || []) {
    if (!e || e.enabled === false) continue;
    const cKey = normalizeMerchantKey(e.canonical);
    if (cKey && cKey === key) return e.canonical;
    const aliases = Array.isArray(e.aliases) ? e.aliases : [];
    for (const a of aliases) {
      if (normalizeMerchantKey(a) === key) return e.canonical;
    }
  }

  return base || String(rawMerchant || "").trim();
}

// ----------------------------
// Merchant library model
// ----------------------------

export function normalizeMerchantEntry(raw) {
  const e = raw && typeof raw === "object" ? raw : {};
  const canonical = String(e.canonical || "").trim();
  return {
    id: String(e.id || generateId()),
    canonical: canonical || "(Unnamed)",
    aliases: Array.isArray(e.aliases) ? e.aliases.map((x) => String(x || "").trim()).filter(Boolean) : [],
    enabled: e.enabled !== false,
    // prefs store the currently best guess for autofill (per type)
    prefs: {
      expense: {
        categoryId: String(e?.prefs?.expense?.categoryId || ""),
        accountId: String(e?.prefs?.expense?.accountId || ""),
      },
      income: {
        categoryId: String(e?.prefs?.income?.categoryId || ""),
        accountId: String(e?.prefs?.income?.accountId || ""),
      },
    },
    // stats store simple counts to improve over time
    stats: {
      expense: {
        categoryCounts: { ...(e?.stats?.expense?.categoryCounts || {}) },
        accountCounts: { ...(e?.stats?.expense?.accountCounts || {}) },
      },
      income: {
        categoryCounts: { ...(e?.stats?.income?.categoryCounts || {}) },
        accountCounts: { ...(e?.stats?.income?.accountCounts || {}) },
      },
    },
    createdAt: Number(e.createdAt || Date.now()),
    updatedAt: Number(e.updatedAt || Date.now()),
  };
}

export function normalizeMerchants(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map(normalizeMerchantEntry);
}

function bumpCount(mapObj, key) {
  const k = String(key || "");
  if (!k) return mapObj;
  const next = { ...(mapObj || {}) };
  next[k] = (Number(next[k] || 0) || 0) + 1;
  return next;
}

function pickTopKey(countsObj) {
  const obj = countsObj && typeof countsObj === "object" ? countsObj : {};
  let best = "";
  let bestN = 0;
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v || 0) || 0;
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

/**
 * Learn from a confirmed item/tx.
 * sample fields:
 * - merchant (raw or canonical)
 * - type: expense|income
 * - categoryId (optional)
 * - accountId (optional)
 */
export function learnMerchantMapping(merchants, sample) {
  const list = normalizeMerchants(merchants);
  const merchantRaw = String(sample?.merchant || "").trim();
  if (!merchantRaw) return list;

  const type = String(sample?.type || sample?.txType || "expense").toLowerCase();
  const txType = type === "income" ? "income" : "expense";

  const canonical = resolveMerchantCanonical(merchantRaw, list);
  const canonicalKey = normalizeMerchantKey(canonical);
  if (!canonicalKey) return list;

  const categoryId = String(sample?.categoryId || sample?.category || "");
  const accountId = String(sample?.accountId || "");

  // Find existing entry by canonical/alias
  let idx = -1;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e) continue;
    if (normalizeMerchantKey(e.canonical) === canonicalKey) {
      idx = i;
      break;
    }
  }

  if (idx < 0) {
    list.unshift(
      normalizeMerchantEntry({
        id: generateId(),
        canonical,
        aliases: canonical !== merchantRaw ? [merchantRaw] : [],
        enabled: true,
      })
    );
    idx = 0;
  } else {
    const e = list[idx];
    // Capture raw as alias when it differs (helps unify later)
    if (merchantRaw && normalizeMerchantKey(merchantRaw) !== canonicalKey) {
      const has = (e.aliases || []).some((a) => normalizeMerchantKey(a) === normalizeMerchantKey(merchantRaw));
      if (!has) e.aliases = [...(e.aliases || []), merchantRaw].slice(0, 40);
    }
  }

  const entry = list[idx];
  const stats = entry.stats?.[txType] || { categoryCounts: {}, accountCounts: {} };
  const nextStats = {
    categoryCounts: categoryId ? bumpCount(stats.categoryCounts, categoryId) : { ...(stats.categoryCounts || {}) },
    accountCounts: accountId ? bumpCount(stats.accountCounts, accountId) : { ...(stats.accountCounts || {}) },
  };

  const nextPrefs = {
    categoryId: pickTopKey(nextStats.categoryCounts) || String(entry?.prefs?.[txType]?.categoryId || ""),
    accountId: pickTopKey(nextStats.accountCounts) || String(entry?.prefs?.[txType]?.accountId || ""),
  };

  list[idx] = {
    ...entry,
    canonical,
    updatedAt: Date.now(),
    stats: {
      ...(entry.stats || {}),
      [txType]: nextStats,
    },
    prefs: {
      ...(entry.prefs || {}),
      [txType]: {
        ...(entry?.prefs?.[txType] || {}),
        ...nextPrefs,
      },
    },
  };

  return list;
}

/**
 * Derive autofill patch from merchant prefs.
 * - Only fills missing fields or obviously-default fields.
 */
export function deriveMerchantAutofillPatch({ merchant, txType, categoryId, accountId }, merchants) {
  const list = normalizeMerchants(merchants);
  const canon = resolveMerchantCanonical(merchant, list);
  const canonKey = normalizeMerchantKey(canon);
  if (!canonKey) return { merchant: canon || "" };

  const type = String(txType || "expense").toLowerCase();
  const t = type === "income" ? "income" : "expense";
  const entry = list.find((e) => normalizeMerchantKey(e?.canonical) === canonKey) || null;
  const pref = entry?.prefs?.[t] || {};

  const patch = { merchant: canon };

  // Category: fill only if empty OR looks like generic
  const cat = String(categoryId || "");
  if ((!cat || cat === "other" || cat === "other_income") && pref.categoryId) {
    patch.categoryId = pref.categoryId;
  }

  // Account: fill only if empty
  const acc = String(accountId || "");
  if (!acc && pref.accountId) {
    patch.accountId = pref.accountId;
  }

  return patch;
}

/**
 * Merge merchant entry `sourceId` into `targetId`.
 * Returns { merchants, aliasKeys } where aliasKeys are keys that should be rewritten to target canonical.
 */
export function mergeMerchantEntries(merchants, sourceId, targetId) {
  const list = normalizeMerchants(merchants);
  const sId = String(sourceId || "");
  const tId = String(targetId || "");
  if (!sId || !tId || sId === tId) return { merchants: list, aliasKeys: new Set() };

  const sIdx = list.findIndex((m) => String(m?.id) === sId);
  const tIdx = list.findIndex((m) => String(m?.id) === tId);
  if (sIdx < 0 || tIdx < 0) return { merchants: list, aliasKeys: new Set() };

  const source = list[sIdx];
  const target = list[tIdx];

  const aliasKeys = new Set();
  aliasKeys.add(normalizeMerchantKey(source.canonical));
  for (const a of source.aliases || []) aliasKeys.add(normalizeMerchantKey(a));

  // Merge aliases (include source canonical as alias to preserve matching)
  const mergedAliases = [...(target.aliases || [])];
  const toAdd = [source.canonical, ...(source.aliases || [])].filter(Boolean);
  for (const a of toAdd) {
    const k = normalizeMerchantKey(a);
    if (!k) continue;
    if (normalizeMerchantKey(target.canonical) === k) continue;
    const exists = mergedAliases.some((x) => normalizeMerchantKey(x) === k);
    if (!exists) mergedAliases.push(a);
  }

  const mergeCounts = (a, b) => {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) {
      out[k] = (Number(out[k] || 0) || 0) + (Number(v || 0) || 0);
    }
    return out;
  };

  const mergedStats = {
    expense: {
      categoryCounts: mergeCounts(target?.stats?.expense?.categoryCounts, source?.stats?.expense?.categoryCounts),
      accountCounts: mergeCounts(target?.stats?.expense?.accountCounts, source?.stats?.expense?.accountCounts),
    },
    income: {
      categoryCounts: mergeCounts(target?.stats?.income?.categoryCounts, source?.stats?.income?.categoryCounts),
      accountCounts: mergeCounts(target?.stats?.income?.accountCounts, source?.stats?.income?.accountCounts),
    },
  };

  const mergedPrefs = {
    expense: {
      categoryId:
        target?.prefs?.expense?.categoryId || pickTopKey(mergedStats.expense.categoryCounts) || "",
      accountId: target?.prefs?.expense?.accountId || pickTopKey(mergedStats.expense.accountCounts) || "",
    },
    income: {
      categoryId: target?.prefs?.income?.categoryId || pickTopKey(mergedStats.income.categoryCounts) || "",
      accountId: target?.prefs?.income?.accountId || pickTopKey(mergedStats.income.accountCounts) || "",
    },
  };

  const mergedTarget = {
    ...target,
    aliases: mergedAliases.slice(0, 80),
    stats: mergedStats,
    prefs: mergedPrefs,
    updatedAt: Date.now(),
  };

  const next = list.filter((m) => String(m?.id) !== sId);
  const targetPos = next.findIndex((m) => String(m?.id) === tId);
  if (targetPos >= 0) next[targetPos] = mergedTarget;

  return { merchants: next, aliasKeys };
}
