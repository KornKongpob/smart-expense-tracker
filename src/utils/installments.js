// src/utils/installments.js

/**
 * Installment utilities
 * - Amounts are stored in **satang** (integer)
 * - Dates are ISO "YYYY-MM-DD" strings
 */

const pad2 = (n) => String(n).padStart(2, "0");

function clampInt(v, min, max, fallback) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function daysInMonth(year, monthIndex0) {
  // monthIndex0: 0-11
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function addMonthsISO(dateISO, monthsToAdd) {
  const s = String(dateISO || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s || "";

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  // Convert to month index 0..11
  const baseMonth0 = mo - 1;
  const total = baseMonth0 + Number(monthsToAdd || 0);
  const ny = y + Math.floor(total / 12);
  const nmo0 = ((total % 12) + 12) % 12;

  const maxDay = daysInMonth(ny, nmo0);
  const nd = Math.min(Math.max(1, d), maxDay);

  return `${ny}-${pad2(nmo0 + 1)}-${pad2(nd)}`;
}

export function splitSatangToInstallments(totalSatang, months) {
  const total = Math.trunc(Number(totalSatang) || 0);
  const m = clampInt(months, 1, 120, 1);
  if (m <= 1) return [total];

  const base = Math.trunc(total / m);
  let rem = total - base * m;
  const out = new Array(m).fill(base);

  // Spread remainder (can be negative too)
  const step = rem >= 0 ? 1 : -1;
  rem = Math.abs(rem);
  for (let i = 0; i < rem; i++) {
    out[i % m] += step;
  }
  return out;
}

function appendInstallmentSuffix(note, idx1, totalCount) {
  const suffix = `(งวดที่ ${idx1}/${totalCount})`;
  const base = String(note || "").trim();
  return base ? `${base} ${suffix}` : suffix;
}

/**
 * Expand a base transaction into N installment transactions.
 * - Uses baseTx.date as installment #1 date, then +1 month for each next
 * - Splits amount evenly in satang; remainder is distributed across early installments
 */
export function expandTransactionToInstallments(baseTx, months, { groupId, makeId } = {}) {
  const m = clampInt(months, 1, 120, 1);
  if (m <= 1) return [{ ...(baseTx || {}) }];

  const tx0 = baseTx && typeof baseTx === "object" ? baseTx : {};
  const amount = Math.trunc(Number(tx0.amount) || 0);
  const amounts = splitSatangToInstallments(amount, m);
  const gid = String(groupId || tx0.installmentGroupId || "").trim() || null;

  const out = [];
  for (let i = 0; i < m; i++) {
    out.push({
      ...tx0,
      id: typeof makeId === "function" ? makeId() : undefined,
      amount: amounts[i],
      date: addMonthsISO(tx0.date, i),
      note: appendInstallmentSuffix(tx0.note, i + 1, m),
      installmentGroupId: gid,
      installmentIndex: i + 1,
      installmentCount: m,
    });
  }
  return out;
}
