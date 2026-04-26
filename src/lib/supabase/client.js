import { createClient } from "@supabase/supabase-js";

import { hasResolvedSupabaseBrowserConfig, resolveSupabaseBrowserConfig } from "./env.js";

let browserClient = null;

const BROWSER_SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export function getSupabaseBrowserConfig() {
  return resolveSupabaseBrowserConfig(BROWSER_SUPABASE_ENV);
}

export function hasSupabaseBrowserConfig() {
  return hasResolvedSupabaseBrowserConfig(BROWSER_SUPABASE_ENV);
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
