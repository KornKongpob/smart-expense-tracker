/**
 * Access control contract:
 * input: { req, res }
 * output: { allowed: boolean, handled: boolean }
 */

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

export function enforceAccess({ req, res }) {
  const tokenConfigured = String(process.env.SCAN_API_TOKEN || "").trim().length > 0;
  const { ok: originOk, origin } = isAllowedOrigin(req);

  const originsConfigured = parseEnvList(process.env.SCAN_ALLOWED_ORIGINS).length > 0;

  const tokenOk = hasValidScanToken(req);
  applyCorsIfAllowed(res, originOk, origin);

  if (req.method === "OPTIONS") {
    if (originOk) {
      res.status(204).end();
      return { allowed: false, handled: true };
    }
    res.status(403).end();
    return { allowed: false, handled: true };
  }

  if (originsConfigured) {
    if (originOk || tokenOk) return { allowed: true, handled: false };
    res.status(403).json({ ok: false, code: "forbidden", message: "Origin not allowed" });
    return { allowed: false, handled: true };
  }

  if (tokenConfigured) {
    if (tokenOk) return { allowed: true, handled: false };
    res.status(401).json({ ok: false, code: "unauthorized", message: "Missing/invalid token" });
    return { allowed: false, handled: true };
  }

  return { allowed: true, handled: false };
}

export function getClientIp(req) {
  const xf = String(req.headers?.["x-forwarded-for"] || "").trim();
  if (xf) return xf.split(",")[0].trim();
  const xr = String(req.headers?.["x-real-ip"] || "").trim();
  if (xr) return xr;
  return String(req.socket?.remoteAddress || "").trim() || "unknown";
}
