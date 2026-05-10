import { isCreditAccount } from "./accountMatch.js";

const TX_TYPES = new Set(["expense", "income", "transfer", "credit_payment"]);

function clean(value) {
  return String(value || "").trim();
}

function accountIdOf(account) {
  return clean(account?.id ?? account?.accountId ?? account?.account_id);
}

export function normalizeScannedTxType(value) {
  const txType = clean(value).toLowerCase();
  return TX_TYPES.has(txType) ? txType : "expense";
}

export function normalizeScannedDocType(value) {
  const docType = clean(value).toLowerCase();
  if (docType === "receipt" || docType === "transfer_slip" || docType === "bill_payment") return docType;
  return "unknown";
}

export function hasScannedLineItems(scanResult) {
  return (
    Array.isArray(scanResult?.items) &&
    scanResult.items.some((item) => {
      const name = clean(item?.name || item?.title || item?.desc);
      const amount =
        Number(item?.line_total) ||
        Number(item?.total) ||
        Number(item?.amount) ||
        Number(item?.lineTotal) ||
        0;
      return Boolean(name) && Number.isFinite(amount) && amount > 0;
    })
  );
}

export function resolveScannedDocType({ docType, aiTxType, hasLineItems } = {}) {
  if (hasLineItems === true) return "receipt";
  const normalizedDocType = normalizeScannedDocType(docType);
  if (normalizedDocType !== "unknown") return normalizedDocType;
  const normalizedTxType = normalizeScannedTxType(aiTxType);
  if (normalizedTxType === "transfer" || normalizedTxType === "credit_payment") return "transfer_slip";
  return "unknown";
}

function looksLikeIncomeText(text) {
  const haystack = clean(text).toLowerCase();
  return (
    haystack.includes("เงินเข้า") ||
    haystack.includes("รับโอน") ||
    haystack.includes("โอนเข้า") ||
    haystack.includes("deposit") ||
    haystack.includes("credited") ||
    haystack.includes("receive") ||
    haystack.includes("received") ||
    haystack.includes("incoming") ||
    haystack.includes("refund") ||
    haystack.includes("salary") ||
    haystack.includes("เงินเดือน")
  );
}

function isStrongIncomeSuggestion(aiTxType, contextText) {
  return normalizeScannedTxType(aiTxType) === "income" && looksLikeIncomeText(contextText);
}

function hasMatchedAccount(id, account) {
  return Boolean(clean(id) || accountIdOf(account));
}

function resolveInternalMovement({ matchedFromId, matchedToId, matchedFromAcc, matchedToAcc }) {
  const hasFrom = hasMatchedAccount(matchedFromId, matchedFromAcc);
  const hasTo = hasMatchedAccount(matchedToId, matchedToAcc);
  const fromId = clean(matchedFromId) || accountIdOf(matchedFromAcc);
  const toId = clean(matchedToId) || accountIdOf(matchedToAcc);

  if (!(hasFrom && hasTo)) return "";
  if (fromId && toId && fromId === toId) return "";

  const fromIsCredit = Boolean(matchedFromAcc && isCreditAccount(matchedFromAcc));
  const toIsCredit = Boolean(matchedToAcc && isCreditAccount(matchedToAcc));
  if (toIsCredit && !fromIsCredit) return "credit_payment";
  return "transfer";
}

export function resolveScannedTxTypeFromAccounts({
  docType,
  aiTxType,
  hasLineItems,
  matchedFromId,
  matchedToId,
  matchedFromAcc,
  matchedToAcc,
  contextText,
} = {}) {
  const normalizedDocType = normalizeScannedDocType(docType);
  const normalizedAiTxType = normalizeScannedTxType(aiTxType);
  const lineItemsPresent = hasLineItems === true;
  const hasFrom = hasMatchedAccount(matchedFromId, matchedFromAcc);
  const hasTo = hasMatchedAccount(matchedToId, matchedToAcc);
  const internalMovement = resolveInternalMovement({
    matchedFromId,
    matchedToId,
    matchedFromAcc,
    matchedToAcc,
  });

  if (normalizedDocType === "receipt") {
    return isStrongIncomeSuggestion(normalizedAiTxType, contextText) ? "income" : "expense";
  }

  if (normalizedDocType === "transfer_slip" || normalizedDocType === "bill_payment") {
    if (internalMovement) return internalMovement;
    if (hasFrom && !hasTo) return "expense";
    if (!hasFrom && hasTo) return "income";
    return isStrongIncomeSuggestion(normalizedAiTxType, contextText) ? "income" : "expense";
  }

  if (lineItemsPresent) {
    return isStrongIncomeSuggestion(normalizedAiTxType, contextText) ? "income" : "expense";
  }

  if (internalMovement) return internalMovement;
  if (hasFrom && !hasTo) return "expense";
  if (!hasFrom && hasTo) return "income";
  return isStrongIncomeSuggestion(normalizedAiTxType, contextText) ? "income" : "expense";
}

export default {
  normalizeScannedTxType,
  normalizeScannedDocType,
  hasScannedLineItems,
  resolveScannedDocType,
  resolveScannedTxTypeFromAccounts,
};
