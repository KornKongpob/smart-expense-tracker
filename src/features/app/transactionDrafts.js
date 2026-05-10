import { canonicalizeCategoryId } from "../../utils/categoryIds.js";
import { buildReceiptSplitPlan, RECEIPT_SAVE_MODES } from "../../domain/receipt/receiptSplitBuilder.js";
import { generateSplitGroupId } from "../../utils/id.js";
import { normalizeTimeHHmm, toISODate } from "../../utils/format.js";
import { normalizeTransactionTime } from "../../utils/scanDateTime.js";
import { ensureSatangInt, parseMoneyToSatang, satangToBahtNumber } from "../../utils/money.js";
import {
  chooseReceiptPaidTotalSatang,
  isAdjustmentLike,
  reconcileReceiptGroups,
} from "../../utils/receiptAdjustments.js";
import {
  deriveReceiptCategoryKey,
  inferCategoryKeyFromText,
  sanitizeCategoryKey,
  splitReceiptItemsToLines,
} from "../../utils/receiptCategorizer.js";

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function rawCategoryId(source) {
  return cleanText(
    source?.categoryId ||
      source?.category_id ||
      source?.category ||
      source?.category_key ||
      source?.key ||
      source?.suggestedCategoryId ||
      source?.suggested_category_id ||
      "",
  );
}

function resolveExpenseLineCategoryId(source, { fallbackName = "Item", fallbackCategoryId = "", adjustmentEffect = "add" } = {}) {
  const raw = rawCategoryId(source);
  const isAdjustment = isAdjustmentLike(source);

  if (isAdjustment) {
    const rawKey = raw.toLowerCase();
    const type = cleanText(source?.adjustmentType || source?.adjustment_type || source?.type, "").toLowerCase();
    if (rawKey === "discount" || type === "discount" || adjustmentEffect === "subtract") return "discount";
    if (rawKey === "service_charge" || type === "service_charge") return "service_charge";
    return (
      sanitizeCategoryKey(raw, { allowAdjustmentCategories: true }) ||
      sanitizeCategoryKey(fallbackCategoryId, { allowAdjustmentCategories: true }) ||
      "fees"
    );
  }

  const sanitizedRaw = sanitizeCategoryKey(raw);
  const sanitizedFallback = sanitizeCategoryKey(fallbackCategoryId);
  const text = [
    source?.itemName,
    source?.name,
    source?.note,
    source?.title,
    source?.label,
    source?.rawName,
    fallbackName,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  const inferred = inferCategoryKeyFromText("expense", text, {
    fallbackCategory: sanitizedRaw || sanitizedFallback || fallbackCategoryId,
  });
  const normalizedRaw = raw.toLowerCase().replace(/\s+/g, " ");
  const shouldPreferText = Boolean(normalizedRaw && sanitizedRaw && normalizedRaw !== sanitizedRaw);

  if (shouldPreferText) return inferred || sanitizedRaw || sanitizedFallback || "other";
  return sanitizedRaw || inferred || sanitizedFallback || "other";
}

function resolveDraftCategoryId(kind, source, options = {}) {
  if (kind === "expense") return resolveExpenseLineCategoryId(source, options);
  return canonicalizeCategoryId(kind, rawCategoryId(source));
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function normalizeAmountUnit(value, fallback = "satang") {
  const unit = String(value || "").trim().toLowerCase();
  if (unit === "baht" || unit === "thb") return "baht";
  if (unit === "satang") return "satang";
  return fallback;
}

function getScanSuggestion(scan) {
  if (scan?.normalized_suggestion && typeof scan.normalized_suggestion === "object") {
    return scan.normalized_suggestion;
  }
  if (scan?.suggestion && typeof scan.suggestion === "object") {
    return scan.suggestion;
  }
  return {};
}

function toSatangAmount(value, unit = "satang", fallback = 0) {
  if (normalizeAmountUnit(unit, "satang") === "baht") {
    return Math.max(0, parseMoneyToSatang(value));
  }
  return Math.max(0, ensureSatangInt(value, fallback));
}

function toBahtAmount(value) {
  return Number(satangToBahtNumber(value || 0).toFixed(2));
}

function normalizeRuntimeKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "income") return "income";
  if (kind === "transfer" || kind === "credit_payment") return "transfer";
  return "expense";
}

function normalizeReceiptSaveMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "split_by_item" || mode === "item" || mode === "items") return RECEIPT_SAVE_MODES.SPLIT_BY_ITEM;
  if (mode === "split_by_category" || mode === "category" || mode === "categories") {
    return RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY;
  }
  return RECEIPT_SAVE_MODES.SINGLE;
}

function sanitizeIsoDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return todayDate();
}

export function todayDate() {
  return toISODate(new Date());
}

function sanitizeDraftTime(value, fallback = "") {
  return normalizeTimeHHmm(value) || normalizeTimeHHmm(fallback) || "";
}

function normalizeQuantity(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDraftEntry(item, kind, { amountUnit = "satang", fallbackName = "Item" } = {}) {
  const source = item && typeof item === "object" ? item : {};
  const amountSatang = toSatangAmount(
    source.amountSatang ?? source.amount ?? source.total ?? source.line_total ?? source.lineTotal,
    amountUnit,
  );
  const adjustment = isAdjustmentLike(source);
  const adjustmentEffectRaw = cleanText(
    source.adjustmentEffect || source.adjustment_effect || source.effect,
    adjustment ? "subtract" : "add",
  ).toLowerCase();
  const adjustmentEffect = adjustmentEffectRaw === "subtract" ? "subtract" : "add";
  const name = cleanText(source.name || source.title || source.label || source.note, "");
  const categoryId = resolveDraftCategoryId(kind, source, {
    fallbackName,
    adjustmentEffect,
  });

  return {
    name: name || (adjustment ? "ส่วนลด/ปรับยอด" : fallbackName),
    amountSatang,
    categoryId: categoryId || "",
    qty: normalizeQuantity(source.qty ?? source.quantity),
    unitPriceSatang:
      source.unitPriceSatang != null ||
      source.unit_price_satang != null ||
      source.unitPrice != null ||
      source.unit_price != null ||
      source.price != null
        ? toSatangAmount(
            source.unitPriceSatang ??
              source.unit_price_satang ??
              source.unitPrice ??
              source.unit_price ??
              source.price,
            amountUnit,
          )
        : null,
    note: cleanText(source.note || source.description || "", ""),
    key: cleanText(source.key || "", ""),
    splitIndex: Math.max(0, toInt(source.splitIndex ?? source.split_index, 0)),
    receiptLineType:
      cleanText(source.receiptLineType || source.receipt_line_type, adjustment ? "adjustment" : "item") ===
      "adjustment"
        ? "adjustment"
        : "item",
    adjustmentEffect,
    adjustmentType: cleanNullableText(source.adjustmentType || source.adjustment_type || source.type),
    children: Array.isArray(source.children)
      ? source.children
          .map((child) => normalizeDraftEntry(child, kind, { amountUnit, fallbackName: "Item" }))
          .filter((child) => child.name || child.amountSatang > 0)
      : null,
    childrenIncludedInParent: source.childrenIncludedInParent === true,
    metadata: source,
  };
}

function normalizeDraftEntries(items, kind, options) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeDraftEntry(item, kind, options))
    .filter((item) => item.name || item.amountSatang > 0);
}

function buildScanReceiptGroups(suggestion, kind, defaultAmountUnit = "baht") {
  const source = suggestion && typeof suggestion === "object" ? suggestion : {};
  const amountUnit = normalizeAmountUnit(source.group_amount_unit || source.amount_unit, defaultAmountUnit);
  if (Array.isArray(source.groups) && source.groups.length) {
    return normalizeDraftEntries(source.groups, kind, { amountUnit, fallbackName: "Item" });
  }

  if (kind === "expense") {
    const fallbackText = `${cleanText(source.merchant)} ${cleanText(source.note)}`.trim();
    const fallbackCategory = source.category_key || source.category || "";
    const targetTotalSatang = toSatangAmount(source.amount, amountUnit, 0);
    const splitLines = splitReceiptItemsToLines(
      "expense",
      {
        items: Array.isArray(source.items) ? source.items : [],
        adjustments: Array.isArray(source.adjustments) ? source.adjustments : [],
        targetTotalSatang: targetTotalSatang > 0 ? targetTotalSatang : null,
      },
      fallbackText,
      fallbackCategory,
    );

    if (splitLines.length) {
      return normalizeDraftEntries(
        splitLines.map((line) => ({
          ...line,
          categoryId: line?.categoryId || line?.category || line?.category_key || line?.key || fallbackCategory,
          amount: line?.amount ?? 0,
          note: line?.name || line?.note || "",
        })),
        kind,
        { amountUnit: "baht", fallbackName: "Item" },
      );
    }
  }

  const items = (Array.isArray(source.items) ? source.items : []).map((item) => ({
    ...item,
    categoryId: item?.categoryId || item?.category || item?.category_key || source.category_key || source.category || "",
    amount: item?.amount ?? item?.total ?? item?.line_total ?? item?.lineTotal ?? 0,
  }));
  const adjustments = (Array.isArray(source.adjustments) ? source.adjustments : []).map((item) => ({
    ...item,
    categoryId:
      item?.categoryId ||
      item?.category ||
      item?.category_key ||
      (String(item?.type || "").trim().toLowerCase() === "discount" ? "discount" : "fees"),
    amount: item?.amount ?? item?.total ?? 0,
    receiptLineType: "adjustment",
    adjustmentEffect: item?.effect || item?.adjustmentEffect || "add",
    adjustmentType: item?.type || item?.adjustmentType || null,
  }));

  return normalizeDraftEntries([...items, ...adjustments], kind, { amountUnit, fallbackName: "Item" });
}

