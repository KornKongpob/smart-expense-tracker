import { parseJsonBody } from "../../../lib/scan/requestParse.js";
import { importLegacySnapshot } from "../../../lib/import/local.js";
import { getSupabaseAdmin, hasSupabaseServerConfig } from "../../../lib/supabase/admin.js";
import { requireRequestUser } from "../../../lib/supabase/auth.js";
import { ensureSystemCategories } from "../../../lib/supabase/systemCategories.js";

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
    const body = await parseJsonBody(req, 20 * 1024 * 1024);
    const snapshot = body?.snapshot ?? body?.backup ?? body?.data ?? null;
    const attachments = Array.isArray(body?.attachments)
      ? body.attachments
      : Array.isArray(body?.attachmentManifest)
      ? body.attachmentManifest
      : [];

    if (!snapshot || typeof snapshot !== "object") {
      res.status(400).json({
        ok: false,
        code: "missing_snapshot",
        message: "Provide a legacy snapshot to import",
      });
      return;
    }

    const admin = getSupabaseAdmin();
    await ensureSystemCategories(admin);

    const result = await importLegacySnapshot({
      admin,
      userId: auth.user.id,
      snapshot,
      attachments,
    });

    res.status(200).json({
      ok: true,
      skipped: !!result.skipped,
      sourceFingerprint: result.sourceFingerprint,
      counts: result.counts || {},
      failures: Array.isArray(result.failures) ? result.failures : [],
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: "local_import_failed",
      message: String(error?.message || error || "local_import_failed"),
    });
  }
}
