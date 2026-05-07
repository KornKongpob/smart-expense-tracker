import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const HOST = "127.0.0.1";
const PORT = 3310;
const BASE_URL = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 45_000;
const NEXT_BIN = path.join(ROOT_DIR, "node_modules", "next", "dist", "bin", "next");

function log(message) {
  process.stdout.write(`[e2e] ${message}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readBody(response) {
  return response.text();
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
      });

      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // Server is still starting up.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for dev server at ${url}`);
}

async function startDevServer() {
  const stdout = [];
  const stderr = [];
  const child = spawn(
    process.execPath,
    [NEXT_BIN, "dev", "--hostname", HOST, "--port", String(PORT)],
    {
      cwd: ROOT_DIR,
      env: { ...process.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    stdout.push(text);
    process.stdout.write(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    stderr.push(text);
    process.stderr.write(text);
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`\n[e2e] dev server exited early with code ${code}\n`);
    }
  });

  try {
    await waitForServer(`${BASE_URL}/api/health`, READY_TIMEOUT_MS);
    return {
      child,
      stdout,
      stderr,
    };
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

async function stopDevServer(child) {
  if (!child || child.killed) return;

  child.kill("SIGTERM");
  await delay(1000);

  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

async function request(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    redirect: "manual",
    ...options,
  });

  return response;
}

async function assertHtml(pathname) {
  const response = await request(pathname);
  const body = await readBody(response);

  assert(response.status === 200, `${pathname} should return 200, got ${response.status}`);
  assert(
    (response.headers.get("content-type") || "").includes("text/html"),
    `${pathname} should return HTML`,
  );
  assert(body.includes("Smart Expense"), `${pathname} should include app shell content`);
}

async function assertRedirect(pathname, location) {
  const response = await request(pathname);
  assert(
    response.status === 307 || response.status === 308,
    `${pathname} should redirect, got ${response.status}`,
  );
  assert(response.headers.get("location") === location, `${pathname} should redirect to ${location}`);
}

async function run() {
  log("starting Next.js smoke suite");
  const server = await startDevServer();

  try {
    const healthResponse = await request("/api/health");
    const healthJson = await healthResponse.json();
    assert(healthResponse.status === 200, "/api/health should return 200");
    assert(healthJson?.ok === true, "/api/health should return { ok: true }");

    await assertHtml("/");
    await assertHtml("/dashboard");
    await assertHtml("/inbox");
    await assertHtml("/add");
    await assertHtml("/accounts");
    await assertHtml("/categories");
    await assertHtml("/plan");
    await assertHtml("/assistant");
    await assertHtml("/planner");
    await assertHtml("/settings");

    await assertRedirect("/add-transaction", "/add");
    await assertRedirect("/budgets", "/planner");
    await assertRedirect("/recurring", "/planner");
    await assertRedirect("/stats", "/planner");

    const manifestResponse = await request("/manifest.json");
    const manifestJson = await manifestResponse.json();
    assert(manifestResponse.status === 200, "/manifest.json should return 200");
    assert(manifestJson?.start_url === "/dashboard?source=pwa", "manifest should point PWA start_url to /dashboard");

    const serviceWorkerResponse = await request("/sw.js");
    const serviceWorkerBody = await readBody(serviceWorkerResponse);
    assert(serviceWorkerResponse.status === 200, "/sw.js should return 200");
    assert(serviceWorkerBody.includes("/dashboard"), "service worker should fall back to /dashboard");

    log("smoke suite passed");
  } finally {
    await stopDevServer(server.child);
  }
}

run().catch((error) => {
  process.stderr.write(`\n[e2e] FAILED: ${String(error?.stack || error || "unknown error")}\n`);
  process.exitCode = 1;
});