function resolveDraftTotalSatang({ amountSatang, kind, receiptGroups }) {
  if (kind !== "expense" || !receiptGroups.length) return Math.max(0, ensureSatangInt(amountSatang, 0));
  const chosen = chooseReceiptPaidTotalSatang({
    aiTotalSatang: amountSatang,
    groups: receiptGroups.map((group) => ({
      amount: group.amountSatang,
      adjustmentEffect: group.adjustmentEffect,
      receiptLineType: group.receiptLineType,
      categoryId: group.categoryId,
    })),
    toleranceSatang: 200,
  });
  return Math.max(0, ensureSatangInt(chosen?.targetTotalSatang ?? amountSatang, 0));
}

export function sanitizeTransactionDraft(input) {
  const draft = input && typeof input === "object" ? input : {};
  const kind = normalizeRuntimeKind(draft.kind || draft.type || draft.txType || draft.tx_type);
  const amountUnit = normalizeAmountUnit(draft.amountUnit || draft.amount_unit, "satang");
  const lineItems = normalizeDraftEntries(
    Array.isArray(draft.lineItems) ? draft.lineItems : Array.isArray(draft.items) ? draft.items : [],
    kind,
    { amountUnit, fallbackName: "Item" },
  );
  const receiptGroups = normalizeDraftEntries(
    Array.isArray(draft.receiptGroups)
      ? draft.receiptGroups
      : Array.isArray(draft.groups)
      ? draft.groups
      : lineItems,
    kind,
    { amountUnit, fallbackName: "Item" },
  );
  const positivePurchasedItemCount = receiptGroups.filter(
    (item) => item.receiptLineType !== "adjustment" && item.amountSatang > 0,
  ).length;
  const requestedReceiptSaveMode = normalizeReceiptSaveMode(
    draft.receiptSaveMode || draft.receipt_save_mode || draft.saveMode || draft.save_mode || draft.splitMode || draft.split_mode,
  );
  const splitByItem =
    kind === "expense" && requestedReceiptSaveMode === RECEIPT_SAVE_MODES.SPLIT_BY_ITEM && positivePurchasedItemCount >= 2;
  const splitByCategory =
    kind === "expense" &&
    positivePurchasedItemCount >= 2 &&
    (draft.splitByCategory === true || requestedReceiptSaveMode === RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY);
  const receiptSaveMode = splitByItem
    ? RECEIPT_SAVE_MODES.SPLIT_BY_ITEM
    : splitByCategory
      ? RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY
      : RECEIPT_SAVE_MODES.SINGLE;
  const amountSatang = resolveDraftTotalSatang({
    amountSatang: toSatangAmount(draft.amountSatang ?? draft.amount, amountUnit, 0),
    kind,
    receiptGroups,
  });
  const transactionTime = normalizeTransactionTime(
    draft.transactionTime ||
      draft.transaction_time ||
      draft.transactionAt ||
      draft.transaction_at ||
      draft.time ||
      draft.slip_time,
  );

  return {
    kind,
    accountId: kind === "transfer" ? "" : cleanText(draft.accountId || draft.account_id),
    fromAccountId:
      kind === "transfer"
        ? cleanText(draft.fromAccountId || draft.from_account || draft.accountId || draft.account_id)
        : cleanText(draft.fromAccountId || draft.from_account),
    toAccountId:
      kind === "transfer" ? cleanText(draft.toAccountId || draft.to_account) : cleanText(draft.toAccountId || draft.to_account),
    categoryId:
      kind === "transfer"
        ? ""
        : canonicalizeCategoryId(kind, draft.categoryId || draft.category || draft.category_key || ""),
    amountSatang,
    merchant: cleanText(draft.merchant),
    note: cleanText(draft.note),
    reference: cleanText(draft.reference || draft.ref),
    paymentMethod: cleanText(draft.paymentMethod || draft.payment_method),
    date: sanitizeIsoDate(draft.date),
    time: sanitizeDraftTime(transactionTime || draft.time),
    transactionTime,
    docType: cleanText(draft.docType || draft.doc_type),
    lineItems,
    receiptGroups,
    splitByCategory: receiptSaveMode === RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    receiptSaveMode,
    splitGroupId: receiptSaveMode !== RECEIPT_SAVE_MODES.SINGLE ? cleanText(draft.splitGroupId || draft.split_group_id) : "",
    splitCount: Math.max(0, toInt(draft.splitCount ?? draft.split_count, 0)),
    splitLabel: cleanText(draft.splitLabel || draft.split_label),
    amountUnit: "satang",
  };
}

