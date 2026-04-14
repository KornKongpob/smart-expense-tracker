import crypto from "node:crypto";

import { canonicalizeCategoryId } from "../../src/utils/categoryIds.js";
import { buildCustomCategoryId } from "../../src/utils/categoryCustomId.js";
import { normalizeMerchantKey } from "../../src/utils/merchantDictionary.js";
import { encryptAccountDigits, normalizeDigits } from "../security/encryption.js";
import { uploadUserDocument } from "../supabase/documents.js";
import { getSystemCategoryRows } from "../supabase/systemCategories.js";

const ACCOUNT_TYPES = new Set(["cash", "bank", "credit", "loan", "ewallet", "investment", "other"]);

function sha1(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function sanitizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Date().toISOString().slice(0, 10);
}

function sanitizeOptionalDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function sanitizeAccountType(value) {
  const type = String(value || "").trim().toLowerCase();
  return ACCOUNT_TYPES.has(type) ? type : "other";
}

function extractLegacyId(record, fallbackPrefix) {
  const raw =
    record?.legacyId ??
    record?.legacy_id ??
    record?.id ??
    record?.referenceId ??
    record?.reference_id ??
    "";
  const text = String(raw || "").trim();
  return text || `${fallbackPrefix}_${sha1(JSON.stringify(record || {})).slice(0, 16)}`;
}

function customCategoryIdFor(userId, legacyId) {
  return buildCustomCategoryId(userId, legacyId);
}

function normalizeSnapshot(snapshot) {
  const root = snapshot && typeof snapshot === "object" ? snapshot : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;

  return {
    profile:
      data.profile && typeof data.profile === "object"
        ? data.profile
        : root.profile && typeof root.profile === "object"
          ? root.profile
          : null,
    accounts: toArray(data.accounts),
    categories: data.categories && typeof data.categories === "object" ? data.categories : { expense: [], income: [] },
    categoryPreferences: toArray(data.categoryPreferences ?? data.category_preferences),
    financialGoals: toArray(data.financialGoals ?? data.financial_goals),
    debtPlans: toArray(data.debtPlans ?? data.debt_plans),
    transactions: toArray(data.transactions),
    inbox: toArray(data.inbox).length ? toArray(data.inbox) : toArray(data.scanInbox),
    merchants: toArray(data.merchants),
    budgets: toArray(data.budgets),
  };
}

function pickMonthlyTarget(budgets) {
  const totals = toArray(budgets)
    .filter((budget) => String(budget?.categoryId || budget?.category_id || "").trim() === "__TOTAL__")
    .sort((left, right) =>
      String(right?.month || right?.month_key || "").localeCompare(String(left?.month || left?.month_key || "")),
    );

  return totals.length
    ? Math.max(0, toInt(totals[0]?.limit ?? totals[0]?.limit_satang, 0))
    : 0;
}

function buildCategoryArtifacts(userId, categories) {
  const systemRows = getSystemCategoryRows();
  const systemIds = new Set(systemRows.map((row) => row.id));
  const categoryIdMap = new Map(systemRows.map((row) => [row.id, row.id]));
  const customRows = [];

  for (const kind of ["expense", "income"]) {
    for (const category of toArray(categories?.[kind])) {
      const legacyId = cleanText(category?.id);
      const canonicalId = canonicalizeCategoryId(kind, legacyId);
      if (!legacyId || category?.isDeleted || category?.deletedAt) continue;
      if (systemIds.has(canonicalId)) {
        categoryIdMap.set(legacyId, canonicalId);
        categoryIdMap.set(canonicalId, canonicalId);
        continue;
      }
      if (!categoryIdMap.has(legacyId)) {
        const customId = customCategoryIdFor(userId, canonicalId || legacyId);
        categoryIdMap.set(legacyId, customId);
        if (canonicalId) {
          categoryIdMap.set(canonicalId, customId);
        }
      }
    }
  }

  for (const kind of ["expense", "income"]) {
    for (const category of toArray(categories?.[kind])) {
      const legacyId = cleanText(category?.id);
      const canonicalId = canonicalizeCategoryId(kind, legacyId);
      if (!legacyId || category?.isDeleted || category?.deletedAt || systemIds.has(canonicalId)) continue;

      const currentId = categoryIdMap.get(legacyId);
      const parentLegacyId = cleanText(category?.parentId || category?.parent_id);
      const mappedParentId = parentLegacyId
        ? categoryIdMap.get(parentLegacyId) || categoryIdMap.get(canonicalizeCategoryId(kind, parentLegacyId)) || null
        : null;

      customRows.push({
        id: currentId,
        user_id: userId,
        is_system: false,
        kind,
        name: cleanText(category?.name, "Untitled"),
        icon: cleanText(category?.icon),
        color: cleanText(category?.color, "#0f766e"),
        parent_id: mappedParentId,
        sort_order: toInt(category?.sortOrder ?? category?.sort_order, customRows.length),
      });
    }
  }

  return { customRows, categoryIdMap };
}

