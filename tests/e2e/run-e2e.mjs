import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { chromium, devices } from "playwright";

import scanHandler from "../../api/scan.js";
import scanReceiptHandler from "../../api/scan-receipt.js";
import geminiScanHandler from "../../api/gemini-scan.js";
import {
  STORAGE_KEY,
  ONBOARDING_KEY,
  PIN_KEY,
  THEME_KEY,
  createBackupPayload,
  createImportBackupPayload,
  createSeedState,
  createStorageRecord,
} from "./fixtures/seed-state.mjs";
import {
  RECEIPT_SCAN_FIXTURE,
  SLIP_SCAN_FIXTURE,
  buildScanApiResponse,
} from "./fixtures/scan-fixtures.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const ARTIFACTS_DIR = path.join(ROOT_DIR, ".codex-artifacts", "e2e");
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, "screenshots");
const DOWNLOADS_DIR = path.join(ARTIFACTS_DIR, "downloads");
const FIXTURES_DIR = path.join(ARTIFACTS_DIR, "fixtures");

const MOBILE_DEVICE = devices["iPhone 12"];
const DEFAULT_TIMEOUT_MS = 20_000;

function log(message) {
  process.stdout.write(`[e2e] ${message}\n`);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonMaybe(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function sanitizeFileName(value) {
  return String(value || "artifact")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artifact";
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[ext] || "application/octet-stream";
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end(body);
    return res;
  };
  return res;
}

function stripWrappingQuotes(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = stripWrappingQuotes(match[2]);
    if (!(key in process.env)) {
      process.env[key] = rawValue;
    }
  }
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function ensureArtifacts() {
  await ensureDir(ARTIFACTS_DIR);
  await ensureDir(SCREENSHOTS_DIR);
  await ensureDir(DOWNLOADS_DIR);
  await ensureDir(FIXTURES_DIR);
}

async function runCommand(command, args, { cwd = ROOT_DIR, env = process.env } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function ensureBuiltApp() {
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) return;
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  log("dist/ missing, running build before e2e");
  await runCommand(npmCmd, ["run", "build"]);
}

function serveStaticFile(res, absolutePath) {
  const body = fs.readFileSync(absolutePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", getContentType(absolutePath));
  res.end(body);
}

async function createAppServer() {
  await ensureBuiltApp();

  const server = http.createServer(async (req, res) => {
    decorateResponse(res);
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    try {
      if (pathname === "/api/health") {
        res.status(200).json({ ok: true });
        return;
      }

      if (pathname === "/api/scan") {
        await scanHandler(req, res);
        return;
      }

      if (pathname === "/api/scan-receipt") {
        await scanReceiptHandler(req, res);
        return;
      }

      if (pathname === "/api/gemini-scan") {
        await geminiScanHandler(req, res);
        return;
      }

      const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const requestedPath = path.resolve(DIST_DIR, relativePath);
      const safeBase = `${DIST_DIR}${path.sep}`;
      const isInsideDist = requestedPath === DIST_DIR || requestedPath.startsWith(safeBase);

      if (isInsideDist && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
        serveStaticFile(res, requestedPath);
        return;
      }

      const fallbackPath = path.join(DIST_DIR, "index.html");
      serveStaticFile(res, fallbackPath);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(String(error?.stack || error || "server_error"));
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseURL = `http://127.0.0.1:${port}`;

  return {
    server,
    baseURL,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(lines) {
  const safeLines = Array.isArray(lines) ? lines.filter(Boolean).map((line) => String(line)) : [];
  const operations = ["BT", "/F1 16 Tf"];
  let y = 770;

  for (const line of safeLines) {
    operations.push(`1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= 22;
  }

  operations.push("ET");
  const stream = operations.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let output = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((objectBody, index) => {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(output, "utf8");
}

async function writeFixtureFile(fileName, content, encoding = null) {
  const absolutePath = path.join(FIXTURES_DIR, fileName);
  if (encoding) {
    await fsp.writeFile(absolutePath, content, encoding);
  } else {
    await fsp.writeFile(absolutePath, content);
  }
  return absolutePath;
}

async function ensureFixtureAssets() {
  const receiptFixturePath = await writeFixtureFile(
    "fixture-receipt.pdf",
    buildSimplePdf([
      "Cafe Bloom",
      "Receipt",
      "Date: 25/03/2026",
      "Iced Latte 145.00",
      "Butter Croissant 120.00",
      "Total 265.00 THB",
      "Card ending 2345",
      "Ref RCPT-265",
    ]),
  );

  const slipFixturePath = await writeFixtureFile(
    "fixture-slip.pdf",
    buildSimplePdf([
      "Transfer Slip",
      "Date: 25/03/2026",
      "From SCB Everyday 2345",
      "To Krungsri Platinum 9988",
      "PromptPay credit card payment",
      "Amount 1200.00 THB",
      "Reference TRX1234",
    ]),
  );

  const realReceiptPath = await writeFixtureFile(
    "real-receipt.pdf",
    buildSimplePdf([
      "Cafe Bloom",
      "Official Receipt",
      "Date 25 March 2026",
      "Iced Latte 145.00",
      "Butter Croissant 120.00",
      "Subtotal 265.00",
      "Total 265.00 THB",
      "Paid by SCB 2345",
      "Reference RCPT265",
    ]),
  );

  const realSlipPath = await writeFixtureFile(
    "real-slip.pdf",
    buildSimplePdf([
      "Payment Transfer Slip",
      "Date 25 March 2026",
      "From account 2345 SCB Everyday",
      "To account 9988 Krungsri Platinum",
      "Credit card payment",
      "Amount 1200.00 THB",
      "Reference TRX1234",
    ]),
  );

  const importBackupPath = await writeFixtureFile(
    "import-backup.json",
    JSON.stringify(createImportBackupPayload(), null, 2),
    "utf8",
  );

  return {
    receiptFixturePath,
    slipFixturePath,
    realReceiptPath,
    realSlipPath,
    importBackupPath,
  };
}

async function createBrowser() {
  try {
    return await chromium.launch({
      channel: "msedge",
      headless: true,
    });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function createMobileContext(browser, baseURL) {
  return browser.newContext({
    ...MOBILE_DEVICE,
    baseURL,
    acceptDownloads: true,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    colorScheme: "light",
  });
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOTS_DIR, `${sanitizeFileName(name)}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function waitFor(locator, label, timeout = DEFAULT_TIMEOUT_MS) {
  await locator.waitFor({ state: "visible", timeout });
}

async function safeClick(locator, label = "control") {
  await waitFor(locator, label);
  await locator.click();
}

async function saveDownload(download, fileName) {
  const targetPath = path.join(DOWNLOADS_DIR, sanitizeFileName(fileName));
  await download.saveAs(targetPath);
  return targetPath;
}

async function readAppData(page) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.data || null;
    } catch {
      return null;
    }
  }, STORAGE_KEY);
}

async function getCollectionCount(page, key) {
  const data = await readAppData(page);
  const collection = data?.[key];
  return Array.isArray(collection) ? collection.length : 0;
}

async function waitForState(page, predicate, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await readAppData(page);
    if (predicate(data)) return data;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for state: ${label}`);
}

async function seedPage(
  page,
  baseURL,
  {
    data = null,
    onboardingDone = false,
    pin = "",
    theme = "light",
  } = {},
) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const record = data ? createStorageRecord(data) : null;

  await page.evaluate(
    ({ storageKey, onboardingKey, pinKey, themeKey, recordValue, onboarding, pinValue, themeValue }) => {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(onboardingKey);
      localStorage.removeItem(pinKey);
      sessionStorage.removeItem("add.entryMode.force");
      sessionStorage.removeItem("add.scanUploadKind.force");
      sessionStorage.removeItem("add.txType.force");

      if (recordValue) {
        localStorage.setItem(storageKey, JSON.stringify(recordValue));
      }

      if (onboarding) {
        localStorage.setItem(onboardingKey, "1");
      }

      if (pinValue) {
        localStorage.setItem(pinKey, pinValue);
      }

      if (themeValue) {
        localStorage.setItem(themeKey, themeValue);
        document.documentElement.setAttribute("data-theme", themeValue === "dark" ? "dark" : "");
      }
    },
    {
      storageKey: STORAGE_KEY,
      onboardingKey: ONBOARDING_KEY,
      pinKey: PIN_KEY,
      themeKey: THEME_KEY,
      recordValue: record,
      onboarding: onboardingDone,
      pinValue: pin,
      themeValue: theme,
    },
  );

  await page.reload({ waitUntil: "domcontentloaded" });
}

async function ensureNavbar(page) {
  await waitFor(page.getByTestId("nav-today"), "navbar");
}

async function openToday(page) {
  await ensureNavbar(page);
  await page.getByTestId("nav-today").click();
  await waitFor(page.getByTestId("today-action-receipt"), "today view");
}

async function openInbox(page) {
  await ensureNavbar(page);
  await page.getByTestId("nav-inbox").click();
  await waitFor(page.getByRole("button", { name: /Pending/i }).first(), "inbox view");
}

async function openScan(page) {
  await ensureNavbar(page);
  await page.getByTestId("nav-scan").click();
  await waitFor(page.getByTestId("add-lane-receipt"), "scan view");
}

async function closeAddView(page) {
  const closeButton = page.getByRole("button", { name: /close/i }).first();
  await waitFor(closeButton, "close add view");
  await closeButton.click();
  await waitFor(page.getByTestId("today-action-receipt"), "today after closing add");
}

async function openAccounts(page) {
  await ensureNavbar(page);
  await page.getByTestId("nav-accounts").click();
  await waitFor(page.getByTestId("accounts-add"), "accounts view");
}

async function openHub(page) {
  await ensureNavbar(page);
  await page.getByTestId("nav-hub").click();
  await waitFor(page.getByTestId("hub-analytics"), "hub view");
}

async function acceptConfirmIfVisible(page) {
  const confirmButton = page.getByTestId("confirm-accept");
  if (await confirmButton.count()) {
    if (await confirmButton.first().isVisible().catch(() => false)) {
      await confirmButton.first().dispatchEvent("click");
      return true;
    }
  }
  return false;
}

async function selectAccountFromPicker(page, testId, accountName) {
  await page.getByTestId(testId).click();
  const dialog = page.locator('[role="dialog"]').last();
  await waitFor(dialog, `account picker ${testId}`);
  const accountButton = dialog.getByRole("button", {
    name: new RegExp(escapeRegex(accountName), "i"),
  }).first();
  await accountButton.click();
}

async function chooseCategoryValue(page, value, { index = 0 } = {}) {
  const select = page.locator("select").nth(index);
  await waitFor(select, `category select ${value}`);
  await select.selectOption(value);
}

async function chooseCategoryFromPicker(page, searchText, optionText) {
  const searchInput = page.getByPlaceholder(/ค้นหาหมวดหมู่/i).first();
  await waitFor(searchInput, `category picker ${optionText}`);
  await searchInput.fill(searchText);
  const option = page.getByRole("button", { name: new RegExp(escapeRegex(optionText), "i") }).first();
  await waitFor(option, `category option ${optionText}`);
  await option.click();
}

async function waitForButtonEnabled(buttonLocator, label, timeout = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const disabled = await buttonLocator.isDisabled().catch(() => true);
    if (!disabled) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for enabled button: ${label}`);
}

async function fillAmountField(page, value) {
  const amountInput = page.getByPlaceholder("เช่น 1200.50").first();
  await waitFor(amountInput, "amount field");
  await amountInput.fill(String(value));
}

async function clickStepperNext(page, label = "ถัดไป") {
  const nextButton = page.getByRole("button", { name: /ถัดไป|บันทึกการแก้ไข/ }).last();
  await waitFor(nextButton, label);
  await nextButton.click();
}

function detectFixtureKind(routeRequest) {
  const buffer = routeRequest.postDataBuffer() || Buffer.alloc(0);
  const text = buffer.toString("utf8");
  if (/fixture-slip|real-slip/i.test(text)) return "slip";
  return "receipt";
}

async function registerFixtureScanRoutes(context) {
  await context.route("**/api/scan*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }

    const kind = detectFixtureKind(request);
    const payload =
      kind === "slip"
        ? buildScanApiResponse(SLIP_SCAN_FIXTURE)
        : buildScanApiResponse(RECEIPT_SCAN_FIXTURE);

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payload),
    });
  });
}

async function runScenario(browser, baseURL, name, task) {
  const context = await createMobileContext(browser, baseURL);
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  try {
    log(`starting scenario: ${name}`);
    await task({ context, page, baseURL });
    await screenshot(page, `${name}-pass`);
    log(`scenario passed: ${name}`);
  } catch (error) {
    await screenshot(page, `${name}-fail`);
    throw error;
  } finally {
    await context.close();
  }
}

async function scenarioOnboarding({ page, baseURL }) {
  await seedPage(page, baseURL, {
    data: null,
    onboardingDone: false,
    pin: "",
    theme: "light",
  });

  await waitFor(page.getByRole("button", { name: /ต่อไป/i }).first(), "onboarding step 1");
  await page.getByRole("button", { name: /ต่อไป/i }).first().click();
  await page.getByRole("button", { name: /ต่อไป/i }).first().click();
  await page.locator('input[placeholder="เช่น 15000"]').fill("25000");
  await page.getByRole("button", { name: /เริ่มใช้งาน/i }).click();

  await ensureNavbar(page);
  await waitFor(page.getByTestId("today-action-receipt"), "today after onboarding");
}

async function scenarioSeededCore({ context, page, baseURL }) {
  await registerFixtureScanRoutes(context);
  await seedPage(page, baseURL, {
    data: createSeedState(),
    onboardingDone: true,
    pin: "",
    theme: "light",
  });

  await openToday(page);
  await waitFor(page.getByText(/Today spend/i), "today metrics");

  await page.getByTestId("today-action-receipt").click();
  await waitFor(page.getByTestId("scan-kind-receipt"), "quick receipt flow");
  await closeAddView(page);

  await page.getByTestId("today-action-slip").click();
  await waitFor(page.getByTestId("scan-kind-slip"), "quick slip flow");
  await closeAddView(page);

  await page.getByTestId("today-action-manual").click();
  await waitFor(page.getByTestId("manual-type-expense"), "quick manual flow");
  await closeAddView(page);

  await page.getByTestId("today-action-transfer").click();
  await waitFor(page.getByTestId("manual-type-transfer"), "quick transfer flow");
  await closeAddView(page);

  await openAccounts(page);
  await page.getByTestId("accounts-add").click();
  await waitFor(page.getByTestId("institution-bbl"), "create account modal");
  await page.getByTestId("institution-bbl").dispatchEvent("click");
  await page.locator('input[placeholder="เช่น KBank / เงินสด / Visa"]').first().fill("Bangkok Bank Travel");
  await page.getByPlaceholder(/6345, 4373/i).fill("1234");
  await page.getByTestId("account-create-save").dispatchEvent("click");
  await waitFor(page.getByText("Bangkok Bank Travel"), "created bank account");

  await page.getByTestId("account-edit-acc_scb_everyday").click();
  await waitFor(page.getByTestId("account-edit-save"), "edit account modal");
  await page.locator('input[placeholder="เช่น KBank / เงินสด / Visa"]').last().fill("SCB Everyday Plus");
  await page.getByTestId("account-edit-save").dispatchEvent("click");
  await waitFor(page.getByText("SCB Everyday Plus"), "edited account name");

  await page.getByTestId("account-delete-acc_linebk_spare").click();
  await acceptConfirmIfVisible(page);
  await page.getByTestId("account-delete-acc_linebk_spare").waitFor({ state: "detached" });

  let txCount = await getCollectionCount(page, "transactions");
  let inboxCount = await getCollectionCount(page, "inbox");

  await openScan(page);
  await page.getByTestId("add-lane-manual").click();
  await waitFor(page.getByTestId("manual-save"), "manual expense");
  await fillAmountField(page, "125.50");
  await page.getByTitle("SCB Everyday Plus").click();
  await chooseCategoryFromPicker(page, "กาแฟ", "กาแฟ/ชา");
  await page.locator('input[placeholder*="ชื่อร้าน"], input[placeholder*="รายละเอียด"]').first().fill("Afternoon coffee");
  await page.getByTestId("manual-save").click();
  await waitForState(page, (data) => (data?.transactions || []).length >= txCount + 1, "manual expense save");
  txCount = await getCollectionCount(page, "transactions");

  await openToday(page);
  await page.getByTestId("today-action-manual").click();
  await page.getByTestId("manual-type-income").click();
  await fillAmountField(page, "3500");
  await page.getByTitle("KTB Payroll").click();
  await chooseCategoryFromPicker(page, "เงินเดือน", "เงินเดือน");
  await page.locator('input[placeholder*="ชื่อร้าน"], input[placeholder*="รายละเอียด"]').first().fill("Side income");
  await page.getByTestId("manual-save").click();
  await waitForState(page, (data) => (data?.transactions || []).length >= txCount + 1, "manual income save");
  txCount = await getCollectionCount(page, "transactions");

  await openToday(page);
  await page.getByTestId("today-action-transfer").click();
  await fillAmountField(page, "800");
  await selectAccountFromPicker(page, "add-account-from", "SCB Everyday Plus");
  await selectAccountFromPicker(page, "add-account-to", "TrueMoney Wallet");
  await page.locator('input[placeholder*="รายละเอียด"], input[placeholder*="ธนาคาร"]').first().fill("Wallet top up");
  await page.getByTestId("manual-save").click();
  await waitForState(page, (data) => (data?.transactions || []).length >= txCount + 2, "transfer save");
  txCount = await getCollectionCount(page, "transactions");

  await openScan(page);
  await page.getByTestId("add-lane-manual").click();
  await page.getByTestId("manual-type-credit_payment").click();
  await fillAmountField(page, "1200");
  await selectAccountFromPicker(page, "add-credit-from", "SCB Everyday Plus");
  await selectAccountFromPicker(page, "add-credit-to", "Krungsri Platinum");
  await page.locator('input[placeholder*="ธนาคาร"], input[placeholder*="รายละเอียด"]').first().fill("March card payment");
  await page.getByTestId("manual-save").click();
  await waitForState(page, (data) => (data?.transactions || []).length >= txCount + 2, "credit payment save");
  txCount = await getCollectionCount(page, "transactions");

  await openScan(page);
  await page.getByTestId("add-lane-manual").click();
  await waitFor(page.getByTestId("manual-split-toggle"), "split entry");
  await page.getByTestId("manual-split-toggle").click();
  await page.getByPlaceholder(/Lotus receipt/i).fill("Cafe Bloom split");
  await chooseCategoryValue(page, "shopping", { index: 1 });
  await chooseCategoryValue(page, "food", { index: 0 });
  await page.locator('input[placeholder="0.00"]').nth(0).fill("145");
  await page.locator('input[placeholder="รายละเอียดเฉพาะบรรทัด (ถ้ามี)"]').nth(0).fill("Iced latte");
  await page.locator('input[placeholder="0.00"]').nth(1).fill("120");
  await page.locator('input[placeholder="รายละเอียดเฉพาะบรรทัด (ถ้ามี)"]').nth(1).fill("Croissant");
  await page.getByTestId("manual-save").click();
  await waitForState(page, (data) => (data?.transactions || []).length >= txCount + 3, "split save");
  txCount = await getCollectionCount(page, "transactions");

  await openScan(page);
  await page.getByTestId("add-lane-manual").click();
  await page.getByTitle("Krungsri Platinum").click();
  await fillAmountField(page, "2400");
  await chooseCategoryFromPicker(page, "อิเล็กทรอนิกส์", "อิเล็กทรอนิกส์");
  await page.getByText(/Advanced options/i).click();
  await page.getByTestId("manual-installment-toggle").scrollIntoViewIfNeeded();
  await page.getByTestId("manual-installment-toggle").dispatchEvent("click");
  await page.getByTestId("manual-installment-months").fill("4");
  await page.locator('input[placeholder*="ชื่อร้าน"], input[placeholder*="รายละเอียด"]').first().fill("Installment headphones");
  await page.getByTestId("manual-save").click();
  await waitForState(page, (data) => (data?.transactions || []).length >= txCount + 4, "installment save", 25_000);
  txCount = await getCollectionCount(page, "transactions");

  await openScan(page);
  await page.getByTestId("add-lane-receipt").click();
  await page.getByTestId("scan-file-input").setInputFiles(path.join(FIXTURES_DIR, "fixture-receipt.pdf"));
  await waitFor(page.getByText(/Review Queue/i), "receipt queue");
  await waitForButtonEnabled(page.getByTestId("scan-save-now"), "scan save now");
  await page.getByTestId("scan-save-now").click();
  await waitForState(page, (data) => (data?.transactions || []).length > txCount, "fixture receipt save", 25_000);
  txCount = await getCollectionCount(page, "transactions");

  await openScan(page);
  await page.getByTestId("add-lane-slip").click();
  await page.getByTestId("scan-slip-input").setInputFiles(path.join(FIXTURES_DIR, "fixture-slip.pdf"));
  await waitFor(page.getByText(/Review Queue/i), "slip queue");
  await waitForButtonEnabled(page.getByTestId("scan-send-inbox"), "scan send inbox");
  await page.getByTestId("scan-send-inbox").click();
  await waitForState(page, (data) => (data?.inbox || []).length > inboxCount, "fixture slip inbox");
  inboxCount = await getCollectionCount(page, "inbox");

  await openInbox(page);
  await waitFor(page.getByRole("button", { name: /Pending/i }).first(), "pending inbox list");
  await page.getByRole("button", { name: /^Edit$/ }).first().click();
  await waitFor(page.getByText(/แก้ไขรายการใน Inbox/i), "inbox edit modal");
  await clickStepperNext(page);
  await clickStepperNext(page);
  await clickStepperNext(page);
  await page.getByPlaceholder("เช่น รายละเอียดเพิ่มเติม").fill("Edited via e2e");
  await clickStepperNext(page);
  await page.getByRole("button", { name: /บันทึกการแก้ไข/i }).click();
  await page.getByText(/แก้ไขรายการใน Inbox/i).waitFor({ state: "detached" });

  const inboxSearch = page.getByPlaceholder(/ค้นหาใน Inbox/i);
  await inboxSearch.fill("Cafe Bloom");
  const pendingBeforeBulkApprove = await getCollectionCount(page, "inbox");
  await page.getByRole("button", { name: /Approve all shown/i }).click();
  await acceptConfirmIfVisible(page);
  await waitForState(page, (data) => (data?.inbox || []).length < pendingBeforeBulkApprove, "bulk approve filtered inbox items");
  await inboxSearch.fill("");

  const pendingBeforeBulkDelete = await getCollectionCount(page, "inbox");
  await page.getByRole("button", { name: /Select duplicates/i }).click();
  await page.getByRole("button", { name: /Delete selected/i }).click();
  await acceptConfirmIfVisible(page);
  await waitForState(page, (data) => (data?.inbox || []).length < pendingBeforeBulkDelete, "bulk delete inbox items");
  inboxCount = await getCollectionCount(page, "inbox");

  await page.getByRole("button", { name: /Approved/i }).first().click();
  await waitFor(page.getByRole("button", { name: /Clear/i }).first(), "approved inbox tab");

  await openHub(page);
  await page.getByTestId("hub-analytics").click();
  await waitFor(page.getByText(/สรุปผล/i), "analytics view");
  await openHub(page);

  await page.getByTestId("hub-budgets").click();
  await waitFor(page.getByTestId("budget-daily-card"), "budgets view");
  await page.getByTestId("budget-daily-card").click();
  await page.getByTestId("budget-limit-input").fill("95000");
  await page.getByTestId("budget-alert-input").fill("95");
  await page.getByTestId("budget-save").click();
  await page.getByTestId("budget-monthly-card").click();
  await page.getByTestId("budget-limit-input").fill("2600000");
  await page.getByTestId("budget-alert-input").fill("90");
  await page.getByTestId("budget-save").click();
  await openHub(page);

  await page.getByTestId("hub-categories").click();
  await waitFor(page.getByTestId("categories-add"), "categories view");
  await page.getByTestId("categories-add").click();
  await page.getByTestId("category-name-input").fill("Parking");
  await page.getByTestId("category-keyword-input").fill("parking, car park");
  await page.getByRole("button", { name: /^\+?\s*เพิ่ม$/i }).click();
  await page.getByTestId("categories-save").click();
  await waitForState(
    page,
    (data) => (data?.categories?.expense || []).some((category) => category?.name === "Parking"),
    "new category",
  );
  await openHub(page);

  await page.getByTestId("hub-rules").click();
  await waitFor(page.getByTestId("rules-add"), "rules view");
  await page.getByTestId("rules-add").click();
  await page.getByTestId("rules-name-input").fill("Cafe Bloom -> Coffee");
  await page.getByPlaceholder(/GRAB/i).fill("Cafe Bloom");
  await page.locator("select").first().selectOption("expense");
  await chooseCategoryValue(page, "food", { index: 1 });
  await page.getByTestId("rules-save").click();

  let data = await readAppData(page);
  const createdRule = (data?.rules || []).find((rule) => rule?.name === "Cafe Bloom -> Coffee");
  if (!createdRule) {
    throw new Error("Created rule not found in state");
  }

  await page.getByTestId("rules-edit-rule_grab_transport").click();
  await page.getByTestId("rules-name-input").fill("Grab -> Ride hailing updated");
  await page.getByTestId("rules-save").click();
  await page.getByTestId("rules-move-down-rule_grab_transport").click();
  await page.getByTestId("rules-move-up-rule_grab_transport").click();
  await page.getByTestId("rules-toggle-rule_grab_transport").click();
  await page.getByTestId(`rules-delete-${createdRule.id}`).click();
  await acceptConfirmIfVisible(page);
  await openHub(page);

  await page.getByTestId("hub-merchants").click();
  await waitFor(page.getByTestId("merchant-add"), "merchant library");
  await page.getByTestId("merchant-add").click();
  await page.getByTestId("merchant-name-input").fill("Blue Bottle Test");
  await page.getByTestId("merchant-aliases-input").fill("BLUE BOTTLE TEST\nBB TEST");
  await page.getByTestId("merchant-save").click();

  data = await readAppData(page);
  const createdMerchant = (data?.merchants || []).find((merchant) => merchant?.canonical === "Blue Bottle Test");
  if (!createdMerchant) {
    throw new Error("Created merchant not found in state");
  }

  await page.getByTestId(`merchant-edit-${createdMerchant.id}`).click();
  await page.getByTestId("merchant-aliases-input").fill("GRAB\nGRABFOOD\nGRAB TAXI");
  await page.getByTestId("merchant-save").click();

  data = await readAppData(page);
  const mergeCandidates = (data?.merchants || []).filter((merchant) => merchant?.id !== createdMerchant.id);
  if (mergeCandidates.length < 2) {
    throw new Error("Not enough merchants available for merge test");
  }
  const mergeTarget = mergeCandidates[0];
  const mergeSource = mergeCandidates[1];

  await page.getByTestId(`merchant-merge-${mergeSource.id}`).click();
  await page.getByTestId("merchant-merge-target").selectOption(mergeTarget.id);
  await page.getByTestId("merchant-merge-save").click();
  await acceptConfirmIfVisible(page);
  await page.getByTestId(`merchant-delete-${createdMerchant.id}`).click();
  await acceptConfirmIfVisible(page);
  await openHub(page);

  await page.getByTestId("hub-recurring").click();
  await waitFor(page.getByTestId("recurring-add"), "recurring view");
  await page.getByTestId("recurring-add").click();
  await page.getByTestId("recurring-amount-input").fill("199");
  await page.getByTestId("recurring-note-input").fill("Spotify Premium");
  await page.getByTestId("recurring-start-input").fill("2026-03-01");
  await page.getByTestId("recurring-save").click();

  data = await readAppData(page);
  const createdRecurring = (data?.recurring || []).find((item) => item?.note === "Spotify Premium");
  if (!createdRecurring) {
    throw new Error("Created recurring item not found in state");
  }

  await page.getByTestId("recurring-edit-rec_netflix").click();
  await page.getByTestId("recurring-note-input").fill("Netflix Premium");
  await page.getByTestId("recurring-save").click();
  await page.getByTestId("recurring-toggle-rec_salary_stub").click();
  const txBeforeRecurringRun = await getCollectionCount(page, "transactions");
  await page.getByTestId("recurring-run-now").click();
  await waitForState(page, (nextData) => (nextData?.transactions || []).length > txBeforeRecurringRun, "run recurring");
  await page.getByTestId(`recurring-delete-${createdRecurring.id}`).click();
  await acceptConfirmIfVisible(page);

  await openHub(page);
  await page.getByTestId("hub-theme").click();
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  await page.getByTestId("hub-theme").click();
  await page.waitForFunction(() => (document.documentElement.getAttribute("data-theme") || "") === "");

  await page.getByTestId("hub-security").click();
  await waitFor(page.getByTestId("hub-pin-input"), "pin modal");
  await page.getByTestId("hub-pin-input").fill("135790");
  await page.getByTestId("hub-pin-confirm").fill("135790");
  await page.getByTestId("hub-pin-save").dispatchEvent("click");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(page.getByText(/ปลดล็อก/i), "pin lock screen");
  for (const digit of "135790") {
    await page.getByRole("button", { name: new RegExp(`digit ${digit}`, "i") }).click();
  }
  await ensureNavbar(page);
  await openHub(page);
  await page.getByTestId("hub-security").click();
  await waitFor(page.getByTestId("hub-pin-remove"), "remove pin");
  await page.getByTestId("hub-pin-remove").dispatchEvent("click");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureNavbar(page);

  await openHub(page);
  const backupDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("hub-export-backup").click();
  const backupDownload = await backupDownloadPromise;
  const backupPath = await saveDownload(backupDownload, "backup-export.json");
  const backupJson = parseJsonMaybe(await fsp.readFile(backupPath, "utf8"));
  if (!backupJson?.data?.accounts?.length) {
    throw new Error("Backup export did not contain accounts");
  }

  const csvDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("hub-export-csv").click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await saveDownload(csvDownload, "transactions-export.csv");
  const csvText = await fsp.readFile(csvPath, "utf8");
  if (!/date|amount|category/i.test(csvText)) {
    throw new Error("CSV export did not contain expected headers");
  }
}

async function scenarioImportAndReset({ page, baseURL }) {
  await seedPage(page, baseURL, {
    data: createSeedState(),
    onboardingDone: true,
    pin: "",
    theme: "light",
  });

  await openHub(page);
  await page.getByTestId("hub-import-file").setInputFiles(path.join(FIXTURES_DIR, "import-backup.json"));
  await waitFor(page.getByTestId("confirm-accept"), "import confirm");
  await acceptConfirmIfVisible(page);
  await waitForState(
    page,
    (data) =>
      !!(data?.accounts || []).find((account) => account?.id === "acc_import_bbl") &&
      !!(data?.transactions || []).find((transaction) => transaction?.id === "tx_import_marker"),
    "backup import",
    25_000,
  );

  const importedData = await readAppData(page);
  const importedTx = (importedData?.transactions || []).find((transaction) => transaction?.id === "tx_import_marker");
  if (!importedTx || importedTx.note !== "Imported backup marker") {
    throw new Error("Imported backup marker transaction missing");
  }

  await openHub(page);
  await page.getByTestId("hub-reset").click();
  await acceptConfirmIfVisible(page);
  await waitFor(page.getByRole("button", { name: /ต่อไป|เริ่มใช้งาน/i }).first(), "onboarding after reset", 25_000);
}

async function scenarioRealScan({ page, baseURL }) {
  if (!String(process.env.OPENAI_API_KEY || "").trim()) {
    log("skipping real-scan scenario because OPENAI_API_KEY is not available");
    return;
  }

  await seedPage(page, baseURL, {
    data: createSeedState(),
    onboardingDone: true,
    pin: "",
    theme: "light",
  });

  let txCount = await getCollectionCount(page, "transactions");
  const initialInboxCount = await getCollectionCount(page, "inbox");

  await openScan(page);
  await page.getByTestId("add-lane-receipt").click();
  await page.getByTestId("scan-file-input").setInputFiles(path.join(FIXTURES_DIR, "real-receipt.pdf"));
  await waitFor(page.getByText(/Review Queue/i), "real receipt queue", 60_000);
  await waitForButtonEnabled(page.getByTestId("scan-save-now"), "real scan save now", 90_000);
  await page.getByTestId("scan-save-now").click();
  await waitForState(page, (data) => (data?.transactions || []).length > txCount, "real receipt save", 60_000);
  txCount = await getCollectionCount(page, "transactions");

  let slipSent = false;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await openScan(page);
    await page.getByTestId("add-lane-slip").click();
    await page.getByTestId("scan-slip-input").setInputFiles(path.join(FIXTURES_DIR, "real-slip.pdf"));
    await waitFor(page.getByText(/Review Queue/i), `real slip queue attempt ${attempt}`, 60_000);

    try {
      await waitForButtonEnabled(page.getByTestId("scan-send-inbox"), "real scan send inbox", 90_000);
      await page.getByTestId("scan-send-inbox").click();
      await waitForState(page, (data) => (data?.inbox || []).length > initialInboxCount, "real slip inbox", 60_000);
      slipSent = true;
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await closeAddView(page);
    }
  }

  if (!slipSent) {
    throw new Error("Real slip scan did not reach inbox after retry");
  }
}

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV || "development";
  loadEnvFile(path.join(ROOT_DIR, ".env.local"));
  await ensureArtifacts();
  await ensureFixtureAssets();

  const appServer = await createAppServer();
  const browser = await createBrowser();

  try {
    await runScenario(browser, appServer.baseURL, "onboarding", scenarioOnboarding);
    await runScenario(browser, appServer.baseURL, "seeded-core", scenarioSeededCore);
    await runScenario(browser, appServer.baseURL, "import-reset", scenarioImportAndReset);
    await runScenario(browser, appServer.baseURL, "real-scan", scenarioRealScan);
  } finally {
    await browser.close();
    await appServer.close();
  }
}

main().catch((error) => {
  process.stderr.write(`\n[e2e] FAILED: ${String(error?.stack || error || "unknown error")}\n`);
  process.exitCode = 1;
});
