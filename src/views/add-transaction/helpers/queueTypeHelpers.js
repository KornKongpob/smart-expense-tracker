import { bestMatchAccountCandidate, isCreditAccount } from "../../../utils/accountMatch.js";

function normalizeQueueTxType(rawType) {
  const txType = String(rawType || "").toLowerCase().trim();
  if (txType === "income" || txType === "expense" || txType === "transfer" || txType === "credit_payment") {
    return txType;
  }
  return "expense";
}

function ensureSafeCategoryId(txType, categoryId, ensureCategoryId) {
  const current = String(categoryId || "").trim();
  if (current && current !== "transfer") return current;
  if (typeof ensureCategoryId !== "function") return current;
  return ensureCategoryId(txType === "income" ? "income" : "expense", "other");
}

function buildSuggestedReason(suggestedCategoryId, merchant, fromDigits, toDigits) {
  if (!suggestedCategoryId) return "";
  if (merchant) return `เคยใช้กับ ${merchant}`;
  if (toDigits || fromDigits) return "เคยใช้กับเลขนี้";
  return "เคยใช้บัญชีนี้";
}

export function applyAutomationToQueuePatch(basePatch, autoPatch, { accounts, ensureCategoryId } = {}) {
  const next = { ...(basePatch || {}), ...(autoPatch || {}) };
  const txType = normalizeQueueTxType(next.txType);
  const accountList = Array.isArray(accounts) ? accounts : [];

  next.txType = txType;

  if (txType === "transfer" || txType === "credit_payment") {
    next.categoryId = "transfer";
    next.splitByCategory = false;
    next.groups = [];
    next.fromAccountId = String(next.fromAccountId || next.accountId || "").trim();
    next.toAccountId = String(next.toAccountId || "").trim();
    next.accountId = String(next.accountId || next.fromAccountId || "").trim();

    if (txType === "credit_payment") {
      const toAcc = accountList.find((a) => a?.id === next.toAccountId) || null;
      const fromAcc = accountList.find((a) => a?.id === next.fromAccountId) || null;
      if (next.toAccountId && (!toAcc || !isCreditAccount(toAcc))) next.toAccountId = "";
      if (next.fromAccountId && (!fromAcc || isCreditAccount(fromAcc))) next.fromAccountId = "";
      next.accountId = next.fromAccountId || "";
    }

    if (next.fromAccountId && next.toAccountId && next.fromAccountId === next.toAccountId) {
      next.toAccountId = "";
    }
  } else {
    next.accountId = String(next.accountId || next.fromAccountId || next.toAccountId || "").trim();
    if (txType === "income") {
      next.splitByCategory = false;
      next.groups = [];
    }
    if (!next.categoryId || next.categoryId === "transfer") {
      next.categoryId = ensureSafeCategoryId(txType, next.categoryId, ensureCategoryId);
    }
  }

  if (txType === "transfer" || txType === "credit_payment") next.categoryId = "transfer";

  return next;
}

export function normalizeQueueItemType(item, { accounts, ensureCategoryId } = {}) {
  const base = item && typeof item === "object" ? item : {};
  const txType = normalizeQueueTxType(base.txType || base.type);
  const accountList = Array.isArray(accounts) ? accounts : [];
  const next = { ...base, txType };

  if (txType === "transfer" || txType === "credit_payment") {
    next.categoryId = "transfer";
    next.splitByCategory = false;
    next.isInstallment = false;
    next.items = [];
    next.groups = [];
    next.fromAccountId = String(next.fromAccountId || next.accountId || "").trim();
    next.toAccountId = String(next.toAccountId || "").trim();
    next.accountId = String(next.accountId || next.fromAccountId || "").trim();

    if (txType === "credit_payment") {
      const fromAcc = accountList.find((a) => a?.id === next.fromAccountId) || null;
      const toAcc = accountList.find((a) => a?.id === next.toAccountId) || null;
      if (next.fromAccountId && (!fromAcc || isCreditAccount(fromAcc))) next.fromAccountId = "";
      if (next.toAccountId && (!toAcc || !isCreditAccount(toAcc))) next.toAccountId = "";
      next.accountId = next.fromAccountId || "";
    }

    if (next.fromAccountId && next.toAccountId && next.fromAccountId === next.toAccountId) {
      next.toAccountId = "";
    }

    return next;
  }

  next.accountId = String(next.accountId || next.fromAccountId || next.toAccountId || "").trim();

  if (txType === "income") {
    next.splitByCategory = false;
    next.isInstallment = false;
    next.items = [];
    next.groups = [];
  }

  if (!next.categoryId || next.categoryId === "transfer") {
    next.categoryId = ensureSafeCategoryId(txType, next.categoryId, ensureCategoryId);
  }

  return next;
}