export function normalizeLineItems(items, kind = "expense") {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const source = item && typeof item === "object" ? item : {};
      const amountSatang = Math.max(0, ensureSatangInt(source.amountSatang ?? source.amount ?? source.total, 0));
      return {
        line_order: index,
        name: cleanText(source.name || source.title || source.label, source.receiptLineType === "adjustment" ? "Adjustment" : "Item"),
        category_id: resolveDraftCategoryId(kind, source, {
          fallbackName: source.name || source.title || source.label || "",
          adjustmentEffect:
            cleanText(source.adjustmentEffect || source.adjustment_effect || source.effect, "add").toLowerCase() ===
            "subtract"
              ? "subtract"
              : "add",
        }) || null,
        amount_satang: amountSatang,
        quantity: normalizeQuantity(source.qty ?? source.quantity),
        unit_price_satang:
          source.unitPriceSatang != null || source.unit_price_satang != null || source.unitPrice != null || source.unit_price != null
            ? Math.max(
                0,
                ensureSatangInt(
                  source.unitPriceSatang ??
                    source.unit_price_satang ??
                    source.unitPrice ??
                    source.unit_price,
                  0,
                ),
              )
            : null,
        receipt_line_type:
          cleanText(source.receiptLineType || source.receipt_line_type, isAdjustmentLike(source) ? "adjustment" : "item") ===
          "adjustment"
            ? "adjustment"
            : "item",
        adjustment_effect:
          cleanText(source.adjustmentEffect || source.adjustment_effect || source.effect, "add").toLowerCase() ===
          "subtract"
            ? "subtract"
            : "add",
        adjustment_type: cleanNullableText(source.adjustmentType || source.adjustment_type || source.type),
        metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : source,
      };
    })
    .filter((item) => item.name || item.amount_satang > 0);
}

function normalizeSplitGroups(draft) {
  const rawGroups = Array.isArray(draft.receiptGroups) && draft.receiptGroups.length ? draft.receiptGroups : draft.lineItems;
  const normalizedGroups = rawGroups
    .map((group, index) => ({
      ...group,
      amountSatang: Math.max(0, ensureSatangInt(group.amountSatang ?? group.amount, 0)),
      splitIndex: Math.max(1, toInt(group.splitIndex ?? group.split_index, 0) || index + 1),
      receiptLineType:
        cleanText(group.receiptLineType || group.receipt_line_type, isAdjustmentLike(group) ? "adjustment" : "item") ===
        "adjustment"
          ? "adjustment"
          : "item",
      adjustmentEffect:
        cleanText(group.adjustmentEffect || group.adjustment_effect || group.effect, "add").toLowerCase() === "subtract"
          ? "subtract"
          : "add",
      adjustmentType: cleanNullableText(group.adjustmentType || group.adjustment_type || group.type),
      categoryId:
        resolveDraftCategoryId(draft.kind, group, {
          fallbackName: group.name || group.note || group.title || group.label || "",
          fallbackCategoryId: draft.categoryId,
          adjustmentEffect:
            cleanText(group.adjustmentEffect || group.adjustment_effect || group.effect, "add").toLowerCase() ===
            "subtract"
              ? "subtract"
              : "add",
        }) || "",
      name: cleanText(group.name || group.note || group.title || group.label, ""),
      note: cleanText(group.note || group.name || group.title || group.label, ""),
    }))
    .filter((group) => group.amountSatang > 0 || group.name);

  const reconciled = reconcileReceiptGroups(
    normalizedGroups.map((group) => ({
      key: group.key,
      categoryId: group.categoryId || "",
      amount: group.amountSatang,
      note: group.note || group.name || "",
      receiptLineType: group.receiptLineType,
      adjustmentType: group.adjustmentType,
      adjustmentEffect: group.adjustmentEffect,
      splitIndex: group.splitIndex,
      children: group.children || null,
      childrenIncludedInParent: group.childrenIncludedInParent === true,
    })),
    draft.amountSatang,
    {
      ensureCategoryId: (key) => sanitizeCategoryKey(key, { allowAdjustmentCategories: true }) || key,
      baseLineCountMin: 2,
    },
  );

  return (Array.isArray(reconciled.groups) ? reconciled.groups : [])
    .map((group) => normalizeDraftEntry(group, "expense", { amountUnit: "satang", fallbackName: "Item" }))
    .map((group, index) => ({
      ...group,
      splitIndex: Math.max(1, toInt(group.splitIndex, 0) || index + 1),
      note: cleanText(group.note || group.name, ""),
    }))
    .filter((group) => group.amountSatang > 0 || group.name);
}

