import { createClient } from "@supabase/supabase-js";

let cachedAdmin = null;

function getEnv(name, fallbackName = "") {
  return String(process.env[name] || (fallbackName ? process.env[fallbackName] : "") || "").trim();
}

export function getSupabaseServerConfig() {
  return {
    url: getEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    anonKey: getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function hasSupabaseServerConfig() {
  const { url, anonKey, serviceRoleKey } = getSupabaseServerConfig();
  return !!url && !!anonKey && !!serviceRoleKey;
}

export function getSupabaseAdmin() {
  if (cachedAdmin) return cachedAdmin;

  const { url, serviceRoleKey } = getSupabaseServerConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("supabase_server_env_missing");
  }

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "X-Client-Info": "smart-expense/server-admin",
      },
    },
  });

  return cachedAdmin;
}

export function createSupabaseTokenClient(accessToken = "") {
  const { url, anonKey } = getSupabaseServerConfig();
  if (!url || !anonKey) {
    throw new Error("supabase_server_env_missing");
  }

  const token = String(accessToken || "").trim();
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Client-Info": "smart-expense/server-auth",
          },
        }
      : {
          headers: {
            "X-Client-Info": "smart-expense/server-auth",
          },
        },
  });
}
