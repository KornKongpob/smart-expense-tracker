// src/utils/refKey.js
// Centralized reference key validation and normalization.
// Eliminates duplication between AddTransactionView.jsx and store/selectors.js.

const BAD_REF_KEYS = new Set(
  [
    'REF',
    'REFERENCE',
    'REFERENCENO',
    'REFERENCENUMBER',
    'TRANSACTION',
    'TRANSACTIONID',
    'TXID',
    'PAYMENT',
    'TRANSFER',
    'SLIP',
    'RECEIPT',
    'INVOICE',
    'SUCCESS',
    'APPROVED',
    'COMPLETED',
    'PROMPTPAY',
    'MOBILEBANKING',
    'MOBILEAPP',
    'SCB',
    'KBANK',
    'KPLUS',
    'KTB',
    'BBL',
    'BAY',
    'TTB',
    'UOB',
    'GSB',
    'BAAC',
  ].map((x) => String(x).trim().toUpperCase())
);

/**
 * Check if a reference key string is a valid transaction reference.
 * Filters out generic labels, bank names, and too-short strings.
 */
export function isValidRefKey(key) {
  const k = String(key || '').trim().toUpperCase();
  if (!k) return false;
  if (BAD_REF_KEYS.has(k)) return false;
  if (k.length < 6) return false;

  const digits = (k.match(/\d/g) || []).length;
  const letters = (k.match(/[A-Z]/g) || []).length;

  if (digits === 0) return false;
  if (k.length > 40) return false;
  if (digits >= 4) return true;
  if (digits >= 2 && letters >= 2) return true;

  return false;
}

/**
 * Normalize a reference key for deduplication/comparison.
 * Strips separators, keeps alphanumerics, uppercases, validates.
 */
export function normalizeRefKey(ref) {
  const s0 = String(ref || '').trim();
  if (!s0) return '';
  const compact = s0.replace(/[\s\u200b\-_.]/g, '');
  const alnum = compact.replace(/[^A-Za-z0-9]/g, '');
  const base = (alnum || compact).toUpperCase();
  return isValidRefKey(base) ? base : '';
}

export { BAD_REF_KEYS };
