/**
 * Shared API response normalizer preserving contract: { ok, code, message }
 */

export function normalizeErrorResponse({ status, body }) {
  const safeStatus = Number(status) || 500;
  const b = body && typeof body === "object" ? body : {};
  const ok = b.ok === true;
  if (ok) return { status: safeStatus, body: b };

  return {
    status: safeStatus,
    body: {
      ok: false,
      code: String(b.code || "server_error"),
      message: String(b.message || "Internal server error"),
      ...b,
    },
  };
}
