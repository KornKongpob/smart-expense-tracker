// src/utils/rulesEngine.js
/**
 * Advanced Automation Rules Engine
 *
 * - Pure functions (no store dependency)
 * - Safe for offline-first apps
 *
 * Normalized rule shape (store will enforce):
 * {
 *   id: string,
 *   name: string,
 *   enabled: boolean,
 *   priority: number,
 *   conditions: {
 *     keywordContains?: string,
 *     regex?: string,
 *     amountMin?: number,
 *     amountMax?: number,
 *     bankContains?: string,
 *     refContains?: string,
 *     fromDigitsEndsWith?: string,
 *     toDigitsEndsWith?: string,
 *   },
 *   actions: {
 *     setType?: 'expense'|'income'|'transfer'|'credit_payment',
 *     setCategoryId?: string,
 *     setAccountId?: string,
 *     setFromAccountId?: string,
 *     setToAccountId?: string,
 *   }
 * }
 */

const TH_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

function digitsOnly(s) {
  return String(s || "")
    .replace(/[๐-๙]/g, (ch) => String(TH_DIGITS.indexOf(ch)))
    .replace(/[^\d]/g, "");
}

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function splitCandidates(s) {
  // Allow:
  // - "1234"
  // - "1234, 5678"
  // - "1234|5678"
  // - "1234 5678"
  const raw = String(s || "").trim();
  if (!raw) return [];
  return raw
    .split(/[\s,|]+/g)
    .map((x) => digitsOnly(x))
    .filter(Boolean);
}

function parseRegexString(input) {
  const s = String(input || "").trim();
  if (!s) return null;

  // Support /pattern/flags
  const m = s.match(/^\/(.*)\/([gimsuy]*)$/);
  if (m) {
    try {
      return new RegExp(m[1], m[2] || "i");
    } catch {
      return null;
    }
  }

  // Otherwise treat as a raw pattern (case-insensitive)
  try {
    return new RegExp(s, "i");
  } catch {
    return null;
  }
}

function hasAnyCondition(conditions) {
  const c = conditions && typeof conditions === "object" ? conditions : {};
  return (
    !!String(c.keywordContains || "").trim() ||
    !!String(c.regex || "").trim() ||
    c.amountMin != null ||
    c.amountMax != null ||
    !!String(c.bankContains || "").trim() ||
    !!String(c.refContains || "").trim() ||
    !!String(c.fromDigitsEndsWith || "").trim() ||
    !!String(c.toDigitsEndsWith || "").trim()
  );
}

export function matchAutomationRule(rule, context) {
  const r = rule && typeof rule === "object" ? rule : {};
  if (r.enabled === false) return false;

  const c = r.conditions && typeof r.conditions === "object" ? r.conditions : {};
  const ctx = context && typeof context === "object" ? context : {};

  const text = norm(ctx.text || "");
  const rawText = norm(ctx.rawText || ctx.evidence || "");
  const merchant = norm(ctx.merchant || "");
  const ref = norm(ctx.ref || ctx.referenceId || "");
  const amount = Number(ctx.amount);
  const fromDigits = digitsOnly(ctx.fromDigits || "");
  const toDigits = digitsOnly(ctx.toDigits || "");

  // AND across all provided conditions
  const kw = norm(c.keywordContains || "");
  if (kw && !(text.includes(kw) || merchant.includes(kw) || rawText.includes(kw))) return false;

  const bank = norm(c.bankContains || "");
  if (bank && !(rawText.includes(bank) || text.includes(bank))) return false;

  const refContains = norm(c.refContains || "");
  if (refContains && !(`${ref} ${rawText} ${text}`.includes(refContains))) return false;

  const reStr = String(c.regex || "").trim();
  if (reStr) {
    const re = parseRegexString(reStr);
    if (!re) return false;
    const hay = String(ctx.rawText || ctx.evidence || ctx.text || "");
    if (!re.test(hay)) return false;
  }

  if (c.amountMin != null) {
    const min = Number(c.amountMin);
    if (Number.isFinite(min)) {
      if (!Number.isFinite(amount) || amount < min) return false;
    }
  }

  if (c.amountMax != null) {
    const max = Number(c.amountMax);
    if (Number.isFinite(max)) {
      if (!Number.isFinite(amount) || amount > max) return false;
    }
  }

  const fromEnd = splitCandidates(c.fromDigitsEndsWith);
  if (fromEnd.length) {
    const ok = fromEnd.some((d) => fromDigits.endsWith(d));
    if (!ok) return false;
  }

  const toEnd = splitCandidates(c.toDigitsEndsWith);
  if (toEnd.length) {
    const ok = toEnd.some((d) => toDigits.endsWith(d));
    if (!ok) return false;
  }

  // If rule has no conditions at all, allow match-all
  // (useful for a default rule)
  if (!hasAnyCondition(c)) return true;

  return true;
}

export function deriveAutomationPatch(rules, context) {
  const list = Array.isArray(rules) ? rules : [];
  const ctx = context && typeof context === "object" ? context : {};

  // priority: smaller first
  const ordered = list
    .filter(Boolean)
    .slice()
    .sort((a, b) => (Number(a?.priority) || 0) - (Number(b?.priority) || 0));

  const patch = {};

  for (const r of ordered) {
    if (!matchAutomationRule(r, ctx)) continue;
    const a = r.actions && typeof r.actions === "object" ? r.actions : {};

    // Apply in order, later matched rules override earlier ones.
    if (a.setType) patch.txType = a.setType;
    if (a.setCategoryId) patch.categoryId = a.setCategoryId;
    if (a.setAccountId) patch.accountId = a.setAccountId;
    if (a.setFromAccountId) patch.fromAccountId = a.setFromAccountId;
    if (a.setToAccountId) patch.toAccountId = a.setToAccountId;
  }

  return patch;
}

export function validateAutomationRule(rule) {
  const r = rule && typeof rule === "object" ? rule : {};
  const c = r.conditions && typeof r.conditions === "object" ? r.conditions : {};

  const reStr = String(c.regex || "").trim();
  if (reStr) {
    const re = parseRegexString(reStr);
    if (!re) return { ok: false, error: "Invalid regex" };
  }

  const min = c.amountMin != null ? Number(c.amountMin) : null;
  const max = c.amountMax != null ? Number(c.amountMax) : null;
  if (min != null && !Number.isFinite(min)) return { ok: false, error: "amountMin must be a number" };
  if (max != null && !Number.isFinite(max)) return { ok: false, error: "amountMax must be a number" };
  if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max) && min > max) {
    return { ok: false, error: "amountMin must be <= amountMax" };
  }

  return { ok: true };
}