function mapCategoryId(value, categoryIdMap, kind = "expense") {
  const id = cleanText(value);
  if (!id) return null;
  const canonicalId = canonicalizeCategoryId(kind, id);
  return categoryIdMap.get(id) || categoryIdMap.get(canonicalId) || canonicalId || id;
}

function mapImportedCategoryId(value, categoryIdMap) {
  const id = cleanText(value);
  if (!id) return null;
  return (
    categoryIdMap.get(id) ||
    categoryIdMap.get(canonicalizeCategoryId("expense", id)) ||
    categoryIdMap.get(canonicalizeCategoryId("income", id)) ||
    id
  );
}

function mapAccountId(value, accountIdMap) {
  const id = cleanText(value);
  if (!id) return null;
  return accountIdMap.get(id) || null;
}

async function uploadAttachments(admin, userId, attachments) {
  const attachmentMap = new Map();
  const failures = [];
  let uploadedCount = 0;

  for (const attachment of toArray(attachments)) {
    const legacyId = extractLegacyId(attachment, "attachment");
    if (attachmentMap.has(legacyId)) continue;

    const base64 = cleanText(attachment?.base64);
    if (!base64) {
      failures.push({ type: "attachment", id: legacyId, message: "missing_base64" });
      continue;
    }

    try {
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) {
        failures.push({ type: "attachment", id: legacyId, message: "empty_buffer" });
        continue;
      }

      const uploaded = await uploadUserDocument({
        admin,
        userId,
        buffer,
        mimeType: cleanText(attachment?.mimeType || attachment?.mime_type, "application/octet-stream"),
        filename: cleanText(attachment?.filename || attachment?.fileName || attachment?.name, `${legacyId}.bin`),
        prefix: "imports",
      });

      attachmentMap.set(legacyId, uploaded);
      uploadedCount += 1;
    } catch (error) {
      failures.push({
        type: "attachment",
        id: legacyId,
        message: String(error?.message || error || "attachment_upload_failed"),
      });
    }
  }

  return { attachmentMap, failures, uploadedCount };
}

async function upsertAccounts(admin, userId, accounts) {
  const rows = toArray(accounts).map((account) => {
    const legacyId = extractLegacyId(account, "account");
    const digits = normalizeDigits(
      account?.accountNumber ||
        account?.cardNumber ||
        account?.digits ||
        account?.cardLast4 ||
        "",
    );
    const encrypted = digits ? encryptAccountDigits(digits) : null;

    return {
      user_id: userId,
      legacy_id: legacyId,
      name: cleanText(account?.name, "Account"),
      type: sanitizeAccountType(account?.type || "other"),
      institution_label: cleanNullableText(account?.institutionLabel || account?.institutionId || account?.bank),
      currency: cleanText(account?.currency, "THB").toUpperCase(),
      color: cleanText(account?.color, "#0f766e"),
      icon: cleanText(account?.icon, "bank"),
      opening_balance_satang: toInt(account?.openingBalance ?? account?.opening_balance_satang, 0),
      credit_limit_satang: Math.max(0, toInt(account?.creditLimit ?? account?.credit_limit_satang, 0)),
      statement_day:
        account?.statementDay != null && account?.statementDay !== ""
          ? Math.max(1, Math.min(31, toInt(account?.statementDay, 1)))
          : null,
      due_day:
        account?.dueDay != null && account?.dueDay !== ""
          ? Math.max(1, Math.min(31, toInt(account?.dueDay, 1)))
          : null,
      ...(encrypted
        ? {
            digits_ciphertext: encrypted.digitsCiphertext,
            digits_masked: encrypted.digitsMasked,
            last4: encrypted.last4,
            last6: encrypted.last6,
          }
        : {}),
    };
  });

  if (!rows.length) return { accountIdMap: new Map(), count: 0 };

  const { data, error } = await admin
    .from("accounts")
    .upsert(rows, { onConflict: "user_id,legacy_id" })
    .select("id, legacy_id");

  if (error) {
    throw new Error(error.message || "account_import_failed");
  }

  const accountIdMap = new Map();
  for (const row of toArray(data)) {
    accountIdMap.set(String(row.legacy_id || ""), Number(row.id));
  }

  return { accountIdMap, count: rows.length };
}

function sanitizeGoalStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "paused" || status === "completed" || status === "archived") return status;
  return "active";
}

function sanitizeDebtStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "paused" || status === "paid_off" || status === "archived") return status;
  return "active";
}

async function upsertFinancialGoals(admin, userId, financialGoals, accountIdMap) {
  const rows = toArray(financialGoals).map((goal) => ({
    user_id: userId,
    legacy_id: extractLegacyId(goal, "financial_goal"),
    name: cleanText(goal?.name, "เป้าหมายการเงิน"),
    target_amount_satang: Math.max(0, toInt(goal?.target_amount_satang ?? goal?.targetAmountSatang, 0)),
    current_amount_satang: Math.max(0, toInt(goal?.current_amount_satang ?? goal?.currentAmountSatang, 0)),
    target_date: sanitizeOptionalDate(goal?.target_date ?? goal?.targetDate),
    monthly_contribution_satang: Math.max(
      0,
      toInt(goal?.monthly_contribution_satang ?? goal?.monthlyContributionSatang, 0),
    ),
    linked_account_id: mapAccountId(goal?.linked_account_id ?? goal?.linkedAccountId, accountIdMap),
    status: sanitizeGoalStatus(goal?.status),
  }));

  if (!rows.length) return 0;

  const { error } = await admin.from("financial_goals").upsert(rows, {
    onConflict: "user_id,legacy_id",
  });

  if (error) {
    throw new Error(error.message || "financial_goal_import_failed");
  }

  return rows.length;
}

async function upsertDebtPlans(admin, userId, debtPlans, accountIdMap) {
  const rows = [];

  for (const plan of toArray(debtPlans)) {
    const accountId = mapAccountId(plan?.account_id ?? plan?.accountId, accountIdMap);
    if (!accountId) continue;

    rows.push({
      user_id: userId,
      legacy_id: extractLegacyId(plan, "debt_plan"),
      account_id: accountId,
      current_balance_satang: Math.max(
        0,
        toInt(plan?.current_balance_satang ?? plan?.currentBalanceSatang, 0),
      ),
      minimum_payment_satang: Math.max(
        0,
        toInt(plan?.minimum_payment_satang ?? plan?.minimumPaymentSatang, 0),
      ),
      target_payment_satang: Math.max(
        0,
        toInt(plan?.target_payment_satang ?? plan?.targetPaymentSatang, 0),
      ),
      apr_bps: Math.max(0, toInt(plan?.apr_bps ?? plan?.aprBps, 0)),
      due_day:
        plan?.due_day != null || plan?.dueDay != null
          ? Math.max(1, Math.min(31, toInt(plan?.due_day ?? plan?.dueDay, 1)))
          : null,
      payoff_target_date: sanitizeOptionalDate(plan?.payoff_target_date ?? plan?.payoffTargetDate),
      status: sanitizeDebtStatus(plan?.status),
      note: cleanNullableText(plan?.note),
    });
  }

  if (!rows.length) return 0;

  const { error } = await admin.from("debt_plans").upsert(rows, {
    onConflict: "user_id,legacy_id",
  });

  if (error) {
    throw new Error(error.message || "debt_plan_import_failed");
  }

  return rows.length;
}

