import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = String(argv[index] || "");
    if (!item.startsWith("--")) continue;

    const normalized = item.slice(2);
    const [rawKey, inlineValue] = normalized.split("=", 2);
    const key = rawKey.trim();
    const nextValue = argv[index + 1];

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    if (!nextValue || String(nextValue).startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }

  return options;
}

const args = parseArgs(process.argv.slice(2));

function readTrimmedEnv(name) {
  return String(process.env[name] || "").trim();
}

function isFlagEnabled(name) {
  return args[name] === true || args[name] === "true";
}

function resolveCommand(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function logStep(message) {
  console.log(`[supabase:setup] ${message}`);
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function callManagementApi(endpoint, options = {}) {
  const accessToken = readTrimmedEnv("SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required");
  }

  const response = await fetch(`https://api.supabase.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const body = await readJsonResponse(response);

  if (!response.ok) {
    const detail =
      body?.message ||
      body?.error ||
      body?.msg ||
      body?.raw ||
      JSON.stringify(body);
    throw new Error(`Supabase API ${response.status}: ${detail}`);
  }

  return body;
}

function normalizeApiKeys(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.keys)) return payload.keys;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function getApiKeyValue(entry) {
  return String(
    entry?.api_key ||
      entry?.apiKey ||
      entry?.key ||
      entry?.secret ||
      entry?.token ||
      "",
  ).trim();
}

function getApiKeyLabel(entry) {
  return [
    entry?.type,
    entry?.name,
    entry?.description,
    entry?.prefix,
    entry?.slug,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findKey(entries, matchGroups) {
  for (const patterns of matchGroups) {
    const match = entries.find((entry) => {
      const label = getApiKeyLabel(entry);
      return patterns.every((pattern) => pattern.test(label)) && getApiKeyValue(entry);
    });

    if (match) return getApiKeyValue(match);
  }

  return "";
}

function upsertEnvBlock(existingContent, updates) {
  const lines = existingContent ? existingContent.split(/\r?\n/) : [];
  const handled = new Set();
  const nextLines = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=.*$/u.exec(line);
    if (!match) return line;

    const key = match[1];
    if (!(key in updates)) return line;

    handled.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (handled.has(key)) continue;
    nextLines.push(`${key}=${value}`);
  }

  return `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

async function writeLocalEnv(updates) {
  const envPath = path.join(rootDir, ".env.local");
  let current = "";

  try {
    current = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const next = upsertEnvBlock(current, updates);
  await fs.writeFile(envPath, next, "utf8");
  logStep("Updated .env.local with Supabase runtime values");
}

function runVercelEnvAdd(name, environment, value) {
  const result = spawnSync(
    resolveCommand("vercel"),
    ["env", "add", name, environment, "--force"],
    {
      cwd: rootDir,
      input: `${value}\n`,
      encoding: "utf8",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Vercel env add failed for ${name} (${environment}): ${detail}`);
  }
}

function syncVercelEnv(updates) {
  const targets = ["development", "preview", "production"];

  for (const [name, value] of Object.entries(updates)) {
    for (const target of targets) {
      runVercelEnvAdd(name, target, value);
    }
  }

  logStep("Updated linked Vercel environments");
}

async function runMigration(projectRef, migrationSql) {
  await callManagementApi(`/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    body: JSON.stringify({
      query: migrationSql,
      read_only: false,
    }),
  });

  logStep("Applied SQL migration through Supabase Management API");
}

async function verifySchema(projectRef) {
  const payload = await callManagementApi(
    `/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: "POST",
      body: JSON.stringify({
        query: `
          select json_build_object(
            'profiles', to_regclass('public.profiles') is not null,
            'categories', to_regclass('public.categories') is not null,
            'accounts', to_regclass('public.accounts') is not null,
            'scan_documents', to_regclass('public.scan_documents') is not null,
            'transactions', to_regclass('public.transactions') is not null,
            'transaction_line_items', to_regclass('public.transaction_line_items') is not null,
            'import_runs', to_regclass('public.import_runs') is not null
          ) as result;
        `,
      }),
    },
  );

  const rows = Array.isArray(payload) ? payload : payload?.result || payload?.data || payload?.rows || [];
  logStep(`Schema verification completed (${JSON.stringify(rows).slice(0, 200)})`);
}

async function main() {
  const projectRef = String(args.ref || readTrimmedEnv("SUPABASE_PROJECT_REF") || "").trim();
  if (!projectRef) {
    throw new Error("Project ref is required. Pass --ref=<project-ref> or set SUPABASE_PROJECT_REF.");
  }

  const migrationPath = path.resolve(
    rootDir,
    String(args.migration || "supabase/migrations/20260328_initial_redesign.sql"),
  );

  const skipLocalEnv = isFlagEnabled("skip-local-env");
  const skipVercelEnv = isFlagEnabled("skip-vercel-env");
  const skipMigration = isFlagEnabled("skip-migration");
  const skipVerify = isFlagEnabled("skip-verify");

  logStep(`Using project ${projectRef}`);

  const apiKeys = normalizeApiKeys(
    await callManagementApi(`/v1/projects/${projectRef}/api-keys?reveal=true`),
  );

  if (!apiKeys.length) {
    throw new Error("No API keys were returned from Supabase Management API.");
  }

  const publicKey = findKey(apiKeys, [[/publishable/], [/anon/], [/public/]]);
  const serviceRoleKey = findKey(apiKeys, [[/service[_ -]?role/], [/\bsecret\b/], [/service/]]);

  if (!publicKey) {
    throw new Error("Could not find a publishable/anon API key for the project.");
  }

  if (!serviceRoleKey) {
    throw new Error("Could not find a service role/secret API key for the project.");
  }

  const supabaseUrl = `https://${projectRef}.supabase.co`;
  const accountDigitsKey =
    readTrimmedEnv("SUPABASE_ACCOUNT_DIGITS_KEY") || crypto.randomBytes(32).toString("base64url");

  const runtimeEnv = {
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: publicKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SUPABASE_ACCOUNT_DIGITS_KEY: accountDigitsKey,
  };

  if (!skipLocalEnv) {
    await writeLocalEnv(runtimeEnv);
  }

  if (!skipVercelEnv) {
    syncVercelEnv(runtimeEnv);
  }

  if (!skipMigration) {
    const migrationSql = await fs.readFile(migrationPath, "utf8");
    await runMigration(projectRef, migrationSql);
  }

  if (!skipVerify) {
    await verifySchema(projectRef);
  }

  logStep("Setup completed successfully");
}

main().catch((error) => {
  console.error(`[supabase:setup] ${error.message}`);
  process.exitCode = 1;
});
