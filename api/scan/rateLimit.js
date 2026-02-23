function getClientIp(req) {
  const xf = String(req.headers?.["x-forwarded-for"] || "").trim();
  if (xf) return xf.split(",")[0].trim();
  const xr = String(req.headers?.["x-real-ip"] || "").trim();
  if (xr) return xr;
  return String(req.socket?.remoteAddress || "").trim() || "unknown";
}

export function createRateLimiter({
  keyPrefix = "scan",
  limit = Number(process.env.SCAN_RATE_LIMIT_PER_MINUTE || 30),
  windowMs = 60_000,
} = {}) {
  const store = new Map();
  return function rateLimit(req, res) {
    const cap = Number.isFinite(limit) && limit > 0 ? limit : 0;
    if (!cap) return true;

    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const rec = store.get(key);
    if (!rec || now >= rec.resetAt) {
      store.set(key, { resetAt: now + windowMs, count: 1 });
      return true;
    }

    rec.count += 1;
    if (rec.count <= cap) return true;

    const retryAfterSec = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({ ok: false, code: "rate_limited", message: "Too many requests" });
    return false;
  };
}
