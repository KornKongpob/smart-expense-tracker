// src/utils/format.js

// ---------- Currency ----------
export const formatCurrency = (amount) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

// ---------- Safe date parsing ----------
// Prefer parsing YYYY-MM-DD as local date to avoid timezone shifting issues.
export function parseDateSafe(dateInput) {
  if (!dateInput) return new Date();

  // If already a Date
  if (dateInput instanceof Date) return dateInput;

  const s = String(dateInput).trim();

  // YYYY-MM-DD (or starts with it)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(y, mo - 1, d); // local midnight
  }

  // fallback
  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : new Date();
}

// ---------- Date formatting ----------
export const formatDateShort = (dateInput) => {
  const d = parseDateSafe(dateInput);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(d);
};

// ---------- ISO date (LOCAL) ----------
// Return YYYY-MM-DD in local time (safe for <input type="date">)
export const toISODate = (date = new Date()) => {
  const d = parseDateSafe(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

// Backward/compat alias (in case some files call toISODateSafe)
export const toISODateSafe = toISODate;
