import { getSupabaseAdmin, hasSupabaseServerConfig } from "../lib/supabase/admin.js";
import { requireRequestUser } from "../lib/supabase/auth.js";
import { encryptAccountDigits, normalizeDigits } from "../lib/security/encryption.js";
import { ensureSystemCategories } from "../lib/supabase/systemCategories.js";
import { parseJsonBody } from "../lib/scan/requestParse.js";

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

function cleanNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
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
  const id = Number(body.id);
  const digits = normalizeDigits(body.digits || body.accountNumber || body.cardNumber || "");
  const encrypted = digits ? encryptAccountDigits(digits) : null;

  const row = {
    user_id: auth.user.id,
    legacy_id: cleanNullableText(body.legacyId),
    name: cleanText(body.name, "บัญชีใหม่"),
    type: cleanText(body.type, "bank"),
    institution_label: cleanNullableText(body.institutionLabel),
    currency: cleanText(body.currency, "THB"),
    color: cleanText(body.color, "#0f766e"),
    icon: cleanText(body.icon, "🏦"),
    opening_balance_satang: toSafeMoney(body.openingBalanceSatang ?? body.opening_balance_satang, 0),
    credit_limit_satang: toSafeMoney(body.creditLimitSatang ?? body.credit_limit_satang, 0),
    statement_day:
      body.statementDay != null && body.statementDay !== ""
        ? Math.max(1, Math.min(31, Math.trunc(Number(body.statementDay) || 1)))
        : null,
    due_day:
      body.dueDay != null && body.dueDay !== ""
        ? Math.max(1, Math.min(31, Math.trunc(Number(body.dueDay) || 1)))
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

  try {
    const admin = getSupabaseAdmin();
    await ensureSystemCategories(admin);

    const query = id
      ? admin.from("accounts").update(row).eq("id", id).eq("user_id", auth.user.id)
      : admin.from("accounts").insert(row);

    const { data, error } = await query
      .select("id, user_id, legacy_id, name, type, institution_label, currency, color, icon, opening_balance_satang, credit_limit_satang, last4, last6, digits_masked, statement_day, due_day, created_at, updated_at")
      .single();

    if (error) {
      throw new Error(error.message || "account_write_failed");
    }

    res.status(id ? 200 : 201).json({ ok: true, account: data });
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: "account_write_failed",
      message: String(error?.message || error || "account_write_failed"),
    });
  }
}
