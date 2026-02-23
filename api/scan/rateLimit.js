import { getClientIp } from "./access.js";

/**
 * Rate-limit contract:
 * input: { req, res }
 * output: { allowed: boolean, handled: boolean }
 */
export function createRateLimiter({ limitPerMinute = 30, windowMs = 60_000 } = {}) {
  const bucket = new Map();

  return function enforceRateLimit({ req, res }) {
    const limit = Number.isFinite(limitPerMinute) && limitPerMinute > 0 ? limitPerMinute : 0;
    if (!limit) return { allowed: true, handled: false };

    const ip = getClientIp(req);
    const key = `scan:${ip}`;
    const now = Date.now();

    const rec = bucket.get(key);
    if (!rec || now >= rec.resetAt) {
      bucket.set(key, { resetAt: now + windowMs, count: 1 });
      return { allowed: true, handled: false };
    }

    rec.count += 1;
    if (rec.count <= limit) return { allowed: true, handled: false };

    const retryAfterSec = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({ ok: false, code: "rate_limited", message: "Too many requests" });
    return { allowed: false, handled: true };
  };
}