async function upsertCategoryPreferences(admin, userId, preferenceRows, categoryIdMap) {
  const rows = [];

  for (const preference of toArray(preferenceRows)) {
    const categoryId = mapImportedCategoryId(
      preference?.category_id ?? preference?.categoryId,
      categoryIdMap,
    );
    if (!categoryId) continue;

    const budgetBehavior = cleanText(
      preference?.budget_behavior ?? preference?.budgetBehavior,
    ).toLowerCase();

    rows.push({
      user_id: userId,
      category_id: categoryId,
      name: cleanNullableText(preference?.name),
      icon: cleanNullableText(preference?.icon),
      color: cleanNullableText(preference?.color),
      hidden: preference?.hidden === true,
      budget_behavior:
        budgetBehavior === "fixed" || budgetBehavior === "essential" || budgetBehavior === "flexible"
          ? budgetBehavior
          : null,
    });
  }

  if (!rows.length) return 0;

  const { error } = await admin.from("category_preferences").upsert(rows, {
    onConflict: "user_id,category_id",
  });

  if (error) {
    throw new Error(error.message || "category_preference_import_failed");
  }

  return rows.length;
}

async function upsertBudgetRows(admin, userId, budgets, categoryIdMap) {
  const rows = [];

  for (const budget of toArray(budgets)) {
    const categoryId = cleanText(budget?.categoryId || budget?.category_id);
    if (!categoryId || categoryId === "__TOTAL__" || categoryId === "__DAILY__") continue;

    const mappedCategoryId = mapImportedCategoryId(categoryId, categoryIdMap);
    const monthKey = cleanText(budget?.month || budget?.month_key);
    if (!mappedCategoryId || !/^\d{4}-\d{2}$/.test(monthKey)) continue;

    const source = cleanText(budget?.source, "migrated").toLowerCase();
    rows.push({
      user_id: userId,
      month_key: monthKey,
      category_id: mappedCategoryId,
      limit_satang: Math.max(0, toInt(budget?.limit ?? budget?.limit_satang, 0)),
      alert_pct: Math.max(1, Math.min(100, toInt(budget?.alertPct ?? budget?.alert_pct, 90))),
      source: source === "manual" || source === "suggested" || source === "migrated" ? source : "migrated",
      manual_override: budget?.manualOverride === true || budget?.manual_override === true,
    });
  }

  if (!rows.length) return 0;

  const { error } = await admin.from("budgets").upsert(rows, {
    onConflict: "user_id,month_key,category_id",
  });

  if (error) {
    throw new Error(error.message || "budget_import_failed");
  }

  return rows.length;
}

async function upsertMerchantMappings(admin, userId, merchants, accountIdMap, categoryIdMap) {
  const rows = [];

  for (const merchant of toArray(merchants)) {
    const canonical = cleanText(merchant?.canonical || merchant?.merchant);
    const merchantKey = normalizeMerchantKey(canonical);
    if (!canonical || !merchantKey) continue;

    rows.push({
      user_id: userId,
      merchant_key: merchantKey,
      canonical_merchant: canonical,
      preferred_category_id:
        mapCategoryId(
          merchant?.prefs?.expense?.categoryId,
          categoryIdMap,
          "expense",
        ) ||
        mapCategoryId(
          merchant?.prefs?.income?.categoryId,
          categoryIdMap,
          "income",
        ) ||
        mapCategoryId(
          merchant?.categoryId,
          categoryIdMap,
          "expense",
        ) || null,
      preferred_account_id:
        mapAccountId(
          merchant?.prefs?.expense?.accountId ||
            merchant?.prefs?.income?.accountId ||
            merchant?.accountId,
          accountIdMap,
        ) || null,
      usage_count: Math.max(
        0,
        toInt(
          merchant?.usageCount ||
            merchant?.stats?.expense?.categoryCounts?.length ||
            merchant?.stats?.income?.categoryCounts?.length,
          0,
        ),
      ),
      metadata: merchant,
    });
  }

  if (!rows.length) return 0;

  const { error } = await admin.from("merchant_mappings").upsert(rows, {
    onConflict: "user_id,merchant_key",
  });

  if (error) {
    throw new Error(error.message || "merchant_mapping_import_failed");
  }

  return rows.length;
}

