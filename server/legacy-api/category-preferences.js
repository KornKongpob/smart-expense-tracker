import { getSupabaseAdmin, hasSupabaseServerConfig } from "../../lib/supabase/admin.js";
import { requireRequestUser } from "../../lib/supabase/auth.js";
import { parseJsonBody } from "../../lib/scan/requestParse.js";

export const config = { api: { bodyParser: false } };

function cleanText(value) {
  const text = String(value || "").trim();
  return text || "";
}

function toCategoryPreferencesError(error, fallback = "category_preferences_failed") {
  const message = String(error?.message || error || fallback);
  if (message.toLowerCase().includes("category_preferences")) {
    return {
      code: "category_preferences_missing",
      message: "category_preferences_missing",
    };
  }

  return {
    code: fallback,
    message,
  };
}

function buildUnavailablePreference(row) {
  const categoryId = cleanText(row?.category_id || row?.categoryId);
  if (!categoryId) return null;

  return {
    user_id: cleanText(row?.user_id || row?.userId) || null,
    category_id: categoryId,
    name: row?.name != null ? cleanText(row.name) || null : null,
    icon: row?.icon != null ? cleanText(row.icon) || null : null,
    color: row?.color != null ? cleanText(row.color) || null : null,
    hidden: row?.hidden === true,
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
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

  const admin = getSupabaseAdmin();
  let requestedRow = null;

  try {
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("category_preferences")
        .select("user_id, category_id, name, icon, color, hidden, updated_at")
        .eq("user_id", auth.user.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      res.status(200).json({ ok: true, preferences: Array.isArray(data) ? data : [] });
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req, 1024 * 1024);
      const categoryId = cleanText(body?.categoryId || body?.category_id);
      if (!categoryId) {
        res.status(400).json({
          ok: false,
          code: "category_id_required",
          message: "category_id_required",
        });
        return;
      }

      const row = {
        user_id: auth.user.id,
        category_id: categoryId,
        name: body?.name != null ? cleanText(body.name) || null : null,
        icon: body?.icon != null ? cleanText(body.icon) || null : null,
        color: body?.color != null ? cleanText(body.color) || null : null,
        hidden: body?.hidden === true,
      };
      requestedRow = row;

      const { data, error } = await admin
        .from("category_preferences")
        .upsert(row, { onConflict: "user_id,category_id" })
        .select("user_id, category_id, name, icon, color, hidden, updated_at")
        .single();

      if (error) throw error;

      res.status(200).json({ ok: true, preference: data });
      return;
    }

    if (req.method === "DELETE") {
      const body = await parseJsonBody(req, 1024 * 1024);
      const categoryId = cleanText(body?.categoryId || body?.category_id);
      if (!categoryId) {
        res.status(400).json({
          ok: false,
          code: "category_id_required",
          message: "category_id_required",
        });
        return;
      }

      const { error } = await admin
        .from("category_preferences")
        .delete()
        .eq("user_id", auth.user.id)
        .eq("category_id", categoryId);

      if (error) throw error;

      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use GET, POST, or DELETE" });
  } catch (error) {
    const normalized = toCategoryPreferencesError(error);
    if (normalized.code === "category_preferences_missing") {
      if (req.method === "GET") {
        res.status(200).json({
          ok: true,
          unavailable: true,
          code: normalized.code,
          preferences: [],
        });
        return;
      }

      if (req.method === "POST") {
        res.status(200).json({
          ok: true,
          unavailable: true,
          code: normalized.code,
          preference: buildUnavailablePreference(requestedRow),
        });
        return;
      }

      if (req.method === "DELETE") {
        res.status(200).json({
          ok: true,
          unavailable: true,
          code: normalized.code,
        });
        return;
      }
    }

    res.status(500).json({
      ok: false,
      code: normalized.code,
      message: normalized.message,
      detail: String(error?.message || error || normalized.message),
    });
  }
}
