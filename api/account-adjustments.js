import { getSupabaseAdmin, hasSupabaseServerConfig } from "../lib/supabase/admin.js";
import { requireRequestUser } from "../lib/supabase/auth.js";
import { ensureSystemCategories } from "../lib/supabase/systemCategories.js";
import { parseJsonBody } from "../lib/scan/requestParse.js";
import { canonicalizeCategoryId } from "../src/utils/categoryIds.js";

export const config = { api: { bodyParser: false } };

function toSafeMoney(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function sanitizeIsoDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function getAdjustmentMode(value) {
  const mode = cleanText(value, "transaction").toLowerCase();
  return mode === "silent" ? "silent" : "transaction";
}

async function computeCurrentBalance(admin, userId, account) {
  const { data, error } = await admin.rpc("account_balance_snapshot", { target_user: userId });
  if (!error) {
    const row = (Array.isArray(data) ? data : []).find((item) => Number(item?.id) === Number(account.id));
    if (row) return Number(row.balance_satang || 0);
  }

  const { data: transactions, error: txError } = await admin
    .from("transactions")
    .select("kind, amount_satang, account_id, from_account_id, to_account_id")
    .eq("user_id", userId)
    .or(`account_id.eq.${account.id},from_account_id.eq.${account.id},to_account_id.eq.${account.id}`);

  if (txError) {
    throw new Error(txError.message || "account_balance_snapshot_failed");
  }

  return (Array.isArray(transactions) ? transactions : []).reduce((sum, transaction) => {
    const amount = Number(transaction?.amount_satang || 0);
    if (!amount) return sum;

    if (transaction?.kind === "income" && Number(transaction?.account_id) === Number(account.id)) {
      return sum + amount;
    }
    if (transaction?.kind === "expense" && Number(transaction?.account_id) === Number(account.id)) {
      return sum - amount;
    }
    if (transaction?.kind === "transfer" && Number(transaction?.to_account_id) === Number(account.id)) {
      return sum + amount;
    }
    if (transaction?.kind === "transfer" && Number(transaction?.from_account_id) === Number(account.id)) {
      return sum - amount;
    }
    return sum;
  }, Number(account?.opening_balance_satang || 0));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST" });
    return;
  }

  if (!hasSupabaseServerConfig()) {
    res.status(500).json({
      ok: false,
      code: "supabase_server_env_missing",
      message: "Supabase server environment is not configured",
    });
    return;
  }

  const auth = await requireRequestUser(req, res);
  if (!auth) return;

  const body = await parseJsonBody(req, 1024 * 1024);
  const accountId = Number(body.accountId ?? body.account_id);
  const desiredBalanceSatang = toSafeMoney(
    body.desiredBalanceSatang ?? body.desired_balance_satang,
    Number.NaN,
  );
  const mode = getAdjustmentMode(body.mode ?? body.adjustmentMode);
  const effectiveDate = sanitizeIsoDate(body.date);

  if (!Number.isFinite(accountId) || accountId <= 0) {
    res.status(400).json({ ok: false, code: "account_required", message: "account_required" });
    return;
  }

  if (!Number.isFinite(desiredBalanceSatang)) {
    res.status(400).json({ ok: false, code: "desired_balance_required", message: "desired_balance_required" });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    await ensureSystemCategories(admin);

    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("id, user_id, name, opening_balance_satang")
      .eq("id", accountId)
      .eq("user_id", auth.user.id)
      .single();

    if (accountError || !account) {
      throw new Error(accountError?.message || "account_not_found");
    }

    const currentBalanceSatang = await computeCurrentBalance(admin, auth.user.id, account);
    const deltaSatang = desiredBalanceSatang - currentBalanceSatang;

    if (!deltaSatang) {
      res.status(200).json({
        ok: true,
        noop: true,
        mode,
        accountId: Number(account.id),
        currentBalanceSatang,
        desiredBalanceSatang,
        deltaSatang: 0,
      });
      return;
    }

    if (mode === "silent") {
      const nextOpeningBalance = Number(account.opening_balance_satang || 0) + deltaSatang;
      const { error: updateError } = await admin
        .from("accounts")
        .update({ opening_balance_satang: nextOpeningBalance })
        .eq("id", account.id)
        .eq("user_id", auth.user.id);

      if (updateError) {
        throw new Error(updateError.message || "account_adjustment_failed");
      }

      res.status(200).json({
        ok: true,
        noop: false,
        mode,
        accountId: Number(account.id),
        currentBalanceSatang,
        desiredBalanceSatang,
        deltaSatang,
      });
      return;
    }

    const kind = deltaSatang > 0 ? "income" : "expense";
    const categoryId = canonicalizeCategoryId(kind, "adjust_balance");
    const note = cleanText(body.note, "ปรับยอดบัญชี");

    const { data: transaction, error: transactionError } = await admin
      .from("transactions")
      .insert({
        user_id: auth.user.id,
        legacy_id: null,
        scan_document_id: null,
        kind,
        status: "posted",
        account_id: account.id,
        from_account_id: null,
        to_account_id: null,
        category_id: categoryId,
        merchant: null,
        merchant_key: null,
        note,
        reference: null,
        payment_method: null,
        amount_satang: Math.abs(deltaSatang),
        currency: "THB",
        date: effectiveDate,
        attachment_path: null,
        attachment_name: null,
        attachment_mime_type: null,
        raw: {
          source: "account_adjustment",
          adjustment_mode: "transaction",
          balance_adjustment: {
            account_id: Number(account.id),
            before_balance_satang: currentBalanceSatang,
            desired_balance_satang: desiredBalanceSatang,
            after_balance_satang: desiredBalanceSatang,
            delta_satang: deltaSatang,
          },
        },
      })
      .select("id")
      .single();

    if (transactionError) {
      throw new Error(transactionError.message || "account_adjustment_failed");
    }

    res.status(200).json({
      ok: true,
      noop: false,
      mode,
      transactionId: Number(transaction?.id || 0) || null,
      accountId: Number(account.id),
      currentBalanceSatang,
      desiredBalanceSatang,
      deltaSatang,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: "account_adjustment_failed",
      message: String(error?.message || error || "account_adjustment_failed"),
    });
  }
}
