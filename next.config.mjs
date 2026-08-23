import nextEnv from "@next/env";

import { createNextPublicSupabaseEnv } from "./src/lib/supabase/env.js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const nextConfig = {
  env: createNextPublicSupabaseEnv(process.env),
  async redirects() {
    return [
      {
        source: "/add-transaction",
        destination: "/add",
        permanent: true,
      },
      {
        source: "/budgets",
        destination: "/planner",
        permanent: true,
      },
      {
        source: "/stats",
        destination: "/planner",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
