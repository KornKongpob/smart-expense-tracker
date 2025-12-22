// src/utils/format.js

/**
 * ✅ Formatting utilities (Currency + Dates)
 * - เน้น “ปลอดภัย” กับข้อมูลที่มาจากหลายแหล่ง (input, storage, OCR/scan)
 * - แก้ปัญหา timezone shift ของ YYYY-MM-DD ด้วยการ parse เป็น “local midnight”
 * - รองรับ Date | string | number (timestamp)
 * - มี helper สำหรับ normalize ปี พ.ศ. -> ค.ศ. (ใช้ได้กับสลิป/ใบเสร็จบางแบบ)
 */

// ==============================
// Currency
// ==============================

const THB_FORMATTER = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const THB_FORMATTER_2D = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * formatCurrency(1200) => "฿1,200"
 * - ปลอดภัยกับค่า null/undefined/NaN
 * - ค่า default = 0
 */
export const formatCurrency = (amount) => {
  const n = Number(amount);
  return THB_FORMATTER.format(Number.isFinite(n) ? n : 0);
};

/**
 * formatCurrency2(12.5) => "฿12.50"
 * - เผื่อบางหน้าต้องแสดงทศนิยม
 */
export const formatCurrency2 = (amount) => {
  const n = Number(amount);
  return THB_FORMATTER_2D.format(Number.isFinite(n) ? n : 0);
};

/**
 * formatSignedCurrency
 * - ใช้ใน UI บางจุดที่ต้องการ + / - หน้าจำนวนเงิน
 */
export const formatSignedCurrency = (amount, { plusSign = true } = {}) => {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const sign = safe > 0 && plusSign ? "+" : safe < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(safe))}`;
};

// ==============================
// Safe date parsing
// ==============================

/**
 * ✅ normalizeBuddhistYear
 * - ถ้า year >= 2400 (พ.ศ.) -> แปลงเป็น ค.ศ. (ลบ 543)
 * - ใช้กับกรณี OCR อ่าน "2567-01-02" หรือ "2567/01/02"
 */
export function normalizeBuddhistYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return year;
  if (y >= 2400) return y - 543; // พ.ศ. -> ค.ศ.
  return y;
}

/**
 * ✅ parseDateSafe
 * - ถ้า input เป็น YYYY-MM-DD (หรือขึ้นต้นด้วย YYYY-MM-DD) จะ parse แบบ local date
 *   เพื่อกันปัญหา timezone ทำให้วันเลื่อน
 * - รองรับ Date | number(timestamp) | string
 */
export function parseDateSafe(dateInput) {
  if (!dateInput) return new Date();

  // Already Date
  if (dateInput instanceof Date) {
    const t = dateInput.getTime();
    return Number.isFinite(t) ? dateInput : new Date();
  }

  // Timestamp number
  if (typeof dateInput === "number") {
    const d = new Date(dateInput);
    return Number.isFinite(d.getTime()) ? d : new Date();
  }

  const s = String(dateInput).trim();
  if (!s) return new Date();

  /**
   * ✅ Date-only patterns:
   * - "YYYY-MM-DD"
   * - "YYYY/MM/DD"
   * - also supports "YYYY-MM-DDTHH:mm:ss..." by taking the date prefix
   */
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) {
    const y = normalizeBuddhistYear(m1[1]);
    const mo = Number(m1[2]);
    const d = Number(m1[3]);
    const local = new Date(Number(y), mo - 1, d); // local midnight
    return Number.isFinite(local.getTime()) ? local : new Date();
  }

  const m2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (m2) {
    const y = normalizeBuddhistYear(m2[1]);
    const mo = Number(m2[2]);
    const d = Number(m2[3]);
    const local = new Date(Number(y), mo - 1, d);
    return Number.isFinite(local.getTime()) ? local : new Date();
  }

  // fallback: let Date parse (ISO with time, etc.)
  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : new Date();
}

/**
 * ✅ isISODate
 * - ตรวจรูปแบบ YYYY-MM-DD แบบง่าย ๆ
 */
export function isISODate(s) {
  const t = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t);
}

// ==============================
// Date formatting
// ==============================

/**
 * formatDateShort("2025-12-22") => "22 ธ.ค. 68"
 */
export const formatDateShort = (dateInput) => {
  const d = parseDateSafe(dateInput);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(d);
};

/**
 * formatDateLong("2025-12-22") => "22 ธันวาคม 2568"
 * - ใช้ประโยชน์สำหรับหน้า setting/รายงาน
 */
export const formatDateLong = (dateInput) => {
  const d = parseDateSafe(dateInput);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
};

/**
 * ✅ toISODate (LOCAL)
 * - คืนค่า YYYY-MM-DD ใน local time
 * - ปลอดภัยกับ <input type="date">
 */
export const toISODate = (date = new Date()) => {
  const d = parseDateSafe(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

/**
 * ✅ toMonthKey
 * - คืนค่า "YYYY-MM"
 * - ใช้กับ budgets/stats ได้สะดวก
 */
export const toMonthKey = (dateInput) => {
  const d = parseDateSafe(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

// Backward/compat alias (in case some files call toISODateSafe)
export const toISODateSafe = toISODate;
