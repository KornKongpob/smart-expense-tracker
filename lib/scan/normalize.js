export function normalizeErrorResponse({ status = 500, code = "server_error", message = "Internal server error", extra = {} } = {}) {
  return {
    status,
    body: { ok: false, code, message, ...extra },
  };
}