export function buildQueueTypeChangeItem(
  item,
  nextType,
  { accounts, ensureCategoryId, suggestCategoryId } = {}
) {
  const base = item && typeof item === "object" ? item : {};
  const txType = normalizeQueueTxType(nextType);
  const accountList = Array.isArray(accounts) ? accounts : [];
  const fallbackAcc = accountList[0]?.id || "";
  const merchant = String(base.merchant || base.note || "").trim();
  const fromDigits = String(base.fromDigits || "").trim();
  const toDigits = String(base.toDigits || "").trim();

  if (txType === "transfer") {
    return {
      ...base,
      txType: "transfer",
      splitByCategory: false,
      isInstallment: false,
      groups: [],
      categoryId: "transfer",
      fromAccountId: String(base.fromAccountId || base.accountId || "").trim(),
      toAccountId: String(base.toAccountId || "").trim(),
      accountId: String(base.accountId || base.fromAccountId || "").trim(),
      suggestedCategoryId: "",
      suggestedReason: "",
    };
  }

  if (txType === "credit_payment") {
    const baseFrom = accountList.find((a) => a?.id === base.fromAccountId) || null;
    const baseTo = accountList.find((a) => a?.id === base.toAccountId) || null;
    const baseAccount = accountList.find((a) => a?.id === base.accountId) || null;
    const pickedFrom =
      baseFrom && !isCreditAccount(baseFrom)
        ? String(base.fromAccountId || "")
        : baseAccount && !isCreditAccount(baseAccount)
          ? String(base.accountId || "")
          : "";

    const pickedTo = baseTo && isCreditAccount(baseTo) ? String(base.toAccountId || "") : "";

    return {
      ...base,
      txType: "credit_payment",
      splitByCategory: false,
      isInstallment: false,
      groups: [],
      categoryId: "transfer",
      fromAccountId: pickedFrom,
      toAccountId: pickedTo,
      accountId: pickedFrom || "",
      suggestedCategoryId: "",
      suggestedReason: "",
      note: base.note || "ชำระบัตรเครดิต",
    };
  }

  const suggested = typeof suggestCategoryId === "function" ? suggestCategoryId(txType, merchant, fromDigits, toDigits) || "" : "";

  let nextCategoryId = suggested || base.categoryId || "";
  if (!nextCategoryId || nextCategoryId === "transfer") {
    nextCategoryId = ensureSafeCategoryId(txType, nextCategoryId, ensureCategoryId);
  }

  const candFrom = bestMatchAccountCandidate(accountList, fromDigits);
  const candTo = bestMatchAccountCandidate(accountList, toDigits);

  let pickedAccountId = "";
  if (candFrom.score === 0 && candTo.score === 0) {
    pickedAccountId = base.accountId || base.fromAccountId || base.toAccountId || fallbackAcc;
  } else if (candFrom.score > candTo.score) {
    pickedAccountId = candFrom.id;
  } else if (candTo.score > candFrom.score) {
    pickedAccountId = candTo.id;
  } else {
    pickedAccountId = candFrom.id || candTo.id || base.accountId || base.fromAccountId || fallbackAcc;
  }

  return {
    ...base,
    txType,
    splitByCategory: false,
    isInstallment: false,
    groups: txType === "expense" ? base.groups : [],
    categoryId: nextCategoryId,
    accountId: pickedAccountId || fallbackAcc,
    suggestedCategoryId: suggested || "",
    suggestedReason: buildSuggestedReason(suggested, merchant, fromDigits, toDigits),
  };
}
