import { signedReceiptGroupSatang } from "../../utils/receiptAdjustments.js";

export function lineItemsFromDraft(draft) {
  return Array.isArray(draft?.lineItems) ? draft.lineItems : [];
}

export function countPurchasedLineItems(items) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => item?.receiptLineType !== "adjustment" && Number(item?.amountSatang || 0) > 0,
  ).length;
}

export function replaceDraftLineItems(draft, nextItems) {
  const lineItems = Array.isArray(nextItems) ? nextItems : [];
  const nextDraft = {
    ...draft,
    lineItems,
  };

  if (Array.isArray(draft?.receiptGroups)) {
    nextDraft.receiptGroups = lineItems;
  }

  if (draft?.splitByCategory === true) {
    nextDraft.splitByCategory = countPurchasedLineItems(lineItems) >= 2;
  }

  return nextDraft;
}

export function updateDraftLineItems(draft, updater) {
  const currentItems = lineItemsFromDraft(draft);
  const nextItems = typeof updater === "function" ? updater(currentItems) : updater;
  return replaceDraftLineItems(draft, nextItems);
}

export function summarizeDraftLineItems(draft) {
  const lineItems = lineItemsFromDraft(draft);
  const grossTotalSatang = lineItems.reduce((sum, item) => sum + Number(item?.amountSatang || 0), 0);
  const netTotalSatang = lineItems.reduce(
    (sum, item) =>
      sum +
      signedReceiptGroupSatang({
        amount: Number(item?.amountSatang || 0),
        adjustmentEffect: item?.adjustmentEffect,
      }),
    0,
  );
  const adjustmentCount = lineItems.filter((item) => item?.receiptLineType === "adjustment").length;
  const differenceSatang = Number(draft?.amountSatang || 0) - netTotalSatang;

  return {
    grossTotalSatang,
    netTotalSatang,
    differenceSatang,
    adjustmentCount,
    hasAdjustments: adjustmentCount > 0,
  };
}
