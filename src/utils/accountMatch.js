// src/utils/accountMatch.js
// Centralized helpers for account-digit parsing + matching (Thai slips/receipts)
//
// Goals
// - รองรับเลขไทย ๐-๙
// - รองรับการกรอกเลขหลายชุด เช่น "6345, 4373"
// - Map บัญชีจากเลขที่สแกนได้ (last 4–6 digits) ให้แม่นขึ้น
//
// NOTE
// - ไฟล์นี้ intentionally ไม่ผูกกับ store หรือ UI เพื่อให้ reuse ได้หลายจุด
// - ใช้ ES module exports (เหมาะกับ Vite)

/** Convert Thai digits ๐-๙ to Arabic digits 0-9 */
export function toArabicDigits(input) {
  const th = "๐๑๒๓๔๕๖๗๘๙";
  return String(input ?? "").replace(/[๐-๙]/g, (ch) => {
    const idx = th.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
}

/** Keep digits only (after Thai-digit normalization) */
export function digitsOnly(input) {
  return toArabicDigits(String(input ?? "")).replace(/[^0-9]/g, "");
}

/**
 * Parse user input / OCR output and return a unique array of digit tokens.
 * Examples:
 * - "•••• 6345" => ["6345"]
 * - "6345, 4373" => ["6345", "4373"]
 * - "123-4-567890" => ["1234567890"]
 */
export function parseDigitsList(input, { minLen = 3, maxLen = 19 } = {}) {
  const s = toArabicDigits(String(input ?? ""));
  if (!s.trim()) return [];

  const re = new RegExp(`[0-9]{${minLen},${maxLen}}`, "g");
  const out = [];
  const seen = new Set();

  let m;
  while ((m = re.exec(s))) {
    const token = String(m[0] || "").trim();
    if (!token) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }

  // Extra: if nothing matched but string contains digits with separators, collapse everything
  if (!out.length) {
    const collapsed = digitsOnly(s);
    if (collapsed.length >= minLen) return [collapsed.slice(0, maxLen)];
  }

  return out;
}

/** Prefer a stable "primary" digit set for display (last4) */
export function choosePrimaryDigits(digitsList) {
  const list = Array.isArray(digitsList) ? digitsList.filter(Boolean) : [];
  if (!list.length) return "";

  // Prefer 4–6 digits first (most common for slips)
  const preferred = list.find((d) => String(d).length >= 4 && String(d).length <= 6);
  return String(preferred || list[0] || "");
}

/** Format digits list for UI display, e.g. "•••• 6345, 4373" */
export function formatDigitsSummary(digitsList, { mask = true, maxShow = 4 } = {}) {
  const list = Array.isArray(digitsList) ? digitsList.filter(Boolean) : [];
  if (!list.length) return "";
  const shown = list.slice(0, Math.max(1, maxShow)).map((d) => String(d));
  const tail = list.length > shown.length ? ", ..." : "";
  const prefix = mask ? "•••• " : "";
  return `${prefix}${shown.join(", ")}${tail}`.trim();
}

/** Determine if account should be treated as a credit account */
export function isCreditAccount(acc) {
  const t = String(acc?.type || "").toLowerCase().trim();
  if (t === "credit") return true;
  if (Number(acc?.creditLimit || 0) > 0) return true;
  // optional heuristics: if name includes "credit"/"บัตร"
  const name = String(acc?.name || "").toLowerCase();
  if (name.includes("credit") || name.includes("บัตร")) return true;
  return false;
}

/**
 * Extract digit candidates from an account object.
 * Supports multiple possible fields across app versions:
 * - digits (string like "6345, 4373")
 * - accountNumber
 * - cardNumber
 * - cardDigits / lastDigits
 * - digitsList (array)
 */
export function getAccountDigitCandidates(acc) {
  if (!acc || typeof acc !== "object") return [];

  const candidates = [];

  // 1) explicit list
  if (Array.isArray(acc.digitsList)) {
    for (const d of acc.digitsList) candidates.push(...parseDigitsList(d));
  }

  // 1b) backward-compat: older builds used matchDigits
  if (Array.isArray(acc.matchDigits)) {
    for (const d of acc.matchDigits) candidates.push(...parseDigitsList(d));
  }
  candidates.push(...parseDigitsList(acc.matchDigits));

  // 2) common fields
  candidates.push(...parseDigitsList(acc.digits));
  candidates.push(...parseDigitsList(acc.accountNumber));
  candidates.push(...parseDigitsList(acc.cardNumber));
  candidates.push(...parseDigitsList(acc.cardDigits));
  candidates.push(...parseDigitsList(acc.lastDigits));
  candidates.push(...parseDigitsList(acc.cardLast4));

  // 3) fallback: if account object already stores "digits" as a short token
  if (typeof acc.digits === "string" && acc.digits.trim()) {
    candidates.push(...parseDigitsList(acc.digits.trim()));
  }

  // normalize + unique
  const out = [];
  const seen = new Set();
  for (const c of candidates) {
    const tok = digitsOnly(c);
    if (!tok) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }

  return out;
}

/**
 * Score overlap between two digit tokens (suffix match).
 * - Best for last digits matching (slips usually show last 4–6)
 */
export function scoreSuffixOverlap(a, b) {
  const A = digitsOnly(a);
  const B = digitsOnly(b);
  if (!A || !B) return 0;

  const long = A.length >= B.length ? A : B;
  const short = A.length >= B.length ? B : A;

  if (long.endsWith(short)) return short.length;

  // fallback: if last4 matches, give 4 points (helps when OCR adds extra digits)
  if (A.length >= 4 && B.length >= 4 && A.slice(-4) === B.slice(-4)) return 4;

  return 0;
}

/**
 * Find best match account from a digit input (single string OR array of strings).
 * Returns { id, score, matchedAccountDigits, matchedSlipDigits }
 */
export function bestMatchAccountCandidate(accounts, slipDigitsInput, { minScore = 3 } = {}) {
  const list = Array.isArray(accounts) ? accounts : [];
  const slipTokens = Array.isArray(slipDigitsInput)
    ? slipDigitsInput.flatMap((x) => parseDigitsList(x))
    : parseDigitsList(slipDigitsInput);

  const slipCandidates = slipTokens.map(digitsOnly).filter(Boolean);

  if (!slipCandidates.length) {
    return { id: "", score: 0, matchedAccountDigits: "", matchedSlipDigits: "" };
  }

  let best = { id: "", score: 0, matchedAccountDigits: "", matchedSlipDigits: "" };

  for (const acc of list) {
    const accId = String(acc?.id || "").trim();
    if (!accId) continue;

    const accCandidates = getAccountDigitCandidates(acc);
    if (!accCandidates.length) continue;

    for (const s of slipCandidates) {
      for (const a of accCandidates) {
        const sc = scoreSuffixOverlap(a, s);
        if (sc > best.score) {
          best = { id: accId, score: sc, matchedAccountDigits: a, matchedSlipDigits: s };
        } else if (sc === best.score && sc > 0) {
          // tie-break: prefer credit match when digits look like card last4? (optional)
          // keep deterministic: prefer shorter slip digits (more likely last4/last6)
          if (best.matchedSlipDigits && s && s.length < best.matchedSlipDigits.length) {
            best = { id: accId, score: sc, matchedAccountDigits: a, matchedSlipDigits: s };
          }
        }
      }
    }
  }

  if (best.score < minScore) {
    // still return best attempt (score may be 1–2), caller can decide to ignore
    return best;
  }

  return best;
}

/** Shortcut: return only account id */
export function bestMatchAccountId(accounts, slipDigitsInput, opts) {
  return bestMatchAccountCandidate(accounts, slipDigitsInput, opts).id || "";
}

/**
 * Match from/to accounts for transfer-like slips.
 * Helps avoid picking the same account for both sides when digits differ.
 */
export function matchFromToAccounts(
  accounts,
  { fromDigits, toDigits, fallbackId = "", avoidSame = true, minScore = 3 } = {}
) {
  const list = Array.isArray(accounts) ? accounts : [];

  const fromBest = bestMatchAccountCandidate(list, fromDigits, { minScore: 0 });
  const toBest = bestMatchAccountCandidate(list, toDigits, { minScore: 0 });

  let fromId = fromBest.id || fallbackId || "";
  let toId = toBest.id || fallbackId || "";

  if (avoidSame && fromId && toId && fromId === toId) {
    const f = digitsOnly(fromDigits);
    const t = digitsOnly(toDigits);
    if (f && t && f !== t) {
      // try alternative for "to": exclude current fromId and re-run
      const filtered = list.filter((a) => String(a?.id || "") !== fromId);
      const altTo = bestMatchAccountCandidate(filtered, toDigits, { minScore: 0 });
      if (altTo.score > toBest.score || (altTo.id && altTo.id !== toId)) {
        toId = altTo.id || toId;
      } else {
        // try alternative for "from"
        const altFrom = bestMatchAccountCandidate(filtered, fromDigits, { minScore: 0 });
        if (altFrom.id && altFrom.id !== fromId) fromId = altFrom.id;
      }
    }
  }

  // If caller wants to enforce minimum confidence
  const okFrom = fromBest.score >= minScore || !digitsOnly(fromDigits);
  const okTo = toBest.score >= minScore || !digitsOnly(toDigits);

  return {
    fromId,
    toId,
    fromScore: fromBest.score,
    toScore: toBest.score,
    okFrom,
    okTo,
    matched: {
      from: fromBest,
      to: toBest,
    },
  };
}

/** Convenience: pick a UI-friendly last digits from an account */
export function getAccountLastDigits(acc, { maxLen = 6 } = {}) {
  const candidates = getAccountDigitCandidates(acc);
  if (!candidates.length) return "";
  const primary = choosePrimaryDigits(candidates) || candidates[0];
  const s = String(primary || "");
  if (!s) return "";
  const n = digitsOnly(s);
  if (!n) return "";
  const take = Math.max(3, Math.min(maxLen, n.length));
  return n.slice(-take);
}

export default {
  toArabicDigits,
  digitsOnly,
  parseDigitsList,
  choosePrimaryDigits,
  formatDigitsSummary,
  isCreditAccount,
  getAccountDigitCandidates,
  scoreSuffixOverlap,
  bestMatchAccountCandidate,
  bestMatchAccountId,
  matchFromToAccounts,
  getAccountLastDigits,
};
