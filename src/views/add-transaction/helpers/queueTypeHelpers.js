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
  const defaultAcc = accountList[0]?.id || "";

  next.txType = txType;

  if (txType === "transfer" || txType === "credit_payment") {
    next.categoryId = "transfer";
    next.splitByCategory = false;
    next.groups = [];
    next.fromAccountId = next.fromAccountId || next.accountId || defaultAcc;
    next.toAccountId = next.toAccountId || defaultAcc;

    if (txType === "credit_payment") {
      const credit = accountList.find((a) => a?.type === "credit");
      const nonCredit = accountList.find((a) => a?.type !== "credit");
      const toAcc = accountList.find((a) => a?.id === next.toAccountId);
      const fromAcc = accountList.find((a) => a?.id === next.fromAccountId);
      if (credit && toAcc?.type !== "credit") next.toAccountId = credit.id;
      if (nonCredit && fromAcc?.type === "credit") next.fromAccountId = nonCredit.id;
    }
  } else {
    next.accountId = next.accountId || defaultAcc;
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
  const defaultAcc = accountList[0]?.id || "";
  const next = { ...base, txType };

  if (txType === "transfer" || txType === "credit_payment") {
    next.categoryId = "transfer";
    next.splitByCategory = false;
    next.isInstallment = false;
    next.items = [];
    next.groups = [];
    next.fromAccountId = next.fromAccountId || next.accountId || defaultAcc;
    next.toAccountId = next.toAccountId || defaultAcc;
    next.accountId = next.accountId || next.fromAccountId || defaultAcc;

    if (txType === "credit_payment") {
      const credit = accountList.find((a) => isCreditAccount(a));
      const nonCredit = accountList.find((a) => !isCreditAccount(a));
      const fromAcc = accountList.find((a) => a?.id === next.fromAccountId) || null;
      const toAcc = accountList.find((a) => a?.id === next.toAccountId) || null;
      const fallbackFrom = nonCredit?.id || defaultAcc;
      const fallbackTo = credit?.id || next.toAccountId || defaultAcc;

      if (!fromAcc || isCreditAccount(fromAcc)) next.fromAccountId = fallbackFrom;
      if (!toAcc || !isCreditAccount(toAcc)) next.toAccountId = fallbackTo;
      next.accountId = next.accountId || next.fromAccountId || fallbackFrom;
    }

    return next;
  }

  next.accountId = next.accountId || next.fromAccountId || next.toAccountId || defaultAcc;

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
  { accounts, creditAccounts, nonCreditAccounts, ensureCategoryId, suggestCategoryId } = {}
) {
  const base = item && typeof item === "object" ? item : {};
  const txType = normalizeQueueTxType(nextType);
  const accountList = Array.isArray(accounts) ? accounts : [];
  const creditList = Array.isArray(creditAccounts) ? creditAccounts : accountList.filter((a) => isCreditAccount(a));
  const nonCreditList = Array.isArray(nonCreditAccounts) ? nonCreditAccounts : accountList.filter((a) => !isCreditAccount(a));
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
      fromAccountId: base.fromAccountId || base.accountId || fallbackAcc,
      toAccountId: base.toAccountId || fallbackAcc,
      suggestedCategoryId: "",
      suggestedReason: "",
    };
  }

  if (txType === "credit_payment") {
    const pickedFrom =
      (!base.fromAccountId || isCreditAccount(accountList.find((a) => a.id === base.fromAccountId))) && nonCreditList?.[0]?.id
        ? nonCreditList[0].id
        : base.fromAccountId || base.accountId || nonCreditList?.[0]?.id || fallbackAcc;

    const pickedTo =
      isCreditAccount(accountList.find((a) => a.id === base.toAccountId)) && base.toAccountId
        ? base.toAccountId
        : creditList?.[0]?.id || base.toAccountId || fallbackAcc;

    return {
      ...base,
      txType: "credit_payment",
      splitByCategory: false,
      isInstallment: false,
      groups: [],
      categoryId: "transfer",
      fromAccountId: pickedFrom,
      toAccountId: pickedTo,
      accountId: base.accountId || pickedFrom || fallbackAcc,
      suggestedCategoryId: "",
      suggestedReason: "",
      note: base.note || base.merchant ? base.note : "ชำระบัตรเครดิต",
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