function buildBaseTransactionRow({
  userId,
  kind,
  draft,
  source,
  scanDocumentId = null,
  attachment = null,
  amountSatang,
  categoryId,
  note,
  accountId,
  fromAccountId = null,
  toAccountId = null,
  split = {},
  receiptLineType = "item",
  adjustmentEffect = "add",
  adjustmentType = null,
  raw = {},
}) {
  return {
    user_id: userId,
    legacy_id: null,
    scan_document_id: scanDocumentId,
    kind,
    status: "posted",
    account_id: kind === "transfer" ? null : accountId || null,
    from_account_id: kind === "transfer" ? fromAccountId || null : null,
    to_account_id: kind === "transfer" ? toAccountId || null : null,
    category_id: kind === "transfer" ? null : categoryId || null,
    merchant: cleanNullableText(draft.merchant),
    merchant_key: null,
    note: cleanNullableText(note),
    reference: cleanNullableText(draft.reference),
    payment_method: cleanNullableText(draft.paymentMethod),
    amount_satang: Math.max(0, ensureSatangInt(amountSatang, 0)),
    currency: "THB",
    date: draft.date,
    attachment_path: attachment?.path || null,
    attachment_name: attachment?.fileName || null,
    attachment_mime_type: attachment?.mimeType || null,
    is_split_parent: split.isSplitParent === true,
    is_split_child: split.isSplitChild === true,
    split_group_id: cleanNullableText(split.splitGroupId),
    split_parent_id: split.splitParentId ?? null,
    split_index: split.splitIndex ?? null,
    split_count: split.splitCount ?? null,
    split_label: cleanNullableText(split.splitLabel),
    receipt_line_type: receiptLineType === "adjustment" ? "adjustment" : "item",
    adjustment_effect: adjustmentEffect === "subtract" ? "subtract" : "add",
    adjustment_type: cleanNullableText(adjustmentType),
    raw: {
      source,
      docType: draft.docType || null,
      time: draft.time || null,
      transactionTime: draft.transactionTime || draft.transaction_time || draft.time || null,
      splitByCategory: draft.splitByCategory === true,
      receiptSaveMode: draft.receiptSaveMode || null,
      lineItems: draft.lineItems,
      receiptGroups: draft.receiptGroups,
      ...raw,
    },
  };
}

