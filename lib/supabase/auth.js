import { createSupabaseTokenClient, hasSupabaseServerConfig } from "./admin.js";

export function readBearerToken(req) {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || "").trim();
  if (!header) return "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

export async function getRequestUser(req) {
  if (!hasSupabaseServerConfig()) {
    return { user: null, token: "", error: "supabase_server_env_missing" };
  }

  const token = readBearerToken(req);
  if (!token) {
    return { user: null, token: "", error: "missing_bearer_token" };
  }

  try {
    const client = createSupabaseTokenClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      return { user: null, token, error: String(error?.message || "auth_user_lookup_failed") };
    }
    return { user: data.user, token, error: "" };
  } catch (error) {
    return {
      user: null,
      token,
      error: String(error?.message || error || "auth_user_lookup_failed"),
    };
  }
}

export async function requireRequestUser(req, res) {
  const auth = await getRequestUser(req);
  if (auth.user) return auth;

  if (res && typeof res.status === "function") {
    res.status(401).json({
      ok: false,
      code: "unauthorized",
      message: "Authentication required",
      detail: auth.error || "missing_bearer_token",
    });
  }
  return null;
}
