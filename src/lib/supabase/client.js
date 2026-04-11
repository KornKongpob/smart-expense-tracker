import { createClient } from "@supabase/supabase-js";

let browserClient = null;

function readStaticEnvUrl() {
  return String(import.meta.env.VITE_SUPABASE_URL || "").trim();
}

function readStaticEnvKey() {
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
}

export function getSupabaseBrowserConfig() {
  return {
    url: readStaticEnvUrl(),
    anonKey: readStaticEnvKey(),
  };
}

export function hasSupabaseBrowserConfig() {
  const { url, anonKey } = getSupabaseBrowserConfig();
  return !!url && !!anonKey;
}

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const { url, anonKey } = getSupabaseBrowserConfig();
  if (!url || !anonKey) {
    throw new Error("supabase_browser_env_missing");
  }

  browserClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "X-Client-Info": "smart-expense/web",
      },
    },
  });

  return browserClient;
}
