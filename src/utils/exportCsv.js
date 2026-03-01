// src/utils/exportCsv.js
// Export transactions to CSV with UTF-8 BOM for Excel Thai support.

import { satangToBahtNumber } from "./money";

function escCsv(val) {
  const s = String(val ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
}

function formatDate(d) {
  return String(d || "").slice(0, 10);
}

/**
 * Export transactions to CSV string.
 * @param {Array} transactions
 * @param {Object} opts - { categories, accounts }
 * @returns {string} CSV content with BOM
 */
export function transactionsToCsv(transactions, { categories, accounts } = {}) {
  const catMap = new Map();
  for (const c of [...(categories?.expense || []), ...(categories?.income || [])]) {
    catMap.set(c.id, c);
  }
  const accMap = new Map();
  for (const a of accounts || []) {
    accMap.set(a.id, a);
  }

  const headers = [
    "Date",
    "Type",
    "Amount (THB)",
    "Category",
    "Account",
    "Note",
    "Merchant",
    "Ref",
    "Tags",
    "Transfer",
    "Split",
  ];

  const rows = (transactions || [])
    .filter((t) => t && !t.isSplitParent)
    .map((t) => {
      const cat = catMap.get(t.category);
      const acc = accMap.get(t.accountId);
      const tags = Array.isArray(t.tags) ? t.tags.join("; ") : "";
      const amount = satangToBahtNumber(Number(t.amount || 0));

      return [
        formatDate(t.date),
        t.type || "",
        amount.toFixed(2),
        cat?.name || t.category || "",
        acc?.name || t.accountId || "",
        t.note || "",
        t.merchant || "",
        t.ref || "",
        tags,
        t.isTransfer ? "Yes" : "",
        t.isSplitChild ? "Yes" : "",
      ];
    });

  const lines = [headers, ...rows].map((row) => row.map(escCsv).join(","));

  // UTF-8 BOM for Excel Thai support
  return "\uFEFF" + lines.join("\r\n");
}

/**
 * Download CSV as a file.
 */
export function downloadCsv(csvContent, filename = "transactions.csv") {
  if (typeof window === "undefined") return;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }, 1000);
}
