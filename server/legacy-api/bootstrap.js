import { getSupabaseAdmin, hasSupabaseServerConfig } from "../../lib/supabase/admin.js";
import { requireRequestUser } from "../../lib/supabase/auth.js";
import { ensureSystemCategories } from "../../lib/supabase/systemCategories.js";
import { parseJsonBody } from "../../lib/scan/requestParse.js";

export const config = { api: { bodyParser: false } };

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

  try {
    await parseJsonBody(req, 1024 * 1024);
    const admin = getSupabaseAdmin();
    await ensureSystemCategories(admin);

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        user_id: auth.user.id,
        display_name:
          String(auth.user.user_metadata?.display_name || "").trim() ||
          String(auth.user.email || "").split("@")[0] ||
          "Smart Expense User",
      },
      { onConflict: "user_id" },
    );

    if (profileError) {
      throw new Error(profileError.message || "profile_bootstrap_failed");
    }

    const [{ data: profile, error: fetchProfileError }, { count: categoryCount, error: fetchCategoriesError }] =
      await Promise.all([
        admin.from("profiles").select("*").eq("user_id", auth.user.id).single(),
        admin.from("categories").select("id", { head: true, count: "exact" }),
      ]);

    if (fetchProfileError) {
      throw new Error(fetchProfileError.message || "profile_fetch_failed");
    }
    if (fetchCategoriesError) {
      throw new Error(fetchCategoriesError.message || "categories_fetch_failed");
    }

    res.status(200).json({
      ok: true,
      profile,
      categoryCount: Number(categoryCount || 0),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: "bootstrap_failed",
      message: String(error?.message || error || "bootstrap_failed"),
    });
  }
}
