import { satangToBahtNumber } from "./money";
import { normalizeTransactionTime } from "./scanDateTime.js";

function escCsv(val) {
  const s = String(val ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
}

function toId(value) {
  return String(value ?? "").trim();
}

function formatDate(d) {
  return String(d || "").slice(0, 10);
}

function formatTime(transaction) {
  return normalizeTransactionTime(
    transaction?.transactionTime ??
      transaction?.transaction_time ??
      transaction?.raw?.transactionTime ??
      transaction?.raw?.transaction_time ??
      transaction?.raw?.time ??
      transaction?.time,
  );
}

function pickFirstString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function getTransactionKind(transaction) {
  const kind = pickFirstString(transaction?.kind, transaction?.type).toLowerCase();
  if (kind === "income" || kind === "expense" || kind === "transfer") return kind;
  return transaction?.isTransfer === true ? "transfer" : "expense";
}

function getKindLabel(kind) {
  if (kind === "income") return "Income";
  if (kind === "transfer") return "Transfer";
  return "Expense";
}

function getAmountSatang(transaction) {
  const runtimeAmount = Number(transaction?.amount_satang);
  if (Number.isFinite(runtimeAmount)) return runtimeAmount;

  const legacyAmount = Number(transaction?.amount);
  if (Number.isFinite(legacyAmount)) return legacyAmount;

  return 0;
}

function buildCategoryMap(categories) {
  const rows = Array.isArray(categories)
    ? categories
    : [
        ...(Array.isArray(categories?.expense) ? categories.expense : []),
        ...(Array.isArray(categories?.income) ? categories.income : []),
      ];

  return new Map(
    rows
      .map((category) => [toId(category?.id ?? category?.categoryId), category])
      .filter(([id]) => id),
  );
}

function buildAccountMap(accounts) {
  const rows = Array.isArray(accounts) ? accounts : [];
  return new Map(
    rows
      .map((account) => [toId(account?.id ?? account?.accountId), account])
      .filter(([id]) => id),
  );
}

function getCategoryLabel(transaction, categoryMap, kind) {
  if (kind === "transfer") return "";
  const categoryId = toId(transaction?.category_id ?? transaction?.category ?? transaction?.categoryId);
  return categoryMap.get(categoryId)?.name || categoryId;
}

function getAccountLabel(transaction, accountMap, kind) {
  if (kind === "transfer") {
    const fromId = toId(transaction?.from_account_id ?? transaction?.fromAccountId);
    const toAccountId = toId(transaction?.to_account_id ?? transaction?.toAccountId);
    const fromLabel = accountMap.get(fromId)?.name || fromId;
    const toLabel = accountMap.get(toAccountId)?.name || toAccountId;

    if (fromLabel && toLabel) return `${fromLabel} -> ${toLabel}`;
    return fromLabel || toLabel || "";
  }

  const accountId = toId(transaction?.account_id ?? transaction?.accountId);
  return accountMap.get(accountId)?.name || accountId;
}

function getReference(transaction) {
  return pickFirstString(transaction?.reference, transaction?.ref);
}

function getTags(transaction) {
  const tags = Array.isArray(transaction?.tags)
    ? transaction.tags
    : Array.isArray(transaction?.raw?.tags)
      ? transaction.raw.tags
      : [];
  return tags.map((tag) => String(tag ?? "").trim()).filter(Boolean).join("; ");
}

function isTransfer(transaction, kind) {
  return kind === "transfer" || transaction?.isTransfer === true;
}

function isSplit(transaction) {
  return (
    transaction?.is_split_parent === true ||
    transaction?.is_split_child === true ||
    transaction?.isSplitParent === true ||
    transaction?.isSplitChild === true
  );
}

export function transactionsToCsv(transactions, { categories, accounts } = {}) {
  const catMap = buildCategoryMap(categories);
  const accMap = buildAccountMap(accounts);

  const headers = [
    "Date",
    "Time",
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
    .filter(Boolean)
    .map((t) => {
      const kind = getTransactionKind(t);
      const amount = satangToBahtNumber(getAmountSatang(t));

      return [
        formatDate(t?.date || t?.created_at),
        formatTime(t),
        getKindLabel(kind),
        amount.toFixed(2),
        getCategoryLabel(t, catMap, kind),
        getAccountLabel(t, accMap, kind),
        t?.note || "",
        t?.merchant || "",
        getReference(t),
        getTags(t),
        isTransfer(t, kind) ? "Yes" : "",
        isSplit(t) ? "Yes" : "",
      ];
    });

  const lines = [headers, ...rows].map((row) => row.map(escCsv).join(","));

  return "\uFEFF" + lines.join("\r\n");
}

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
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore best-effort cleanup errors.
    }
  }, 1000);
}
