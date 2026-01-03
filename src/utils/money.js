// src/utils/money.js
// Money helpers for THB minor-units (satang)
// ✅ Canonical storage unit: SATANG (integer)
// - 1 THB = 100 satang
// - Use integers to avoid floating precision issues

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

export const MINOR_PER_THB = 100;

export function normalizeThaiDigits(input) {
  return String(input ?? "").replace(/[๐-๙]/g, (ch) => String(THAI_DIGITS.indexOf(ch)));
}

/**
 * sanitizeMoneyInput
 * - keeps digits + optional leading '-' + one '.'
 * - limits decimals to 2
 */
export function sanitizeMoneyInput(raw, { maxDecimals = 2 } = {}) {
  const s0 = normalizeThaiDigits(raw).trim();
  if (!s0) return "";

  // remove currency symbols/spaces
  let s = s0.replace(/[฿\s]/g, "");

  // keep a single leading '-'
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");

  // remove thousand separators
  s = s.replace(/,/g, "");

  // keep digits and dot only
  s = s.replace(/[^0-9.]/g, "");

  // keep only first dot
  const parts = s.split(".");
  const intPart = parts[0] ?? "";
  const fracPartRaw = parts.length > 1 ? parts.slice(1).join("") : "";

  const fracPart = maxDecimals >= 0 ? fracPartRaw.slice(0, maxDecimals) : fracPartRaw;

  // avoid "." only
  const intNorm = intPart === "" && fracPart ? "0" : intPart;
  const out = fracPartRaw.length || parts.length > 1 ? `${intNorm}.${fracPart}` : intNorm;

  return (neg ? "-" : "") + out;
}

/**
 * parseMoneyToSatang
 * - Accepts number (major THB) OR string input.
 * - Returns integer satang.
 */
export function parseMoneyToSatang(value) {
  if (value == null || value === "") return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    // treat as THB major units
    return Math.round(value * MINOR_PER_THB);
  }

  const s = sanitizeMoneyInput(String(value), { maxDecimals: 2 });
  if (!s || s === "-") return 0;

  const m = s.match(/^(-)?(\d+)?(?:\.(\d*))?$/);
  if (!m) return 0;

  const neg = !!m[1];
  const intStr = m[2] || "0";
  const fracStr = (m[3] || "").padEnd(2, "0").slice(0, 2);

  const intVal = Number(intStr);
  const fracVal = Number(fracStr);
  if (!Number.isFinite(intVal) || !Number.isFinite(fracVal)) return 0;

  const satang = intVal * MINOR_PER_THB + fracVal;
  return neg ? -satang : satang;
}

export function ensureSatangInt(value, fallback = 0) {
  const n = typeof value === "number" ? value : value != null ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function satangToBahtNumber(satang) {
  const n = ensureSatangInt(satang, 0);
  return n / MINOR_PER_THB;
}

export function formatMoneyInputFromSatang(satang, { emptyIfZero = false } = {}) {
  const n = ensureSatangInt(satang, 0);
  if (emptyIfZero && !n) return "";
  const abs = Math.abs(n);
  const baht = abs / MINOR_PER_THB;
  // input-friendly: no currency symbol, fixed 2 decimals
  return baht.toFixed(2);
}
