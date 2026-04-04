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

function buildCategoryLookup(categories) {
  return new Map(
    (Array.isArray(categories) ? categories : [])
      .map((category) => {
        const id = String(category?.id || "").trim();
        return id ? [id, category] : null;
      })
      .filter(Boolean),
  );
}

function resolveCategoryLabel(categoryId, categoryLookup) {
  const normalizedId = String(categoryId || "").trim();
  if (!normalizedId) return "";

  const category = categoryLookup.get(normalizedId);
  if (!category) return "";

  const categoryName = String(category?.name || "").trim();
  const parentId = String(category?.parentId ?? category?.parent_id ?? "").trim();
  if (!parentId) return categoryName;

  const parent = categoryLookup.get(parentId);
  const parentName = String(parent?.name || "").trim();
  if (!parentName) return categoryName;
  return categoryName ? `${parentName} / ${categoryName}` : parentName;
}

export function buildDraftLineItemSummaries(draft, categories) {
  const categoryLookup = buildCategoryLookup(categories);

  return lineItemsFromDraft(draft).map((item, index) => {
    const isAdjustment = item?.receiptLineType === "adjustment";
    const adjustmentLabel = isAdjustment
      ? item?.adjustmentEffect === "subtract"
        ? "ปรับยอดลด"
        : "ปรับยอดเพิ่ม"
      : "";
    const categoryLabel = resolveCategoryLabel(item?.categoryId, categoryLookup);

    return {
      index,
      name: String(item?.name || "").trim() || (isAdjustment ? "รายการปรับยอด" : `รายการ ${index + 1}`),
      amountSatang: Number(item?.amountSatang || 0),
      amountPrefix: isAdjustment && item?.adjustmentEffect === "subtract" ? "-" : "",
      isAdjustment,
      adjustmentLabel,
      categoryLabel,
      metaLabel: isAdjustment
        ? [adjustmentLabel, categoryLabel].filter(Boolean).join(" · ") || "รายการปรับยอด"
        : categoryLabel || "ยังไม่เลือกหมวด",
    };
  });
}