function collectLineItems(source, categoryIdMap, rows, state, kind = "expense") {
  for (const item of toArray(source)) {
    if (!item || typeof item !== "object") continue;

    const amountRaw = toInt(item?.amount ?? item?.total, 0);
    const isAdjustment =
      String(item?.receipt_line_type || item?.receiptLineType || "").trim() === "adjustment" ||
      String(item?.adjustmentType || "").trim() !== "" ||
      String(item?.categoryId || item?.category || "").trim() === "discount" ||
      amountRaw < 0;

    const amountSatang = Math.abs(amountRaw);
    const categoryId = mapCategoryId(item?.categoryId || item?.category, categoryIdMap, kind);

    if (amountSatang > 0 || cleanText(item?.name || item?.title)) {
      rows.push({
        line_order: state.value++,
        name: cleanText(item?.name || item?.title || item?.label, isAdjustment ? "Adjustment" : "Item"),
        category_id: categoryId,
        amount_satang: amountSatang,
        quantity: item?.qty != null ? Number(item.qty) : item?.quantity != null ? Number(item.quantity) : null,
        unit_price_satang:
          item?.unitPrice != null
            ? toInt(item.unitPrice, null)
            : item?.unit_price != null
            ? toInt(item.unit_price, null)
            : null,
        receipt_line_type: isAdjustment ? "adjustment" : "item",
        adjustment_effect:
          String(item?.adjustmentEffect || item?.effect || "").trim() === "subtract" || amountRaw < 0
            ? "subtract"
            : "add",
        adjustment_type: cleanNullableText(item?.adjustmentType || item?.type),
        metadata: item,
      });
    }

    if (Array.isArray(item?.children)) {
      collectLineItems(item.children, categoryIdMap, rows, state, kind);
    }
  }
}

function buildTransactionArtifacts(snapshot, accountIdMap, categoryIdMap, attachmentMap) {
  const rows = [];
  const lineItemsByLegacyId = new Map();
  const splitParentLegacyRefs = new Map();

  for (const transaction of toArray(snapshot.transactions)) {
    const legacyId = extractLegacyId(transaction, "transaction");
    const rawKind = String(transaction?.type || transaction?.kind || "").trim().toLowerCase();
    const isTransfer = !!transaction?.isTransfer || rawKind === "transfer" || cleanText(transaction?.transferId);
    const isSplitParent = transaction?.isSplitParent === true || transaction?.is_split_parent === true;
    const isSplitChild = transaction?.isSplitChild === true || transaction?.is_split_child === true;
    const splitGroupId = cleanNullableText(transaction?.splitGroupId ?? transaction?.split_group_id);
    const splitParentLegacyId = cleanText(transaction?.splitParentId ?? transaction?.split_parent_id);
    const amountSatang = Math.max(0, toInt(transaction?.amount, 0));
    const fromAccountId = mapAccountId(transaction?.fromAccountId, accountIdMap);
    const toAccountId = mapAccountId(transaction?.toAccountId, accountIdMap);
    const primaryAccountId = mapAccountId(transaction?.accountId, accountIdMap);
    const attachment = attachmentMap.get(cleanText(transaction?.attachmentId));
    const kind =
      isTransfer && fromAccountId && toAccountId
        ? "transfer"
        : rawKind === "income"
        ? "income"
        : "expense";

    rows.push({
      user_id: snapshot.userId,
      legacy_id: legacyId,
      scan_document_id: null,
      kind,
      status: "posted",
      account_id: kind === "transfer" ? null : primaryAccountId,
      from_account_id: kind === "transfer" ? fromAccountId : null,
      to_account_id: kind === "transfer" ? toAccountId : null,
      category_id:
        kind === "transfer"
          ? null
          : mapCategoryId(transaction?.categoryId || transaction?.category, categoryIdMap, kind),
      merchant: cleanNullableText(transaction?.merchant),
      merchant_key: normalizeMerchantKey(transaction?.merchant || ""),
      note: cleanNullableText(transaction?.note),
      reference: cleanNullableText(transaction?.ref || transaction?.referenceId),
      payment_method: cleanNullableText(transaction?.paymentMethod || transaction?.payment_method),
      amount_satang: amountSatang,
      currency: cleanText(transaction?.currency, "THB").toUpperCase(),
      date: sanitizeDate(transaction?.date),
      attachment_path: attachment?.filePath || null,
      attachment_name: attachment?.fileName || null,
      attachment_mime_type: attachment?.mimeType || null,
      is_split_parent: isSplitParent,
      is_split_child: isSplitChild,
      split_group_id: splitGroupId,
      split_parent_id: null,
      split_index: transaction?.splitIndex != null || transaction?.split_index != null ? Math.max(1, toInt(transaction?.splitIndex ?? transaction?.split_index, 1)) : null,
      split_count: transaction?.splitCount != null || transaction?.split_count != null ? Math.max(1, toInt(transaction?.splitCount ?? transaction?.split_count, 1)) : null,
      split_label: cleanNullableText(transaction?.splitLabel ?? transaction?.split_label),
      receipt_line_type:
        cleanText(transaction?.receiptLineType ?? transaction?.receipt_line_type, isSplitChild ? "item" : "item") === "adjustment"
          ? "adjustment"
          : "item",
      adjustment_effect:
        cleanText(transaction?.adjustmentEffect ?? transaction?.adjustment_effect, "add").toLowerCase() === "subtract"
          ? "subtract"
          : "add",
      adjustment_type: cleanNullableText(transaction?.adjustmentType ?? transaction?.adjustment_type),
      raw: transaction,
    });

    if (isSplitChild && splitParentLegacyId) {
      splitParentLegacyRefs.set(legacyId, splitParentLegacyId);
    }

    if (!isSplitParent) {
      const collected = [];
      collectLineItems(
        transaction?.receiptLines || transaction?.lines || transaction?.groups,
        categoryIdMap,
        collected,
        { value: 0 },
        kind,
      );
      if (collected.length) {
        lineItemsByLegacyId.set(legacyId, collected);
      }
    }
  }

  return { rows, lineItemsByLegacyId, splitParentLegacyRefs };
}