export function buildTransactionSavePlan({
  draft,
  userId,
  source = "manual",
  scanDocumentId = null,
  attachment = null,
} = {}) {
  const sanitized = sanitizeTransactionDraft(draft);

  if (sanitized.kind === "transfer") {
    return {
      mode: "single",
      sanitized,
      row: buildBaseTransactionRow({
        userId,
        kind: "transfer",
        draft: sanitized,
        source,
        scanDocumentId,
        attachment,
        amountSatang: sanitized.amountSatang,
        categoryId: null,
        note: sanitized.note,
        accountId: null,
        fromAccountId: sanitized.fromAccountId,
        toAccountId: sanitized.toAccountId,
      }),
      lineItems: [],
    };
  }

  const shouldSplit =
    sanitized.kind === "expense" &&
    sanitized.receiptSaveMode !== RECEIPT_SAVE_MODES.SINGLE &&
    sanitized.receiptGroups.filter((group) => group.receiptLineType !== "adjustment" && group.amountSatang > 0).length >= 2;

  if (!shouldSplit) {
    return {
      mode: "single",
      sanitized,
      row: buildBaseTransactionRow({
        userId,
        kind: sanitized.kind,
        draft: sanitized,
        source,
        scanDocumentId,
        attachment,
        amountSatang: sanitized.amountSatang,
        categoryId: sanitized.categoryId,
        note: sanitized.note,
        accountId: sanitized.accountId,
      }),
      lineItems: normalizeLineItems(sanitized.lineItems, sanitized.kind),
    };
  }

  const groups = normalizeSplitGroups(sanitized);
  const splitGroupId = cleanText(sanitized.splitGroupId, generateSplitGroupId());
  const splitLabel = cleanText(sanitized.splitLabel, sanitized.merchant || sanitized.note || "Split");
  const receiptPlan = buildReceiptSplitPlan({
    lines: groups.map((group) => ({
      ...group,
      amountSatang: group.amountSatang,
      categoryId: group.categoryId || sanitized.categoryId,
      name: group.name || group.note,
      receiptLineType: group.receiptLineType,
      adjustmentEffect: group.adjustmentEffect,
      adjustmentType: group.adjustmentType,
      children: group.children || null,
      childrenIncludedInParent: group.childrenIncludedInParent === true,
    })),
    mode:
      sanitized.receiptSaveMode === RECEIPT_SAVE_MODES.SPLIT_BY_ITEM
        ? RECEIPT_SAVE_MODES.SPLIT_BY_ITEM
        : RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    baseTransaction: {
      amount: sanitized.amountSatang,
      accountId: sanitized.accountId,
      date: sanitized.date,
      time: sanitized.time,
      transactionTime: sanitized.transactionTime,
      merchant: sanitized.merchant,
      note: sanitized.note,
      paymentMethod: sanitized.paymentMethod,
      ref: sanitized.reference,
      source,
    },
    fallbackCategoryId: sanitized.categoryId,
    splitGroupId,
    splitLabel,
  });
  const receiptParent = receiptPlan.parent || {};
  const receiptChildren = Array.isArray(receiptPlan.children) ? receiptPlan.children : [];
  const splitCount = receiptChildren.length;
  const parentCategoryId = cleanText(receiptParent.categoryId || receiptParent.category, sanitized.categoryId);
  const parentAmountSatang = Math.max(0, ensureSatangInt(receiptParent.amount, sanitized.amountSatang));
  const parentReceiptLines = Array.isArray(receiptParent.receiptLines) ? receiptParent.receiptLines : groups;
  const groupedReceiptGroups = receiptChildren.map((child, index) => {
    const receiptLines = Array.isArray(child.receiptLines) ? child.receiptLines : [];
    return {
      key: child.categoryId || child.category || `split_${index + 1}`,
      name: child.itemName || child.note || `Split ${index + 1}`,
      note: child.note || child.itemName || "",
      amountSatang: Math.max(0, ensureSatangInt(child.amount, 0)),
      categoryId: child.categoryId || child.category || sanitized.categoryId,
      splitIndex: index + 1,
      receiptLineType: child.receiptLineType === "adjustment" ? "adjustment" : "item",
      adjustmentEffect: child.adjustmentEffect === "subtract" ? "subtract" : "add",
      adjustmentType: child.adjustmentType || null,
      children: receiptLines,
      childrenIncludedInParent: false,
    };
  });

  const parentRow = buildBaseTransactionRow({
    userId,
    kind: "expense",
    draft: sanitized,
    source,
    scanDocumentId,
    attachment,
    amountSatang: parentAmountSatang,
    categoryId: parentCategoryId,
    note: sanitized.note,
    accountId: sanitized.accountId,
    split: {
      isSplitParent: true,
      splitGroupId,
      splitCount,
      splitLabel,
    },
    raw: {
      receiptItemsSubtotalSatang: receiptPlan.reconciliation?.itemSubtotalSatang || 0,
      receiptDiscountSatang: receiptPlan.reconciliation?.discountSatang || 0,
      receiptSurchargeSatang: receiptPlan.reconciliation?.surchargeSatang || 0,
      receiptDifferenceSatang: receiptPlan.reconciliation?.differenceSatang || 0,
      receiptBalanced: receiptPlan.reconciliation?.balanced === true,
      receiptSaveMode: sanitized.receiptSaveMode,
      receiptLines: parentReceiptLines,
    },
  });

  const childRows = receiptChildren.map((child, index) =>
    buildBaseTransactionRow({
      userId,
      kind: "expense",
      draft: sanitized,
      source,
      scanDocumentId,
      attachment,
      amountSatang: child.amount,
      categoryId: child.categoryId || child.category || sanitized.categoryId,
      note: child.note || child.itemName || sanitized.note,
      accountId: sanitized.accountId,
      split: {
        isSplitChild: true,
        splitGroupId,
        splitParentId: null,
        splitIndex: Math.max(1, toInt(child.splitIndex, 0) || index + 1),
        splitCount,
        splitLabel,
      },
      receiptLineType: child.receiptLineType,
      adjustmentEffect: child.adjustmentEffect,
      adjustmentType: child.adjustmentType,
      raw: {
        receiptLines: Array.isArray(child.receiptLines) ? child.receiptLines : [],
        splitGroup: groupedReceiptGroups[index] || null,
      },
    }),
  );

  return {
    mode: "split",
    sanitized: {
      ...sanitized,
      splitByCategory: sanitized.receiptSaveMode === RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
      receiptSaveMode: sanitized.receiptSaveMode,
      splitGroupId,
      splitCount,
      splitLabel,
      receiptGroups: groupedReceiptGroups,
      lineItems: groupedReceiptGroups,
      amountSatang: parentAmountSatang,
    },
    parentRow,
    childRows,
    lineItems: [],
  };
}

