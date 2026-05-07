// src/utils/hashRouter.js
// Lightweight hash-based router for SPA navigation.
// Syncs URL hash ↔ app view state. Supports browser back/forward.

const VALID_VIEWS = new Set([
  "dashboard", "add", "accounts", "stats", "plan", "assistant", "budgets",
  "categories", "goals", "debts", "bills", "recurring", "rules", "inbox",
  "merchants", "more",
]);

const DEFAULT_VIEW = "dashboard";

/**
 * Parse current hash into { view, params }
 * Examples:
 *   #/dashboard        → { view: "dashboard", params: {} }
 *   #/accounts         → { view: "accounts", params: {} }
 *   #/stats?period=month → { view: "stats", params: { period: "month" } }
 */
export function parseHash(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const view = String(path || "").toLowerCase().trim();
  const params = {};

  if (qs) {
    try {
      for (const pair of qs.split("&")) {
        const [k, v] = pair.split("=");
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
      }
    } catch { /* ignore */ }
  }

  return {
    view: VALID_VIEWS.has(view) ? view : DEFAULT_VIEW,
    params,
  };
}

/**
 * Build hash string from view + optional params
 */
export function buildHash(view, params = {}) {
  const v = VALID_VIEWS.has(view) ? view : DEFAULT_VIEW;
  const entries = Object.entries(params).filter(([, val]) => val != null && val !== "");
  const qs = entries.length
    ? "?" + entries.map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`).join("&")
    : "";
  return `#/${v}${qs}`;
}

/**
 * Set hash without triggering extra hashchange if already correct
 */
export function setHash(view, params = {}) {
  const target = buildHash(view, params);
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

/**
 * Replace hash (no new history entry)
 */
export function replaceHash(view, params = {}) {
  const target = buildHash(view, params);
  if (window.location.hash !== target) {
    window.history.replaceState(null, "", target);
  }
}

/**
 * Get current view from hash
 */
export function getCurrentView() {
  return parseHash(window.location.hash).view;
}