async function upsertTransactions(admin, snapshot, accountIdMap, categoryIdMap, attachmentMap) {
  const { rows, lineItemsByLegacyId, splitParentLegacyRefs } = buildTransactionArtifacts(snapshot, accountIdMap, categoryIdMap, attachmentMap);
  if (!rows.length) return { transactionIdMap: new Map(), count: 0, lineItemCount: 0 };

  const { data, error } = await admin
    .from("transactions")
    .upsert(rows, { onConflict: "user_id,legacy_id" })
    .select("id, legacy_id");

  if (error) {
    throw new Error(error.message || "transaction_import_failed");
  }

  const transactionIdMap = new Map();
  const transactionIds = [];
  for (const row of toArray(data)) {
    const legacyId = cleanText(row?.legacy_id);
    const id = Number(row?.id);
    if (!legacyId || !id) continue;
    transactionIdMap.set(legacyId, id);
    transactionIds.push(id);
  }

  if (splitParentLegacyRefs.size) {
    for (const [legacyId, parentLegacyId] of splitParentLegacyRefs.entries()) {
      const childId = transactionIdMap.get(legacyId);
      const parentId = transactionIdMap.get(parentLegacyId);
      if (!childId || !parentId) continue;

      const { error: splitError } = await admin
        .from("transactions")
        .update({ split_parent_id: parentId })
        .eq("id", childId)
        .eq("user_id", snapshot.userId);

      if (splitError) {
        throw new Error(splitError.message || "transaction_split_parent_link_failed");
      }
    }
  }

  if (transactionIds.length) {
    const { error: deleteError } = await admin
      .from("transaction_line_items")
      .delete()
      .eq("user_id", snapshot.userId)
      .in("transaction_id", transactionIds);

    if (deleteError) {
      throw new Error(deleteError.message || "transaction_line_item_cleanup_failed");
    }
  }

  const lineRows = [];
  for (const [legacyId, items] of lineItemsByLegacyId.entries()) {
    const transactionId = transactionIdMap.get(legacyId);
    if (!transactionId) continue;
    for (const item of items) {
      lineRows.push({
        transaction_id: transactionId,
        user_id: snapshot.userId,
        ...item,
      });
    }
  }

  if (lineRows.length) {
    const { error: lineError } = await admin.from("transaction_line_items").insert(lineRows);
    if (lineError) {
      throw new Error(lineError.message || "transaction_line_item_import_failed");
    }
  }

  return { transactionIdMap, count: rows.length, lineItemCount: lineRows.length };
}

