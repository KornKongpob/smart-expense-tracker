function readEnvValue(env, keys) {
  for (const key of keys) {
    const value = String(env?.[key] || "").trim();
    if (value) return value;
  }
  return "";
}

export function resolveSupabaseBrowserConfig(env = {}) {
  return {
    url: readEnvValue(env, ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"]),
    anonKey: readEnvValue(env, [
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ]),
  };
}

export function hasResolvedSupabaseBrowserConfig(env = {}) {
  const { url, anonKey } = resolveSupabaseBrowserConfig(env);
  return Boolean(url && anonKey);
}

export function createNextPublicSupabaseEnv(env = {}) {
  const { url, anonKey } = resolveSupabaseBrowserConfig(env);
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  };
}