function buildSuggestionGroupsForStorage(groups) {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    key: group.key || null,
    name: group.name || null,
    note: group.note || null,
    amount: toBahtAmount(group.amountSatang),
    category_key: group.categoryId || group.category_key || null,
    receipt_line_type: group.receiptLineType,
    adjustment_effect: group.adjustmentEffect,
    adjustment_type: group.adjustmentType || null,
    split_index: group.splitIndex || null,
    qty: group.qty ?? null,
    unit_price: group.unitPriceSatang != null ? toBahtAmount(group.unitPriceSatang) : null,
    children_included_in_parent: group.childrenIncludedInParent === true,
    children: Array.isArray(group.children) ? buildSuggestionGroupsForStorage(group.children) : null,
  }));
}

export function buildApprovedSuggestion(scan, draft) {
  const sanitized = sanitizeTransactionDraft(draft);
  const baseSuggestion = getScanSuggestion(scan);
  const groups = Array.isArray(sanitized.receiptGroups) ? sanitized.receiptGroups : [];
  const items = groups.filter((group) => group.receiptLineType !== "adjustment");
  const adjustments = groups.filter((group) => group.receiptLineType === "adjustment");
  const derivedCategoryKey =
    sanitized.kind === "transfer"
      ? null
      : deriveReceiptCategoryKey(
          sanitized.kind,
          groups,
          `${cleanText(sanitized.merchant)} ${cleanText(sanitized.note)}`.trim(),
          sanitized.categoryId || baseSuggestion.category_key || baseSuggestion.category || "",
        );

  return {
    ...baseSuggestion,
    amount_unit: "baht",
    group_amount_unit: "baht",
    tx_type: sanitized.kind === "transfer" ? "transfer" : sanitized.kind,
    doc_type: sanitized.docType || baseSuggestion.doc_type || null,
    amount: toBahtAmount(sanitized.amountSatang),
    date: sanitized.date,
    time: sanitized.time || null,
    transactionTime: sanitized.transactionTime || sanitized.time || "",
    merchant: sanitized.merchant || null,
    note: sanitized.note || null,
    ref: sanitized.reference || null,
    category_key: derivedCategoryKey || null,
    payment_method: sanitized.paymentMethod || null,
    account_id: sanitized.kind === "transfer" ? null : sanitized.accountId || null,
    from_account: sanitized.kind === "transfer" ? sanitized.fromAccountId || null : baseSuggestion.from_account || null,
    to_account: sanitized.kind === "transfer" ? sanitized.toAccountId || null : baseSuggestion.to_account || null,
    split_by_category: sanitized.receiptSaveMode === RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY,
    receipt_save_mode: sanitized.receiptSaveMode,
    split_group_id: sanitized.receiptSaveMode !== RECEIPT_SAVE_MODES.SINGLE ? sanitized.splitGroupId || null : null,
    split_count: sanitized.receiptSaveMode !== RECEIPT_SAVE_MODES.SINGLE ? sanitized.receiptGroups.length : null,
    split_label: sanitized.receiptSaveMode !== RECEIPT_SAVE_MODES.SINGLE ? sanitized.splitLabel || null : null,
    items: buildSuggestionGroupsForStorage(items),
    adjustments: adjustments.map((group) => ({
      name: group.note || group.name || null,
      amount: toBahtAmount(group.amountSatang),
      effect: group.adjustmentEffect,
      type: group.adjustmentType || null,
      category_key: group.categoryId || null,
    })),
    groups: buildSuggestionGroupsForStorage(groups),
  };
}