async function upsertScanDocuments(admin, snapshot, accountIdMap, categoryIdMap, attachmentMap, transactionIdMap) {
  const rows = [];

  for (const item of toArray(snapshot.inbox)) {
    const legacyId = extractLegacyId(item, "scan");
    const attachment = attachmentMap.get(cleanText(item?.attachmentId));
    const kind = String(item?.status || "").trim().toLowerCase() === "approved" ? "approved" : "pending_review";
    const itemKind =
      String(item?.type || item?.kind || item?.txType || "").trim().toLowerCase() === "income"
        ? "income"
        : "expense";
    const linkedTransactionId =
      transactionIdMap.get(cleanText(item?.referenceId || item?.transactionId || item?.sourceTxId)) || null;

    rows.push({
      user_id: snapshot.userId,
      legacy_id: legacyId,
      source_type: "migration",
      status: kind,
      storage_bucket: attachment?.bucket || "expense-documents",
      file_path: attachment?.filePath || null,
      file_name: attachment?.fileName || null,
      mime_type: attachment?.mimeType || null,
      file_hash: attachment?.fileHash || cleanNullableText(item?.fileHash),
      raw_scan_payload: item,
      normalized_suggestion: {
        amount: toInt(item?.amount, 0),
        date: sanitizeDate(item?.date),
        merchant: cleanNullableText(item?.merchant),
        note: cleanNullableText(item?.note),
        items: item?.receiptLines || item?.lines || item?.groups || [],
        category_key: mapCategoryId(item?.categoryId || item?.category, categoryIdMap, itemKind),
      },
      confidence: item?.confidence?.overall != null ? Number(item.confidence.overall) : null,
      matched_account_id: mapAccountId(item?.accountId || item?.fromAccountId, accountIdMap),
      matched_category_id: mapCategoryId(item?.categoryId || item?.category, categoryIdMap, itemKind),
      approved_transaction_id: linkedTransactionId,
      merchant_key: normalizeMerchantKey(item?.merchant || ""),
      parse_error: null,
      reviewed_at: kind === "approved" ? new Date().toISOString() : null,
    });
  }

  if (!rows.length) return 0;

  const { error } = await admin.from("scan_documents").upsert(rows, {
    onConflict: "user_id,legacy_id",
  });

  if (error) {
    throw new Error(error.message || "scan_document_import_failed");
  }

  return rows.length;
}

