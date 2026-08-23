import { getRequestUser } from "../supabase/auth.js";
import { hasSupabaseServerConfig } from "../supabase/admin.js";

function parseEnvList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function constantTimeEqual(a, b) {
  const s1 = String(a || "");
  const s2 = String(b || "");
  if (s1.length !== s2.length) return false;
  let out = 0;
  for (let i = 0; i < s1.length; i++) out |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
  return out === 0;
}

function getBearerToken(req) {
  const auth = String(req.headers?.authorization || "").trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function hasValidScanToken(req) {
  const expected = String(process.env.SCAN_API_TOKEN || "").trim();
  if (!expected) return false;
  const got = getBearerToken(req) || String(req.headers?.["x-scan-token"] || "").trim();
  if (!got) return false;
  return constantTimeEqual(got, expected);
}

function isAllowedOrigin(req) {
  const allowed = parseEnvList(process.env.SCAN_ALLOWED_ORIGINS);
  if (!allowed.length) return { ok: false, origin: "" };
  const origin = String(req.headers?.origin || "").trim();
  if (!origin) return { ok: false, origin: "" };
  return { ok: allowed.includes(origin), origin };
}

function applyCorsIfAllowed(res, originOk, origin) {
  if (!originOk || !origin) return;
  try {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Scan-Token");
  } catch {
    // ignore
  }
}

export function setSecurityHeaders(res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Referrer-Policy", "no-referrer");
  } catch {
    // ignore
  }
}

/**
 * Gate for the paid AI endpoints. Origin / shared-token checks stay first so
 * server-to-server callers keep working. When neither is configured we fall
 * back to requiring a signed-in Supabase user instead of letting the request
 * through: otherwise anyone on the internet can spend the project's AI credits.
 */
export async function enforceAccess(req, res) {
  const tokenConfigured = String(process.env.SCAN_API_TOKEN || "").trim().length > 0;
  const allowedOrigins = parseEnvList(process.env.SCAN_ALLOWED_ORIGINS);
  const originsConfigured = allowedOrigins.length > 0;

  const { ok: originOk, origin } = isAllowedOrigin(req);
  const tokenOk = hasValidScanToken(req);
  applyCorsIfAllowed(res, originOk, origin);

  if (req.method === "OPTIONS") {
    if (originOk) {
      res.status(204).end();
      return false;
    }
    res.status(403).end();
    return false;
  }

  if (originsConfigured) {
    if (originOk || tokenOk) return true;
    res.status(403).json({ ok: false, code: "forbidden", message: "Origin not allowed" });
    return false;
  }

  if (tokenConfigured) {
    if (tokenOk) return true;
    res.status(401).json({ ok: false, code: "unauthorized", message: "Missing/invalid token" });
    return false;
  }

  // No server credentials to verify against; keep the previous behaviour rather
  // than locking the endpoint out entirely.
  if (!hasSupabaseServerConfig()) return true;

  const auth = await getRequestUser(req);
  if (auth.user) return true;

  res.status(401).json({
    ok: false,
    code: "unauthorized",
    message: "Authentication required",
    detail: auth.error || "missing_bearer_token",
  });
  return false;
}