export function getScanDisplayAmountSatang(scan) {
  const suggestion = getScanSuggestion(scan);
  const normalizedDraftAmountSatang = Number(scanToDraft(scan)?.amountSatang || 0);
  const amountUnit = normalizeAmountUnit(suggestion?.amount_unit || suggestion?.amountUnit, "");

  if (!amountUnit || suggestion?.amount == null || suggestion?.amount === "") {
    return normalizedDraftAmountSatang;
  }

  const convertedAmountSatang = toSatangAmount(suggestion.amount, amountUnit, normalizedDraftAmountSatang);
  return convertedAmountSatang === normalizedDraftAmountSatang ? convertedAmountSatang : normalizedDraftAmountSatang;
}

export function scanToDraft(scan) {
  const suggestion = getScanSuggestion(scan);
  const kind = normalizeRuntimeKind(suggestion?.tx_type || suggestion?.kind || suggestion?.type);
  const amountUnit = normalizeAmountUnit(suggestion?.amount_unit || suggestion?.amountUnit, "baht");
  const receiptGroups = kind === "transfer" ? [] : buildScanReceiptGroups(suggestion, kind, amountUnit);
  const nonAdjustmentItemCount = receiptGroups.filter(
    (group) => group.receiptLineType !== "adjustment" && group.amountSatang > 0,
  ).length;
  const splitByCategory = kind === "expense" && nonAdjustmentItemCount >= 2;
  const derivedCategoryId =
    kind === "transfer"
      ? ""
      : deriveReceiptCategoryKey(
          kind,
          receiptGroups,
          `${cleanText(suggestion?.merchant)} ${cleanText(suggestion?.note)}`.trim(),
          scan?.matched_category_id ||
            scan?.matchedCategoryId ||
            suggestion?.category_key ||
            suggestion?.category ||
            "",
        );

  return sanitizeTransactionDraft({
    kind,
    amountUnit: "satang",
    accountId:
      kind === "transfer"
        ? ""
        : suggestion?.account_id || suggestion?.accountId || scan?.matched_account_id || scan?.matchedAccountId || "",
    fromAccountId:
      suggestion?.from_account_id ||
      suggestion?.fromAccountId ||
      (kind === "transfer" ? suggestion?.account_id || suggestion?.accountId || scan?.matched_account_id || scan?.matchedAccountId || "" : ""),
    toAccountId: suggestion?.to_account_id || suggestion?.toAccountId || "",
    categoryId:
      kind === "transfer"
        ? ""
        : derivedCategoryId,
    amountSatang: resolveDraftTotalSatang({
      amountSatang: toSatangAmount(suggestion?.amount, amountUnit, 0),
      kind,
      receiptGroups,
    }),
    merchant: suggestion?.merchant || "",
    note: suggestion?.note || "",
    reference: suggestion?.ref || suggestion?.referenceId || "",
    paymentMethod: suggestion?.payment_method || suggestion?.paymentMethod || "",
    date: suggestion?.date || todayDate(),
    transactionTime:
      suggestion?.transactionTime ||
      suggestion?.transaction_time ||
      suggestion?.transactionAt ||
      suggestion?.transaction_at ||
      suggestion?.time ||
      suggestion?.slip_time ||
      "",
    time: suggestion?.time || suggestion?.slip_time || "",
    docType: suggestion?.doc_type || suggestion?.docType || "",
    lineItems: receiptGroups,
    receiptGroups,
    receiptSaveMode: splitByCategory ? RECEIPT_SAVE_MODES.SPLIT_BY_CATEGORY : RECEIPT_SAVE_MODES.SINGLE,
    splitByCategory,
    splitGroupId: suggestion?.split_group_id || suggestion?.splitGroupId || "",
    splitCount: suggestion?.split_count || suggestion?.splitCount || receiptGroups.length,
    splitLabel: suggestion?.split_label || suggestion?.splitLabel || suggestion?.merchant || suggestion?.note || "",
  });
}