export async function importLegacySnapshot({ admin, userId, snapshot, attachments = [] }) {
  const normalized = normalizeSnapshot(snapshot);
  normalized.userId = userId;

  const sourceFingerprint = sha256(
    JSON.stringify({
      snapshot: normalized,
      attachments: toArray(attachments).map((attachment) => ({
        id: extractLegacyId(attachment, "attachment"),
        mimeType: cleanText(attachment?.mimeType || attachment?.mime_type),
        size: toInt(attachment?.size, 0),
      })),
    }),
  );

  const existingRun = await admin
    .from("import_runs")
    .select("id, counts, failures, status")
    .eq("user_id", userId)
    .eq("source", "legacy_local")
    .eq("source_fingerprint", sourceFingerprint)
    .maybeSingle();

  if (!existingRun.error && existingRun.data) {
    return {
      skipped: true,
      sourceFingerprint,
      counts: existingRun.data.counts || {},
      failures: existingRun.data.failures || [],
    };
  }

  const { customRows, categoryIdMap } = buildCategoryArtifacts(userId, normalized.categories);
  if (customRows.length) {
    const { error: categoryError } = await admin.from("categories").upsert(customRows, { onConflict: "id" });
    if (categoryError) {
      throw new Error(categoryError.message || "category_import_failed");
    }
  }

  const attachmentUpload = await uploadAttachments(admin, userId, attachments);
  const { accountIdMap, count: accountCount } = await upsertAccounts(admin, userId, normalized.accounts);
  const categoryPreferenceCount = await upsertCategoryPreferences(
    admin,
    userId,
    normalized.categoryPreferences,
    categoryIdMap,
  );
  const financialGoalCount = await upsertFinancialGoals(admin, userId, normalized.financialGoals, accountIdMap);
  const debtPlanCount = await upsertDebtPlans(admin, userId, normalized.debtPlans, accountIdMap);
  const budgetCount = await upsertBudgetRows(admin, userId, normalized.budgets, categoryIdMap);
  const merchantMappingCount = await upsertMerchantMappings(
    admin,
    userId,
    normalized.merchants,
    accountIdMap,
    categoryIdMap,
  );
  const transactionImport = await upsertTransactions(
    admin,
    normalized,
    accountIdMap,
    categoryIdMap,
    attachmentUpload.attachmentMap,
  );
  const scanCount = await upsertScanDocuments(
    admin,
    normalized,
    accountIdMap,
    categoryIdMap,
    attachmentUpload.attachmentMap,
    transactionImport.transactionIdMap,
  );

  const counts = {
    categories: customRows.length,
    categoryPreferences: categoryPreferenceCount,
    attachments: attachmentUpload.uploadedCount,
    accounts: accountCount,
    financialGoals: financialGoalCount,
    debtPlans: debtPlanCount,
    budgets: budgetCount,
    merchantMappings: merchantMappingCount,
    scanDocuments: scanCount,
    transactions: transactionImport.count,
    transactionLineItems: transactionImport.lineItemCount,
  };

  const failures = attachmentUpload.failures;
  const importedProfile = normalized.profile && typeof normalized.profile === "object" ? normalized.profile : null;
  const monthlyTargetSatang = pickMonthlyTarget(normalized.budgets);
  const importedMonthlyTargetSatang = Math.max(
    0,
    toInt(importedProfile?.monthly_target_satang ?? importedProfile?.monthlyTargetSatang, 0),
  );
  const incomeMode = cleanText(importedProfile?.income_mode ?? importedProfile?.incomeMode).toLowerCase();
  const savingsMode = cleanText(importedProfile?.savings_mode ?? importedProfile?.savingsMode).toLowerCase();
  const debtStrategyMode = cleanText(
    importedProfile?.debt_strategy_mode ?? importedProfile?.debtStrategyMode,
  ).toLowerCase();
  const incomeLookbackMonths = toInt(
    importedProfile?.income_lookback_months ?? importedProfile?.incomeLookbackMonths,
    0,
  );
  const profilePatch = {
    monthly_target_satang: importedMonthlyTargetSatang || monthlyTargetSatang,
    migrated_at: failures.length ? null : new Date().toISOString(),
  };

  if (importedProfile) {
    const importedDisplayName = cleanNullableText(
      importedProfile?.display_name ?? importedProfile?.displayName,
    );
    if (importedDisplayName) profilePatch.display_name = importedDisplayName;
    if (incomeMode === "fixed" || incomeMode === "rolling_average") {
      profilePatch.income_mode = incomeMode;
    }
    profilePatch.fixed_income_satang = Math.max(
      0,
      toInt(importedProfile?.fixed_income_satang ?? importedProfile?.fixedIncomeSatang, 0),
    );
    if ([1, 3, 6, 12].includes(incomeLookbackMonths)) {
      profilePatch.income_lookback_months = incomeLookbackMonths;
    }
    if (savingsMode === "amount" || savingsMode === "percent") {
      profilePatch.savings_mode = savingsMode;
    }
    profilePatch.savings_amount_satang = Math.max(
      0,
      toInt(importedProfile?.savings_amount_satang ?? importedProfile?.savingsAmountSatang, 0),
    );
    profilePatch.savings_percent_bps = Math.max(
      0,
      Math.min(10000, toInt(importedProfile?.savings_percent_bps ?? importedProfile?.savingsPercentBps, 0)),
    );
    if (debtStrategyMode === "survival" || debtStrategyMode === "paydown") {
      profilePatch.debt_strategy_mode = debtStrategyMode;
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("user_id", userId);

  if (profileError) {
    throw new Error(profileError.message || "profile_migration_finalize_failed");
  }

  const { error: importRunError } = await admin.from("import_runs").insert({
    user_id: userId,
    source: "legacy_local",
    source_fingerprint: sourceFingerprint,
    status: failures.length ? "failed" : "completed",
    counts,
    failures,
  });

  if (importRunError) {
    throw new Error(importRunError.message || "import_run_record_failed");
  }

  return { skipped: false, sourceFingerprint, counts, failures };
}
