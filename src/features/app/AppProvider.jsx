import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { buildLegacyMigrationPayload, clearQueuedScanBlob, consumeOfflineQueueItem, enqueueManualDraft, enqueueScanDraft, readOfflineQueue, readQueuedScanBlob, writeOfflineQueue, hasLegacySnapshot } from "./clientState.js";
import {
  applyCategoryPresentationToSnapshot,
  buildNextCustomCategoryId,
  flattenCategoryGroups,
  getNextCategorySortOrder,
  mergeCategoryState,
} from "./categoryState.js";
import {
  clearStoredCategoryPreference,
  readStoredCategoryPreferences,
  upsertStoredCategoryPreference,
} from "./categoryPreferenceStorage.js";
import {
  DEFAULT_BUDGET_ALERT_PCT,
  buildBudgetCompatRows,
  buildBudgetHint,
  buildBudgetPlanSnapshot,
  buildPlanningProfilePayload,
  buildBudgetRowPayload,
  compareMonthKeys,
  monthEndIso,
  monthStartIso,
  normalizeBudgetRows,
  normalizeBudgetBehavior,
  normalizePlanningConfig,
  sanitizeMonthKey,
  shiftMonthKey,
} from "./budgetPlanningState.js";
import {
  buildDebtPlanPayload,
  buildFinancialGoalPayload,
  buildPlannerReminders,
  buildPlannerSnapshot,
  normalizeDebtPlans,
  normalizeFinancialGoals,
} from "./plannerState.js";
import {
  buildBudgetHintCompat,
  buildBudgetPlanSnapshotCompat,
  getActivePlannerScenarioKey,
  buildPlannerDecisionSummary,
  buildPlannerMonthlyPlanState,
  normalizePlannerMonthlyPlanItems,
  normalizePlannerMonthlyPlans,
} from "./plannerMonthlyPlanState.js";
import { normalizeAccountBalanceRows } from "./accountBalanceState.js";
import { createScanUploadEntry, patchScanUploadEntry } from "./scanUploadState.js";
import {
  buildRecurringOccurrences,
  buildRecurringRulePayload,
  getRecurringDueState,
  normalizeRecurringRules,
} from "./recurringState.js";
import {
  buildRuntimeNotifications,
  getNotificationDataKey,
  normalizeNotifications,
} from "./notificationState.js";
import {
  buildApprovedSuggestion,
  buildTransactionSavePlan,
  sanitizeTransactionDraft,
  scanToDraft,
  todayDate,
} from "./transactionDrafts.js";
import { getSupabaseBrowserClient, hasSupabaseBrowserConfig } from "../../lib/supabase/client.js";
import { downloadCsv, transactionsToCsv } from "../../utils/exportCsv.js";
import { normalizeMerchantKey } from "../../utils/merchantDictionary.js";
import { compareTxNewestFirst } from "../../utils/transaction.js";
import { transactionMatchesQuery } from "../../domain/receipt/receiptSearchIndex.js";
import { validateBackupImport } from "../../schemas/index.js";
import { extractBackupSupplementalData } from "../../utils/backupPayload.js";
import { STORAGE_SAVE_ERROR_EVENT, loadAll, saveAll } from "../../services/storage.js";
import {
  clearAllBlobs,
  exportBlobsAsDataUrls,
  importBlobsFromDataUrls,
  listExistingBlobs,
} from "../../services/blobStore.js";
import {
  LARGE_ATTACHMENT_BACKUP_BYTES,
  collectAttachmentIds,
  formatAttachmentBytes,
  getBackupData,
  normalizeAttachmentBackupMap,
  sumAttachmentBackupSize,
} from "../../utils/attachmentBackup.js";
import {
  normalizeCreditStatement,
  normalizeCreditStatements,
  normalizeSalaryPlan,
  normalizeSalaryPlans,
} from "../../store/boot.js";
import {
  checkBudgetAndNotify,
  getNotificationPermissionState,
  requestNotificationPermission,
} from "../../utils/budgetNotifications.js";
import { formatCurrency } from "../../utils/format.js";

const AppContext = createContext(null);
const GUEST_DISPLAY_NAME = "Guest";
const TRANSACTION_HISTORY_SELECT =
  "id, kind, status, account_id, from_account_id, to_account_id, category_id, merchant, note, reference, payment_method, amount_satang, currency, date, is_split_parent, is_split_child, split_group_id, split_parent_id, split_index, split_count, raw, created_at";
const TRANSACTIONS_PAGE_SIZE = 50;
const REQUEST_TIMEOUT_MS = 20000;
const IMPORT_TIMEOUT_MS = 120000;
const TRANSACTIONS_EXPORT_BATCH_SIZE = 250;

function monthToDate(monthValue) {
  const month = String(monthValue || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${month}-01`;
}

function readJson(res) {
  return res.text().then((text) => {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  });
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function readLocalCreditStatements() {
  try {
    const localSnapshot = loadAll({ defaultCreditStatements: [] });
    return normalizeCreditStatements(localSnapshot?.creditStatements || []);
  } catch {
    return [];
  }
}

function persistLocalCreditStatements(nextCreditStatements) {
  const normalized = normalizeCreditStatements(nextCreditStatements || []);
  const localSnapshot = loadAll({ defaultCreditStatements: [] });
  saveAll({
    ...localSnapshot,
    creditStatements: normalized,
  });
  return normalized;
}

function readLocalSalaryPlans() {
  try {
    const localSnapshot = loadAll({ defaultSalaryPlans: [] });
    return normalizeSalaryPlans(localSnapshot?.salaryPlans || []);
  } catch {
    return [];
  }
}

function persistLocalSalaryPlans(nextSalaryPlans) {
  const normalized = normalizeSalaryPlans(nextSalaryPlans || []);
  const localSnapshot = loadAll({ defaultSalaryPlans: [] });
  saveAll({
    ...localSnapshot,
    salaryPlans: normalized,
  });
  return normalized;
}

function hasSalaryPlanIdentity(plan) {
  return !!(plan?.id || plan?.month);
}

function isSameSalaryPlan(a, b) {
  const left = normalizeSalaryPlan(a || {});
  const right = normalizeSalaryPlan(b || {});
  if (left.id && right.id && String(left.id) === String(right.id)) return true;
  if (left.month && right.month && String(left.month) === String(right.month)) return true;
  return false;
}

function mergeSalaryPlans(current, payloads) {
  let next = normalizeSalaryPlans(current || []);
  const now = Date.now();

  for (const incoming of Array.isArray(payloads) ? payloads : []) {
    const draft = normalizeSalaryPlan(incoming || {});
    if (!hasSalaryPlanIdentity(draft)) continue;

    const index = next.findIndex((plan) => isSameSalaryPlan(plan, draft));
    const existing = index >= 0 ? next[index] : null;
    const merged = normalizeSalaryPlan({
      ...(existing || {}),
      ...(incoming || {}),
      id: incoming?.id || existing?.id || draft.id,
      createdAt: incoming?.createdAt ?? existing?.createdAt ?? draft.createdAt ?? now,
      updatedAt: now,
    });

    if (index >= 0) next[index] = merged;
    else next = [...next, merged];
  }

  return normalizeSalaryPlans(next);
}

function hasCreditStatementIdentity(statement) {
  return !!(
    statement?.accountId &&
    (statement?.cycleKey || statement?.statementDate || statement?.month)
  );
}

function isSameCreditStatement(a, b) {
  const left = normalizeCreditStatement(a || {});
  const right = normalizeCreditStatement(b || {});
  const leftAccountId = String(left.accountId || "");
  const rightAccountId = String(right.accountId || "");
  if (!leftAccountId || leftAccountId !== rightAccountId) return false;

  if (left.id && right.id && String(left.id) === String(right.id)) return true;
  if (left.cycleKey && right.cycleKey && String(left.cycleKey) === String(right.cycleKey)) return true;
  if (left.statementDate && right.statementDate && String(left.statementDate) === String(right.statementDate)) return true;
  if (!left.statementDate && !right.statementDate && left.month && right.month && String(left.month) === String(right.month)) return true;

  return false;
}

function mergeCreditStatements(current, payloads) {
  let next = normalizeCreditStatements(current || []);
  const now = Date.now();

  for (const incoming of Array.isArray(payloads) ? payloads : []) {
    const draft = normalizeCreditStatement(incoming || {});
    if (!hasCreditStatementIdentity(draft)) continue;

    const index = next.findIndex((statement) => isSameCreditStatement(statement, draft));
    const existing = index >= 0 ? next[index] : null;
    const merged = normalizeCreditStatement({
      ...(existing || {}),
      ...(incoming || {}),
      id: incoming?.id || existing?.id || draft.id,
      createdAt: incoming?.createdAt ?? existing?.createdAt ?? draft.createdAt ?? now,
      updatedAt: now,
    });

    if (index >= 0) next[index] = merged;
    else next = [...next, merged];
  }

  return normalizeCreditStatements(next);
}

function buildScanAccountContext(accounts) {
  return (Array.isArray(accounts) ? accounts : []).map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    last4: account.last4,
    last6: account.last6,
    cardLast4: account.last4,
  }));
}

async function loadScanClient() {
  const module = await import("../../services/scanOpenAI.js");
  return module.scanReceiptOpenAI;
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function buildAuthMetadata(displayName) {
  const trimmed = String(displayName || "").trim();
  return trimmed ? { display_name: trimmed } : {};
}

async function fetchWithSession(session, url, options = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  // Without a deadline a hanging request keeps the shell stuck on its loading
  // screen indefinitely on flaky mobile connections.
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeoutId =
    controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal || controller?.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const json = await readJson(res);
  if (!res.ok || json?.ok === false) {
    throw new Error(String(json?.message || json?.detail || res.statusText || "request_failed"));
  }
  return json;
}

async function uploadScanWithSession(session, accounts, file, options = {}) {
  const scanReceiptOpenAI = await loadScanClient();
  return scanReceiptOpenAI(file, {
    endpoint: options.endpoint,
    accounts: buildScanAccountContext(accounts),
    headers: session?.access_token
      ? {
          Authorization: `Bearer ${session.access_token}`,
        }
      : {},
    onStatus: typeof options.onStatus === "function" ? options.onStatus : undefined,
  });
}

function isMissingPlannerRelationError(error, relationName) {
  const message = String(error?.message || error || "").toLowerCase();
  const relation = String(relationName || "").toLowerCase();
  if (!message || !relation || !message.includes(relation)) return false;
  return (
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

async function fetchOptionalPlannerRows(queryPromise, relationName) {
  const { data, error } = await queryPromise;
  if (error) {
    if (isMissingPlannerRelationError(error, relationName)) {
      return { data: [], error: null, unavailable: true };
    }
    return { data: [], error };
  }
  return { data: Array.isArray(data) ? data : [], error: null, unavailable: false };
}

function isMissingRpcError(error, functionName) {
  const message = String(error?.message || error || "").toLowerCase();
  const rpcName = String(functionName || "").toLowerCase();
  if (!message || !rpcName || !message.includes(rpcName)) return false;
  return (
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("function")
  );
}

async function fetchOptionalRpcRows(queryPromise, functionName) {
  const { data, error } = await queryPromise;
  if (error) {
    if (isMissingRpcError(error, functionName)) {
      return { data: [], error: null, unavailable: true };
    }
    return { data: [], error };
  }
  return { data: Array.isArray(data) ? data : [], error: null, unavailable: false };
}

function buildMergedTransactionRaw(existingRaw, nextRaw, draft) {
  const current = existingRaw && typeof existingRaw === "object" ? existingRaw : {};
  const incoming = nextRaw && typeof nextRaw === "object" ? nextRaw : {};
  const merged = {
    ...current,
    ...incoming,
  };

  if (draft?.docType == null && current.docType !== undefined) merged.docType = current.docType;
  if (draft?.splitByCategory == null && current.splitByCategory !== undefined) merged.splitByCategory = current.splitByCategory;
  if (!Array.isArray(draft?.lineItems) && !Array.isArray(draft?.items) && current.lineItems !== undefined) {
    merged.lineItems = current.lineItems;
  }
  if (!Array.isArray(draft?.receiptGroups) && !Array.isArray(draft?.groups) && current.receiptGroups !== undefined) {
    merged.receiptGroups = current.receiptGroups;
  }
  if (draft?.time == null && current.time !== undefined) {
    merged.time = current.time;
  }

  return merged;
}

function sortRuntimeTransactionsNewestFirst(list) {
  return (Array.isArray(list) ? list : [])
    .slice()
    .sort((a, b) =>
      compareTxNewestFirst(
        {
          ...a,
          time: a?.raw?.time || a?.time || "",
          createdAt: a?.created_at ? new Date(a.created_at).getTime() : 0,
        },
        {
          ...b,
          time: b?.raw?.time || b?.time || "",
          createdAt: b?.created_at ? new Date(b.created_at).getTime() : 0,
        },
      ),
    );
}

function createTransactionsPageState(overrides = {}) {
  return {
    items: [],
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: "",
    ...overrides,
  };
}

function normalizeTransactionHistoryKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "income" || kind === "expense" || kind === "transfer") return kind;
  return "all";
}

function createTransactionsFiltersState(monthKey = todayMonth()) {
  return {
    monthKey: sanitizeMonthKey(monthKey || todayMonth()),
    kind: "all",
    accountId: "",
    categoryId: "",
    query: "",
  };
}

function normalizeTransactionsFilters(filters, fallbackMonthKey = todayMonth()) {
  const source = filters && typeof filters === "object" ? filters : {};
  return {
    monthKey: sanitizeMonthKey(source.monthKey || fallbackMonthKey || todayMonth()),
    kind: normalizeTransactionHistoryKind(source.kind),
    accountId: String(source.accountId || "").trim(),
    categoryId: String(source.categoryId || "").trim(),
    query: String(source.query || "").trim(),
  };
}

function buildTransactionsMonthRange(monthKey) {
  const safeMonthKey = sanitizeMonthKey(monthKey || todayMonth());
  const [yearText, monthText] = safeMonthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Math.max(0, Math.min(11, Number(monthText) - 1));
  const startIso = `${safeMonthKey}-01`;
  const endIso = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString().slice(0, 10);
  return { monthKey: safeMonthKey, startIso, endIso };
}

function sanitizeTransactionSearchTerm(value) {
  return String(value || "")
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesTransactionHistorySearch(transaction, query, context = {}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (transactionMatchesQuery(transaction, normalizedQuery, context)) return true;
  return [transaction?.merchant, transaction?.note, transaction?.reference]
    .map((value) => String(value || "").trim().toLowerCase())
    .some((value) => value.includes(normalizedQuery));
}

function mergeTransactionsById(existing, nextItems) {
  const merged = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(merged.map((transaction) => String(transaction?.id || "")));

  for (const transaction of Array.isArray(nextItems) ? nextItems : []) {
    const id = String(transaction?.id || "");
    if (!id || seen.has(id)) continue;
    merged.push(transaction);
    seen.add(id);
  }

  return merged;
}

function getNotificationRuntimeKey(notification) {
  const kind = String(notification?.kind || "info").trim().toLowerCase();
  const dataKey = String(getNotificationDataKey(notification) || "").trim();
  if (dataKey) return `${kind}:${dataKey}`;
  const id = String(notification?.id || notification?.created_at || "").trim();
  return `${kind}:${id}`;
}

function mergeNotificationKeys(existing, nextKey) {
  const current = Array.isArray(existing) ? existing : [];
  const key = String(nextKey || "").trim();
  if (!key || current.includes(key)) return current;
  return [...current, key];
}

// Every mutation below used to reject straight into the calling component, which
// had no catch of its own — a failed save simply did nothing visible. These
// messages give each action a Thai fallback while the raw error still reaches
// the console for debugging.
const ACTION_ERROR_MESSAGES = {
  saveProfile: "บันทึกโปรไฟล์ไม่สำเร็จ",
  savePlanningConfig: "บันทึกการตั้งค่าแผนไม่สำเร็จ",
  saveAccount: "บันทึกบัญชีไม่สำเร็จ",
  deleteAccount: "ลบบัญชีไม่สำเร็จ",
  adjustAccountBalance: "ปรับยอดบัญชีไม่สำเร็จ",
  saveFinancialGoal: "บันทึกเป้าหมายไม่สำเร็จ",
  deleteFinancialGoal: "ลบเป้าหมายไม่สำเร็จ",
  saveDebtPlan: "บันทึกแผนหนี้ไม่สำเร็จ",
  deleteDebtPlan: "ลบแผนหนี้ไม่สำเร็จ",
  saveCategory: "บันทึกหมวดหมู่ไม่สำเร็จ",
  setCategoryHidden: "อัปเดตหมวดหมู่ไม่สำเร็จ",
  saveCategoryBudgetBehavior: "อัปเดตหมวดหมู่ไม่สำเร็จ",
  saveBudgetRow: "บันทึกงบประมาณไม่สำเร็จ",
  deleteBudgetRow: "ลบงบประมาณไม่สำเร็จ",
  saveRecurringRule: "บันทึกรายการประจำไม่สำเร็จ",
  deleteRecurringRule: "ลบรายการประจำไม่สำเร็จ",
  toggleRecurringRule: "อัปเดตรายการประจำไม่สำเร็จ",
  runRecurringNow: "สร้างรายการประจำไม่สำเร็จ",
  applySuggestedBudgets: "ใช้งบที่แนะนำไม่สำเร็จ",
  applyPlannerPlan: "ใช้แผนที่เลือกไม่สำเร็จ",
  acceptPlannerRecommendation: "รับคำแนะนำไม่สำเร็จ",
  dismissPlannerRecommendation: "ปิดคำแนะนำไม่สำเร็จ",
  lockPlannerRecommendation: "ล็อกงบไม่สำเร็จ",
  markNotificationRead: "อัปเดตการแจ้งเตือนไม่สำเร็จ",
  markAllNotificationsRead: "อัปเดตการแจ้งเตือนไม่สำเร็จ",
  dismissNotification: "ปิดการแจ้งเตือนไม่สำเร็จ",
  createManualTransaction: "บันทึกรายการไม่สำเร็จ",
  updateTransaction: "อัปเดตรายการไม่สำเร็จ",
  deleteTransaction: "ลบรายการไม่สำเร็จ",
  approveScanDocument: "บันทึกรายการจากสแกนไม่สำเร็จ",
  rejectScanDocument: "ย้ายออกจากคิวไม่สำเร็จ",
  uploadScanFile: "อัปโหลดไฟล์ไม่สำเร็จ",
  uploadScanFiles: "อัปโหลดไฟล์ไม่สำเร็จ",
  retryScanUpload: "ลองสแกนใหม่ไม่สำเร็จ",
  exportTransactionsCsv: "ส่งออก CSV ไม่สำเร็จ",
  exportBackup: "ส่งออกข้อมูลสำรองไม่สำเร็จ",
  exportBackupWithAttachments: "ส่งออกข้อมูลสำรองไม่สำเร็จ",
  importBackupFile: "นำเข้าข้อมูลสำรองไม่สำเร็จ",
  runLegacyMigration: "ย้ายข้อมูลเดิมไม่สำเร็จ",
  refreshAll: "โหลดข้อมูลไม่สำเร็จ",
  refreshPlannerState: "โหลดแผนการเงินไม่สำเร็จ",
};

export function toFriendlyActionError(error, fallback = "ทำรายการไม่สำเร็จ") {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return fallback;
  if (message.includes("request_timeout") || message.includes("aborted")) {
    return "เชื่อมต่อช้าเกินไป ลองใหม่อีกครั้ง";
  }
  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("network")) {
    return "เชื่อมต่อไม่ได้ ระบบยังไม่บันทึกรายการนี้";
  }
  if (message.includes("jwt") || message.includes("session") || message.includes("not authenticated")) {
    return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  }
  if (message.includes("row-level security") || message.includes("permission denied") || message.includes("not authorized")) {
    return "ไม่มีสิทธิ์ทำรายการนี้";
  }
  if (message.includes("duplicate key") || message.includes("already exists") || message.includes("unique constraint")) {
    return "มีข้อมูลนี้อยู่แล้ว";
  }
  return fallback;
}

/**
 * Wraps every exposed mutation so a rejection always surfaces a toast. The error
 * is rethrown so callers keep their existing control flow (a failed save must not
 * clear the draft or close the sheet).
 */
function decorateActionsWithErrorFeedback(value, onError) {
  const next = { ...value };

  for (const [key, fallback] of Object.entries(ACTION_ERROR_MESSAGES)) {
    const action = next[key];
    if (typeof action !== "function") continue;

    next[key] = async (...args) => {
      try {
        return await action(...args);
      } catch (error) {
        onError(error, fallback);
        throw error;
      }
    };
  }

  return next;
}

function getOfflineQueueSignature(queue) {
  const manual = Array.isArray(queue?.manual) ? queue.manual : [];
  const scans = Array.isArray(queue?.scans) ? queue.scans : [];
  return [
    manual.map((item) => String(item?.id || "")).join(","),
    scans.map((item) => String(item?.id || "")).join(","),
  ].join("|");
}

function isSameOfflineQueue(left, right) {
  return getOfflineQueueSignature(left) === getOfflineQueueSignature(right);
}

function mergeNotificationKeyList(existing, nextKeys) {
  return (Array.isArray(nextKeys) ? nextKeys : []).reduce(
    (keys, key) => mergeNotificationKeys(keys, key),
    Array.isArray(existing) ? existing : [],
  );
}

export function AppProvider({ children }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [merchantMappings, setMerchantMappings] = useState([]);
  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [categoryPreferenceRows, setCategoryPreferenceRows] = useState([]);
  const [financialGoals, setFinancialGoals] = useState([]);
  const [debtPlans, setDebtPlans] = useState([]);
  const [creditStatements, setCreditStatements] = useState(readLocalCreditStatements);
  const [salaryPlans, setSalaryPlans] = useState(readLocalSalaryPlans);
  const [budgetRows, setBudgetRows] = useState([]);
  const [planningTransactions, setPlanningTransactions] = useState([]);
  const [recurringRules, setRecurringRules] = useState([]);
  const [plannerStorage, setPlannerStorage] = useState({
    unavailable: false,
    plans: [],
    items: [],
  });
  const [scanDocuments, setScanDocuments] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
  const [dashboardPreviousSnapshot, setDashboardPreviousSnapshot] = useState(null);
  const [accountBalanceSnapshot, setAccountBalanceSnapshot] = useState([]);
  const [cashflowSeries, setCashflowSeries] = useState([]);
  const [storedNotifications, setStoredNotifications] = useState([]);
  const [notificationsUnavailable, setNotificationsUnavailable] = useState(false);
  const [localNotificationReadKeys, setLocalNotificationReadKeys] = useState([]);
  const [localNotificationDismissedKeys, setLocalNotificationDismissedKeys] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(todayMonth);
  const [transactionsFilters, setTransactionsFiltersState] = useState(() => createTransactionsFiltersState());
  const [transactionsPage, setTransactionsPage] = useState(() => createTransactionsPageState());
  const [toast, setToast] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermissionState);
  const [queue, setQueue] = useState(readOfflineQueue);
  const [scanUploads, setScanUploads] = useState([]);
  const [isOnline, setIsOnline] = useState(
    () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  );
  const [legacyAvailable, setLegacyAvailable] = useState(hasLegacySnapshot);
  const [migrationState, setMigrationState] = useState({ running: false, skipped: false, failures: [] });
  const authReadyRef = useRef(false);
  const savingRef = useRef(false);
  const migrationAttemptedRef = useRef(false);
  const loadedMonthRef = useRef(null);
  const offlineQueueRunningRef = useRef(false);

  const supabase = hasSupabaseBrowserConfig() ? getSupabaseBrowserClient() : null;

  useEffect(() => {
    authReadyRef.current = authReady;
  }, [authReady]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (session) return;
    setTransactionsFiltersState(createTransactionsFiltersState());
    setTransactionsPage(createTransactionsPageState());
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;
    
    // Fallback if Supabase getSession hangs (e.g. in test envs without offline cache)
    const timeout = setTimeout(() => {
      if (mounted && !authReadyRef.current) {
        setAuthReady(true);
      }
    }, 2500);

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      clearTimeout(timeout);
      setSession(data?.session || null);
      setAuthReady(true);
      if (error) setAuthError(String(error.message || "auth_session_failed"));
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const syncOnlineState = () => setIsOnline(navigator.onLine !== false);
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  useEffect(() => {
    applyOfflineQueueState(readOfflineQueue());
    setLegacyAvailable(hasLegacySnapshot());
    setCreditStatements(readLocalCreditStatements());
    setSalaryPlans(readLocalSalaryPlans());
  }, [session]);

  useEffect(() => {
    if (!session || !supabase) {
      loadedMonthRef.current = null;
      setProfile(null);
      setAccounts([]);
      setMerchantMappings([]);
      setCategories({ expense: [], income: [] });
      setCategoryPreferenceRows([]);
      setFinancialGoals([]);
      setDebtPlans([]);
      setBudgetRows([]);
      setPlanningTransactions([]);
      setRecurringRules([]);
      setPlannerStorage({ unavailable: false, plans: [], items: [] });
      setScanDocuments([]);
      setRecentTransactions([]);
      setScanUploads([]);
      setDashboardSnapshot(null);
      setDashboardPreviousSnapshot(null);
      setAccountBalanceSnapshot([]);
      setCashflowSeries([]);
      setStoredNotifications([]);
      setNotificationsUnavailable(false);
      setLocalNotificationReadKeys([]);
      setLocalNotificationDismissedKeys([]);
      return;
    }

    let cancelled = false;
    markMonthLoadedEvent();

    async function bootstrap() {
      setBootstrapping(true);
      try {
        const bootstrapJson = await fetchWithSession(session, "/api/bootstrap", {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (cancelled) return;
        setProfile(bootstrapJson.profile || null);
        refreshAllEvent(bootstrapJson.profile || null);
      } catch (error) {
        if (!cancelled) {
          pushToast("error", toFriendlyActionError(error, "เปิดแอปไม่สำเร็จ ลองใหม่อีกครั้ง"));
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [session, supabase]);

  // Switching months only needs a data refresh, never a full bootstrap round trip.
  // Keeping it out of the bootstrap effect avoids blanking the shell behind the
  // loading screen every time the month picker changes.
  useEffect(() => {
    if (!session || !supabase) return;
    if (loadedMonthRef.current === null) return;
    if (loadedMonthRef.current === selectedMonth) return;
    loadedMonthRef.current = selectedMonth;
    refreshAllEvent();
  }, [selectedMonth, session, supabase]);

  useEffect(() => {
    if (!session || !profile || migrationAttemptedRef.current || !legacyAvailable) return;
    if (profile?.migrated_at) return;

    migrationAttemptedRef.current = true;
    runLegacyMigrationEvent({ automatic: true });
  }, [legacyAvailable, profile, session]);

  useEffect(() => {
    if (!session || !isOnline) return;
    if (!queue.manual.length && !queue.scans.length) return;
    processOfflineQueueEvent();
  }, [isOnline, queue, session]);

  function pushToast(tone, message) {
    setToast({ id: Date.now(), tone, message: String(message || "").trim() });
  }

  // Keeps the queue object identity stable when nothing actually changed so the
  // drain effect below cannot retrigger itself into a retry loop.
  function applyOfflineQueueState(nextQueue) {
    setQueue((current) => (isSameOfflineQueue(current, nextQueue) ? current : nextQueue));
  }

  function clearToast() {
    setToast(null);
  }

  const handleStorageSaveErrorEvent = useEffectEvent((event) => {
    const approxBytes = Number(event?.detail?.approxBytes || 0);
    const sizeHint = approxBytes > 0 ? ` (${Math.round(approxBytes / 1024)} KB)` : "";
    pushToast("warning", `บันทึกลงอุปกรณ์ไม่สำเร็จ${sizeHint} กรุณาส่งออกข้อมูลสำรองทันที`);
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncPermission = () => {
      setNotificationPermission(getNotificationPermissionState());
    };

    syncPermission();
    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);
    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleStorageSaveError = (event) => {
      handleStorageSaveErrorEvent(event);
    };

    window.addEventListener(STORAGE_SAVE_ERROR_EVENT, handleStorageSaveError);
    return () => {
      window.removeEventListener(STORAGE_SAVE_ERROR_EVENT, handleStorageSaveError);
    };
  }, []);

  async function requestBudgetNotificationPermissionEvent() {
    const permission = await requestNotificationPermission();
    const nextPermission = getNotificationPermissionState();
    setNotificationPermission(nextPermission);

    if (permission === "granted") {
      pushToast("success", "เปิดสิทธิ์การแจ้งเตือนแล้ว");
    } else if (permission === "denied") {
      pushToast("warning", "เบราว์เซอร์บล็อกการแจ้งเตือนอยู่");
    } else if (nextPermission === "unsupported") {
      pushToast("warning", "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
    } else {
      pushToast("info", "ยังไม่ได้เปิดสิทธิ์การแจ้งเตือน");
    }

    return permission;
  }

  function appendScanUpload(file) {
    const nextEntry = createScanUploadEntry(file);
    setScanUploads((current) => [nextEntry, ...current].slice(0, 12));
    return nextEntry;
  }

  function appendScanUploads(files) {
    const entries = Array.from(files || [])
      .filter(Boolean)
      .map((file) => createScanUploadEntry(file));

    if (!entries.length) return [];

    setScanUploads((current) => [...entries, ...current].slice(0, 12));
    return entries;
  }

  function updateScanUpload(entryId, patch) {
    setScanUploads((current) =>
      current.map((entry) => (entry.id === entryId ? patchScanUploadEntry(entry, patch) : entry)),
    );
  }

  async function runScanUpload(entry, options = {}) {
    updateScanUpload(entry.id, { status: "queued", error: "" });

    try {
      const result = await uploadScanWithSession(session, accounts, entry.file, {
        endpoint: options.endpoint,
        onStatus: (status) => updateScanUpload(entry.id, { status }),
      });

      updateScanUpload(entry.id, {
        status: "done",
        scanDocumentId: result?.scanDocumentId || null,
        error: "",
      });

      return { ok: true, result };
    } catch (error) {
      updateScanUpload(entry.id, {
        status: "error",
        error: String(error?.message || error || "scan_failed"),
      });
      return { ok: false, error };
    }
  }

  function toCategoryErrorMessage(error) {
    const message = String(error?.message || error || "").trim();

    if (message === "category_name_required") return "กรุณาใส่ชื่อหมวดหมู่";
    if (message === "category_parent_required") return "กรุณาเลือกหมวดหลัก";
    if (message === "category_preferences_missing") return "ยังไม่พบตารางตั้งค่าหมวดหมู่ในฐานข้อมูล";
    if (message === "category_write_failed") return "บันทึกหมวดหมู่ไม่สำเร็จ";
    if (message === "category_preferences_write_failed") return "บันทึกการตั้งค่าหมวดหมู่ไม่สำเร็จ";
    if (message === "category_preferences_delete_failed") return "กู้คืนหมวดหมู่ไม่สำเร็จ";
    return message || "บันทึกหมวดหมู่ไม่สำเร็จ";
  }

  function shouldUseLocalCategoryPreferenceFallback(error) {
    if (error?.unavailable === true) return true;
    const code = String(error?.code || "").trim();
    const message = String(error?.message || error || "").trim();
    return code.includes("category_preferences_missing") || message.includes("category_preferences_missing");
  }

  async function fetchCategoryPreferencesSafe() {
    if (!session) return { data: [], error: null };

    try {
      const json = await fetchWithSession(session, "/api/category-preferences", {
        method: "GET",
      });
      if (shouldUseLocalCategoryPreferenceFallback(json)) {
        return {
          data: readStoredCategoryPreferences(session.user.id),
          error: null,
          localFallback: true,
        };
      }
      return { data: Array.isArray(json?.preferences) ? json.preferences : [], error: null };
    } catch (error) {
      if (shouldUseLocalCategoryPreferenceFallback(error)) {
        return {
          data: readStoredCategoryPreferences(session.user.id),
          error: null,
          localFallback: true,
        };
      }
      return {
        data: [],
        error: new Error(String(error?.message || error || "category_preferences_read_failed")),
      };
    }
  }

  async function upsertCategoryPreference(row) {
    if (!session) return null;
    const categoryId = String(row?.category_id || row?.categoryId || "").trim();
    const existing = categoryPreferenceRows.find(
      (item) => String(item?.category_id || item?.categoryId || "").trim() === categoryId,
    ) || null;

    const payload = {
      categoryId,
      name:
        row?.name != null
          ? String(row.name || "").trim() || null
          : existing?.name != null
            ? String(existing.name || "").trim() || null
            : null,
      icon:
        row?.icon != null
          ? String(row.icon || "").trim() || null
          : existing?.icon != null
            ? String(existing.icon || "").trim() || null
            : null,
      color:
        row?.color != null
          ? String(row.color || "").trim() || null
          : existing?.color != null
            ? String(existing.color || "").trim() || null
            : null,
      hidden: row?.hidden != null ? row.hidden === true : existing?.hidden === true,
      budgetBehavior:
        row?.budgetBehavior != null || row?.budget_behavior != null
          ? String((row?.budgetBehavior ?? row?.budget_behavior) || "").trim().toLowerCase() || null
          : existing?.budget_behavior != null || existing?.budgetBehavior != null
            ? String((existing?.budget_behavior ?? existing?.budgetBehavior) || "").trim().toLowerCase() || null
            : null,
    };

    try {
      const json = await fetchWithSession(session, "/api/category-preferences", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (shouldUseLocalCategoryPreferenceFallback(json)) {
        return upsertStoredCategoryPreference(session.user.id, payload);
      }
      return json?.preference || null;
    } catch (error) {
      if (shouldUseLocalCategoryPreferenceFallback(error)) {
        return upsertStoredCategoryPreference(session.user.id, payload);
      }
      throw new Error(String(error?.message || error || "category_preferences_write_failed"));
    }
  }

  async function clearCategoryPreference(categoryId) {
    if (!session) return;

    try {
      const json = await fetchWithSession(session, "/api/category-preferences", {
        method: "DELETE",
        body: JSON.stringify({ categoryId: String(categoryId || "").trim() }),
      });
      if (shouldUseLocalCategoryPreferenceFallback(json)) {
        clearStoredCategoryPreference(session.user.id, categoryId);
      }
    } catch (error) {
      if (shouldUseLocalCategoryPreferenceFallback(error)) {
        clearStoredCategoryPreference(session.user.id, categoryId);
        return;
      }
      throw new Error(String(error?.message || error || "category_preferences_delete_failed"));
    }
  }

  function buildRuntimeCategoryIndex() {
    const allCategories = flattenCategoryGroups(categories);
    const categoryMap = new Map(
      allCategories
        .map((row) => [String(row?.id || "").trim(), row])
        .filter(([categoryId]) => categoryId),
    );

    return { allCategories, categoryMap };
  }

  function getBudgetRootCategoryId(categoryId, categoryMap) {
    let currentId = String(categoryId || "").trim();
    let guard = 0;

    while (currentId && guard < 24) {
      const row = categoryMap.get(currentId);
      const parentId = String(row?.parentId || "").trim();
      if (!parentId) return currentId;
      currentId = parentId;
      guard += 1;
    }

    return String(categoryId || "").trim();
  }

  function listDescendantCategoryIds(rootId, categoryMap) {
    const targetRootId = String(rootId || "").trim();
    if (!targetRootId) return [];

    return Array.from(categoryMap.keys()).filter((categoryId) => {
      if (categoryId === targetRootId) return false;
      return getBudgetRootCategoryId(categoryId, categoryMap) === targetRootId;
    });
  }

  function getBudgetValidationMessage(code) {
    const key = String(code || "").trim();
    if (key === "budget_category_required") return "เลือกหมวดหมู่ก่อนบันทึกงบ";
    if (key === "budget_root_required") return "ต้องมีงบหมวดหลักก่อน จึงจะตั้ง child override ได้";
    if (key === "budget_limit_required") return "กรอกวงเงินงบให้มากกว่า 0";
    if (key === "budget_child_limit_exceeded") return "งบหมวดย่อยรวมกันเกินเพดานของหมวดหลัก";
    return key || "บันทึกงบไม่สำเร็จ";
  }

  function buildPlannerRange(monthKey) {
    const currentMonthValue = todayMonth();
    const planningStartMonth = compareMonthKeys(monthKey, currentMonthValue) <= 0
      ? monthKey
      : currentMonthValue;
    const planningEndMonth = compareMonthKeys(monthKey, currentMonthValue) >= 0
      ? monthKey
      : currentMonthValue;

    return {
      planningRangeStart: monthStartIso(shiftMonthKey(planningStartMonth, -18)),
      planningRangeEnd: monthEndIso(planningEndMonth),
    };
  }

  function applyPlannerSliceState(slice) {
    if (!slice) return;
    setProfile(slice.profile || null);
    setCategories(slice.categories || { expense: [], income: [] });
    setCategoryPreferenceRows(Array.isArray(slice.categoryPreferenceRows) ? slice.categoryPreferenceRows : []);
    setFinancialGoals(normalizeFinancialGoals(slice.financialGoals || []));
    setDebtPlans(normalizeDebtPlans(slice.debtPlans || []));
    setBudgetRows(normalizeBudgetRows(slice.budgetRows || []));
    setPlanningTransactions(Array.isArray(slice.planningTransactions) ? slice.planningTransactions : []);
    setPlannerStorage(
      slice.plannerStorage || {
        unavailable: false,
        plans: [],
        items: [],
      },
    );
  }

  async function fetchPlannerSlice({ monthKey = selectedMonth, nextProfile = null } = {}) {
    if (!supabase || !session) return null;

    const safeMonthKey = sanitizeMonthKey(monthKey || selectedMonth);
    const { planningRangeStart, planningRangeEnd } = buildPlannerRange(safeMonthKey);

    const [
      profileResult,
      categoriesResult,
      categoryPreferencesResult,
      goalsResult,
      debtPlansResult,
      budgetsResult,
      planningTransactionsResult,
      plannerMonthlyPlansResult,
      plannerMonthlyPlanItemsResult,
    ] = await Promise.all([
      nextProfile
        ? Promise.resolve({ data: nextProfile, error: null })
        : supabase.from("profiles").select("*").eq("user_id", session.user.id).single(),
      supabase
        .from("categories")
        .select("id, user_id, is_system, kind, name, icon, color, parent_id, sort_order")
        .order("sort_order", { ascending: true }),
      fetchCategoryPreferencesSafe(),
      fetchOptionalPlannerRows(
        supabase
          .from("financial_goals")
          .select(
            "id, legacy_id, name, target_amount_satang, current_amount_satang, target_date, monthly_contribution_satang, linked_account_id, status, created_at",
          )
          .order("target_date", { ascending: true, nullsFirst: false }),
        "financial_goals",
      ),
      fetchOptionalPlannerRows(
        supabase
          .from("debt_plans")
          .select(
            "id, legacy_id, account_id, current_balance_satang, minimum_payment_satang, target_payment_satang, apr_bps, due_day, payoff_target_date, status, note, created_at",
          )
          .order("created_at", { ascending: true }),
        "debt_plans",
      ),
      fetchOptionalPlannerRows(
        supabase
          .from("budgets")
          .select(
            "id, user_id, month_key, category_id, limit_satang, alert_pct, source, manual_override, created_at, updated_at",
          )
          .order("month_key", { ascending: false })
          .order("category_id", { ascending: true }),
        "budgets",
      ),
      supabase
        .from("transactions")
        .select("id, kind, category_id, amount_satang, date, is_split_parent, is_split_child, raw, from_account_id, to_account_id")
        .eq("user_id", session.user.id)
        .eq("status", "posted")
        .gte("date", planningRangeStart)
        .lte("date", planningRangeEnd)
        .order("date", { ascending: false }),
      fetchOptionalPlannerRows(
        supabase
          .from("planner_monthly_plans")
          .select("*")
          .eq("month_key", safeMonthKey)
          .order("scenario_key", { ascending: true }),
        "planner_monthly_plans",
      ),
      fetchOptionalPlannerRows(
        supabase
          .from("planner_monthly_plan_items")
          .select("*")
          .eq("month_key", safeMonthKey)
          .order("scenario_key", { ascending: true })
          .order("category_id", { ascending: true }),
        "planner_monthly_plan_items",
      ),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    if (categoryPreferencesResult.error) throw categoryPreferencesResult.error;
    if (goalsResult.error) throw goalsResult.error;
    if (debtPlansResult.error) throw debtPlansResult.error;
    if (budgetsResult.error) throw budgetsResult.error;
    if (planningTransactionsResult.error) throw planningTransactionsResult.error;
    if (plannerMonthlyPlansResult.error) throw plannerMonthlyPlansResult.error;
    if (plannerMonthlyPlanItemsResult.error) throw plannerMonthlyPlanItemsResult.error;

    const nextCategories = mergeCategoryState(
      categoriesResult.data || [],
      categoryPreferencesResult.data || [],
    );
    const nextProfileData = profileResult.data || nextProfile || null;
    const nextDebtPlans = normalizeDebtPlans(debtPlansResult.data || []);
    const nextBudgetRows = normalizeBudgetRows(budgetsResult.data || []);
    const nextPlanningTransactions = Array.isArray(planningTransactionsResult.data)
      ? planningTransactionsResult.data
      : [];
    const legacyBudgetSnapshot = buildBudgetPlanSnapshot({
      profile: nextProfileData,
      categories: nextCategories,
      debtPlans: nextDebtPlans,
      budgetRows: nextBudgetRows,
      transactions: nextPlanningTransactions,
      monthValue: safeMonthKey,
      today: todayDate(),
    });
    const nextPlannerStorage = {
      unavailable: plannerMonthlyPlansResult.unavailable === true || plannerMonthlyPlanItemsResult.unavailable === true,
      plans: normalizePlannerMonthlyPlans(plannerMonthlyPlansResult.data || []),
      items: normalizePlannerMonthlyPlanItems(plannerMonthlyPlanItemsResult.data || []),
    };
    const monthlyPlan = buildPlannerMonthlyPlanState({
      profile: nextProfileData,
      categories: nextCategories,
      debtPlans: nextDebtPlans,
      budgetRows: nextBudgetRows,
      transactions: nextPlanningTransactions,
      monthValue: safeMonthKey,
      today: todayDate(),
      storedPlans: nextPlannerStorage.plans,
      storedItems: nextPlannerStorage.items,
      legacySnapshot: legacyBudgetSnapshot,
    });

    return {
      profile: nextProfileData,
      categories: nextCategories,
      categoryPreferenceRows: categoryPreferencesResult.data || [],
      financialGoals: goalsResult.data || [],
      debtPlans: nextDebtPlans,
      budgetRows: nextBudgetRows,
      planningTransactions: nextPlanningTransactions,
      plannerStorage: nextPlannerStorage,
      monthlyPlan,
    };
  }

  async function syncPlannerMonthlyPlanRows(monthKey, monthlyPlan) {
    if (!supabase || !session || !monthlyPlan?.syncPayload) return null;

    const safeMonthKey = sanitizeMonthKey(monthKey || selectedMonth);
    const planRows = (Array.isArray(monthlyPlan.syncPayload.plans) ? monthlyPlan.syncPayload.plans : []).map((row) => ({
      ...row,
      user_id: session.user.id,
      month_key: safeMonthKey,
    }));

    if (!planRows.length) return null;

    const { data: upsertedPlans, error: planError } = await supabase
      .from("planner_monthly_plans")
      .upsert(planRows, { onConflict: "user_id,month_key,scenario_key" })
      .select("*");
    if (planError) throw planError;

    const planIdByScenario = new Map(
      normalizePlannerMonthlyPlans(upsertedPlans || []).map((row) => [row.scenario_key, row.id]),
    );
    const itemRows = (Array.isArray(monthlyPlan.syncPayload.items) ? monthlyPlan.syncPayload.items : []).map((row) => ({
      ...row,
      user_id: session.user.id,
      month_key: safeMonthKey,
      plan_id: planIdByScenario.get(row.scenario_key) || null,
    }));

    const { data: upsertedItems, error: itemError } = await supabase
      .from("planner_monthly_plan_items")
      .upsert(itemRows, { onConflict: "user_id,month_key,scenario_key,category_id" })
      .select("*");
    if (itemError) throw itemError;

    const nextPlannerStorage = {
      unavailable: false,
      plans: normalizePlannerMonthlyPlans(upsertedPlans || []),
      items: normalizePlannerMonthlyPlanItems(upsertedItems || []),
    };
    setPlannerStorage(nextPlannerStorage);
    return nextPlannerStorage;
  }

  async function refreshPlannerState(monthKey = selectedMonth, options = {}) {
    if (!supabase || !session) return null;

    const safeMonthKey = sanitizeMonthKey(monthKey || selectedMonth);
    if (options.withLoading === true) {
      startTransition(() => setLoading(true));
    }

    try {
      const slice = await fetchPlannerSlice({
        monthKey: safeMonthKey,
        nextProfile: options.nextProfile || null,
      });
      applyPlannerSliceState(slice);
      if (!slice?.plannerStorage?.unavailable && options.skipSync !== true) {
        await syncPlannerMonthlyPlanRows(safeMonthKey, slice.monthlyPlan);
      }
      return slice;
    } finally {
      if (options.withLoading === true) {
        startTransition(() => setLoading(false));
      }
    }
  }

  async function refreshAll(nextProfile = null) {
    if (!supabase || !session) return;

    startTransition(() => setLoading(true));
    try {
      const monthDate = monthToDate(selectedMonth);
      const previousMonthDate = monthToDate(shiftMonthKey(selectedMonth, -1));
      const [
        plannerSlice,
        accountsResult,
        merchantMappingsResult,
        recurringRulesResult,
        scansResult,
        snapshotResult,
        previousSnapshotResult,
        accountBalanceResult,
        cashflowResult,
        transactionsResult,
        notificationsResult,
      ] = await Promise.all([
        fetchPlannerSlice({ monthKey: selectedMonth, nextProfile }),
        supabase
          .from("accounts")
          .select(
            "id, legacy_id, name, type, institution_label, currency, color, icon, opening_balance_satang, credit_limit_satang, last4, last6, digits_masked, statement_day, due_day, created_at",
          )
          .order("created_at", { ascending: true }),
        supabase
          .from("merchant_mappings")
          .select("*")
          .order("last_used_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false }),
        fetchOptionalPlannerRows(
          supabase
            .from("recurring_rules")
            .select("*")
            .order("created_at", { ascending: true }),
          "recurring_rules",
        ),
        supabase
          .from("scan_documents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.rpc("dashboard_snapshot", { target_month: monthDate }),
        supabase.rpc("dashboard_snapshot", { target_month: previousMonthDate }),
        fetchOptionalRpcRows(
          supabase.rpc("account_balance_snapshot", { target_user: session.user.id }),
          "account_balance_snapshot",
        ),
        supabase.rpc("dashboard_cashflow_series", { target_month: monthDate }),
        supabase
          .from("transactions")
          .select(
            "id, kind, status, account_id, from_account_id, to_account_id, category_id, merchant, note, reference, payment_method, amount_satang, currency, date, is_split_parent, is_split_child, split_group_id, split_parent_id, split_index, split_count, raw, created_at",
          )
          .eq("user_id", session.user.id)
          .eq("status", "posted")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(24),
        fetchOptionalPlannerRows(
          supabase
            .from("notifications")
            .select("*")
            .eq("is_dismissed", false)
            .order("created_at", { ascending: false })
            .limit(40),
          "notifications",
        ),
      ]);

      if (accountsResult.error) throw accountsResult.error;
      if (merchantMappingsResult.error) throw merchantMappingsResult.error;
      if (recurringRulesResult.error) throw recurringRulesResult.error;
      if (scansResult.error) throw scansResult.error;
      if (snapshotResult.error) throw snapshotResult.error;
      if (previousSnapshotResult.error) throw previousSnapshotResult.error;
      if (accountBalanceResult.error) throw accountBalanceResult.error;
      if (cashflowResult.error) throw cashflowResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      if (notificationsResult.error) throw notificationsResult.error;
      applyPlannerSliceState(plannerSlice);
      if (!plannerSlice?.plannerStorage?.unavailable) {
        await syncPlannerMonthlyPlanRows(selectedMonth, plannerSlice.monthlyPlan);
      }

      const nextSnapshot = applyCategoryPresentationToSnapshot(
        snapshotResult.data || null,
        plannerSlice?.categories || { expense: [], income: [] },
      );
      const nextPreviousSnapshot = applyCategoryPresentationToSnapshot(
        previousSnapshotResult.data || null,
        plannerSlice?.categories || { expense: [], income: [] },
      );

      setAccounts(Array.isArray(accountsResult.data) ? accountsResult.data : []);
      setMerchantMappings(Array.isArray(merchantMappingsResult.data) ? merchantMappingsResult.data : []);
      setRecurringRules(normalizeRecurringRules(recurringRulesResult.data || []));
      setScanDocuments(Array.isArray(scansResult.data) ? scansResult.data : []);
      setRecentTransactions(
        sortRuntimeTransactionsNewestFirst(
          (Array.isArray(transactionsResult.data) ? transactionsResult.data : []).filter(
            (transaction) => transaction?.is_split_child !== true,
          ),
        ),
      );
      setDashboardSnapshot(nextSnapshot);
      setDashboardPreviousSnapshot(nextPreviousSnapshot);
      setAccountBalanceSnapshot(normalizeAccountBalanceRows(accountBalanceResult.data || []));
      setCashflowSeries(Array.isArray(cashflowResult.data) ? cashflowResult.data : []);
      setStoredNotifications(normalizeNotifications(notificationsResult.data || []));
      setNotificationsUnavailable(notificationsResult.unavailable === true);
      setLegacyAvailable(hasLegacySnapshot());
      applyOfflineQueueState(readOfflineQueue());
    } finally {
      startTransition(() => setLoading(false));
    }
  }

  async function fetchScanDocuments() {
    const { data, error } = await supabase
      .from("scan_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  // Scan queue mutations only move rows in scan_documents, so they never need
  // the full refreshAll fan-out.
  // Patch the reviewed row locally so the inbox reflects the decision instantly
  // instead of depending on the refresh round trip landing first.
  function markScanDocumentStatus(scanId, patch) {
    const targetId = String(scanId || "");
    if (!targetId) return;
    setScanDocuments((current) =>
      (Array.isArray(current) ? current : []).map((row) =>
        String(row?.id || "") === targetId ? { ...row, ...patch } : row,
      ),
    );
  }

  async function refreshScanDocuments() {
    if (!supabase || !session) return;
    setScanDocuments(await fetchScanDocuments());
  }

  /**
   * Refresh only what a transaction write can change: the planning window, the
   * dashboard aggregates, account balances, and the recent list. Categories,
   * budgets, goals, debts, recurring rules, and the profile are untouched by a
   * transaction write, so this replaces ~20 requests with 7 and skips the
   * planner row upserts. Planner state still recomputes locally from the fresh
   * planning transactions.
   */
  async function refreshTransactionDependentState({ includeScans = false } = {}) {
    if (!supabase || !session) return;

    startTransition(() => setLoading(true));
    try {
      const safeMonthKey = sanitizeMonthKey(selectedMonth);
      const monthDate = monthToDate(safeMonthKey);
      const previousMonthDate = monthToDate(shiftMonthKey(safeMonthKey, -1));
      const { planningRangeStart, planningRangeEnd } = buildPlannerRange(safeMonthKey);

      const [
        planningTransactionsResult,
        merchantMappingsResult,
        snapshotResult,
        previousSnapshotResult,
        accountBalanceResult,
        cashflowResult,
        transactionsResult,
        scanRows,
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, kind, category_id, amount_satang, date, is_split_parent, is_split_child, raw, from_account_id, to_account_id")
          .eq("user_id", session.user.id)
          .eq("status", "posted")
          .gte("date", planningRangeStart)
          .lte("date", planningRangeEnd)
          .order("date", { ascending: false }),
        supabase
          .from("merchant_mappings")
          .select("*")
          .order("last_used_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false }),
        supabase.rpc("dashboard_snapshot", { target_month: monthDate }),
        supabase.rpc("dashboard_snapshot", { target_month: previousMonthDate }),
        fetchOptionalRpcRows(
          supabase.rpc("account_balance_snapshot", { target_user: session.user.id }),
          "account_balance_snapshot",
        ),
        supabase.rpc("dashboard_cashflow_series", { target_month: monthDate }),
        supabase
          .from("transactions")
          .select(
            "id, kind, status, account_id, from_account_id, to_account_id, category_id, merchant, note, reference, payment_method, amount_satang, currency, date, is_split_parent, is_split_child, split_group_id, split_parent_id, split_index, split_count, raw, created_at",
          )
          .eq("user_id", session.user.id)
          .eq("status", "posted")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(24),
        includeScans ? fetchScanDocuments() : Promise.resolve(null),
      ]);

      if (planningTransactionsResult.error) throw planningTransactionsResult.error;
      if (merchantMappingsResult.error) throw merchantMappingsResult.error;
      if (snapshotResult.error) throw snapshotResult.error;
      if (previousSnapshotResult.error) throw previousSnapshotResult.error;
      if (accountBalanceResult.error) throw accountBalanceResult.error;
      if (cashflowResult.error) throw cashflowResult.error;
      if (transactionsResult.error) throw transactionsResult.error;

      setPlanningTransactions(
        Array.isArray(planningTransactionsResult.data) ? planningTransactionsResult.data : [],
      );
      setMerchantMappings(Array.isArray(merchantMappingsResult.data) ? merchantMappingsResult.data : []);
      setDashboardSnapshot(applyCategoryPresentationToSnapshot(snapshotResult.data || null, categories));
      setDashboardPreviousSnapshot(
        applyCategoryPresentationToSnapshot(previousSnapshotResult.data || null, categories),
      );
      setAccountBalanceSnapshot(normalizeAccountBalanceRows(accountBalanceResult.data || []));
      setCashflowSeries(Array.isArray(cashflowResult.data) ? cashflowResult.data : []);
      setRecentTransactions(
        sortRuntimeTransactionsNewestFirst(
          (Array.isArray(transactionsResult.data) ? transactionsResult.data : []).filter(
            (transaction) => transaction?.is_split_child !== true,
          ),
        ),
      );
      if (scanRows) setScanDocuments(scanRows);

      // The history screen keeps its own paged list; without this a deleted or
      // edited row stays on screen until the filters change.
      if (transactionsPage.items.length > 0) {
        await refreshTransactionsPage({ silent: true, keepItems: true });
      }
    } finally {
      startTransition(() => setLoading(false));
    }
  }

  function setTransactionsFilters(nextFilters) {
    setTransactionsFiltersState((current) => {
      const resolved =
        typeof nextFilters === "function"
          ? nextFilters(current)
          : { ...current, ...(nextFilters && typeof nextFilters === "object" ? nextFilters : {}) };
      return normalizeTransactionsFilters(resolved, current.monthKey || selectedMonth || todayMonth());
    });
  }

  async function fetchTransactionsHistoryBatch(filters, { offset = 0, limit = TRANSACTIONS_PAGE_SIZE } = {}) {
    if (!supabase || !session) {
      return { items: [], hasMore: false, filters: normalizeTransactionsFilters(filters, selectedMonth) };
    }

    const normalizedFilters = normalizeTransactionsFilters(filters, selectedMonth);
    const { startIso, endIso } = buildTransactionsMonthRange(normalizedFilters.monthKey);
    const searchTerm = sanitizeTransactionSearchTerm(normalizedFilters.query);
    const accountId = Number(normalizedFilters.accountId || 0);
    const categoryId = Number(normalizedFilters.categoryId || 0);

    let query = supabase
      .from("transactions")
      .select(TRANSACTION_HISTORY_SELECT)
      .eq("user_id", session.user.id)
      .eq("status", "posted")
      .gte("date", startIso)
      .lt("date", endIso)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (normalizedFilters.kind !== "all") {
      query = query.eq("kind", normalizedFilters.kind);
    }

    if (categoryId > 0) {
      query = query.eq("category_id", categoryId);
    }

    if (accountId > 0) {
      query = query.or(`account_id.eq.${accountId},from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
    } else if (searchTerm) {
      query = query.or(`merchant.ilike.%${searchTerm}%,note.ilike.%${searchTerm}%,reference.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query.range(offset, offset + Math.max(1, limit) - 1);
    if (error) throw error;

    let items = sortRuntimeTransactionsNewestFirst(
      (Array.isArray(data) ? data : []).filter((transaction) => transaction?.is_split_child !== true),
    );

    if (searchTerm) {
      items = items.filter((transaction) =>
        matchesTransactionHistorySearch(transaction, searchTerm, { accounts, categories }),
      );
    }

    return {
      items,
      hasMore: (Array.isArray(data) ? data : []).length === Math.max(1, limit),
      filters: normalizedFilters,
    };
  }

  async function refreshTransactionsPage(options = {}) {
    const nextFilters =
      options && options.filters && typeof options.filters === "object"
        ? normalizeTransactionsFilters({ ...transactionsFilters, ...options.filters }, selectedMonth)
        : normalizeTransactionsFilters(transactionsFilters, selectedMonth);

    if (!supabase || !session) {
      setTransactionsPage(createTransactionsPageState());
      return createTransactionsPageState();
    }

    setTransactionsPage((current) =>
      createTransactionsPageState({
        ...current,
        items: options.keepItems === true ? current.items : [],
        loading: true,
        error: "",
      }),
    );

    try {
      const result = await fetchTransactionsHistoryBatch(nextFilters, {
        offset: 0,
        limit: Number(options.limit || TRANSACTIONS_PAGE_SIZE),
      });
      setTransactionsPage(
        createTransactionsPageState({
          items: result.items,
          hasMore: result.hasMore,
        }),
      );
      return result;
    } catch (error) {
      setTransactionsPage((current) =>
        createTransactionsPageState({
          ...current,
          error: toFriendlyActionError(error, "โหลดรายการย้อนหลังไม่สำเร็จ"),
        }),
      );
      if (options.silent !== true) {
        pushToast("error", "โหลดรายการย้อนหลังไม่สำเร็จ");
      }
      return createTransactionsPageState({
        error: toFriendlyActionError(error, "โหลดรายการย้อนหลังไม่สำเร็จ"),
      });
    }
  }

  async function loadMoreTransactions() {
    if (!supabase || !session) return createTransactionsPageState();
    if (transactionsPage.loading || transactionsPage.loadingMore || !transactionsPage.hasMore) {
      return transactionsPage;
    }

    setTransactionsPage((current) => ({
      ...current,
      loadingMore: true,
      error: "",
    }));

    try {
      const result = await fetchTransactionsHistoryBatch(transactionsFilters, {
        offset: transactionsPage.items.length,
        limit: TRANSACTIONS_PAGE_SIZE,
      });
      setTransactionsPage((current) =>
        createTransactionsPageState({
          items: mergeTransactionsById(current.items, result.items),
          hasMore: result.hasMore,
        }),
      );
      return result;
    } catch (error) {
      setTransactionsPage((current) => ({
        ...current,
        loadingMore: false,
        error: toFriendlyActionError(error, "โหลดรายการเพิ่มไม่สำเร็จ"),
      }));
      pushToast("error", "โหลดรายการเพิ่มไม่สำเร็จ");
      return createTransactionsPageState({
        items: transactionsPage.items,
        hasMore: transactionsPage.hasMore,
        error: toFriendlyActionError(error, "โหลดรายการเพิ่มไม่สำเร็จ"),
      });
    }
  }

  async function exportTransactionsCsv(filters = transactionsFilters) {
    if (!supabase || !session || savingRef.current) return false;

    const normalizedFilters = normalizeTransactionsFilters(filters, selectedMonth);
    savingRef.current = true;
    setSaving(true);
    try {
      const exportedRows = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await fetchTransactionsHistoryBatch(normalizedFilters, {
          offset,
          limit: TRANSACTIONS_EXPORT_BATCH_SIZE,
        });
        exportedRows.push(...result.items);
        hasMore = result.hasMore;
        offset += TRANSACTIONS_EXPORT_BATCH_SIZE;
        if (!result.items.length) break;
      }

      const csv = transactionsToCsv(exportedRows, {
        categories,
        accounts,
      });
      downloadCsv(csv, `transactions-${normalizedFilters.monthKey}.csv`);
      pushToast("success", "ส่งออก CSV แล้ว");
      return true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function signIn({ email, password }) {
    if (!supabase) throw new Error("supabase_browser_env_missing");
    setSaving(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      pushToast("success", "เข้าใช้แล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function signUp({ email, password, displayName }) {
    if (!supabase) throw new Error("supabase_browser_env_missing");
    setSaving(true);
    try {
      const metadata = buildAuthMetadata(displayName);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: Object.keys(metadata).length ? { data: metadata } : undefined,
      });
      if (error) throw error;
      pushToast("success", "เช็กอีเมลเพื่อยืนยัน");
    } finally {
      setSaving(false);
    }
  }

  async function signInAnonymously() {
    if (!supabase) throw new Error("supabase_browser_env_missing");
    setSaving(true);
    try {
      const { error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            display_name: GUEST_DISPLAY_NAME,
            auth_mode: "guest",
          },
        },
      });
      if (error) throw error;
      pushToast("success", "เข้าใช้แบบ Guest แล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    migrationAttemptedRef.current = false;
    pushToast("success", "ออกจากระบบแล้ว");
  }

  async function saveProfile(patch) {
    if (!supabase || !session) return;
    setSaving(true);
    try {
      const planningPayload = buildPlanningProfilePayload(patch, profile);
      const payload = {
        display_name: planningPayload.display_name,
        monthly_target_satang: Math.max(
          0,
          toInt(patch?.monthly_target_satang ?? patch?.monthlyTargetSatang ?? profile?.monthly_target_satang, 0),
        ),
        income_mode: planningPayload.income_mode,
        fixed_income_satang: planningPayload.fixed_income_satang,
        income_lookback_months: planningPayload.income_lookback_months,
        savings_mode: planningPayload.savings_mode,
        savings_amount_satang: planningPayload.savings_amount_satang,
        savings_percent_bps: planningPayload.savings_percent_bps,
        debt_strategy_mode: planningPayload.debt_strategy_mode,
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("user_id", session.user.id)
        .select("*")
        .single();

      if (error) throw error;
      setProfile(data);
      await refreshPlannerState(selectedMonth, { nextProfile: data });
      pushToast("success", "บันทึกโปรไฟล์แล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function savePlanningConfig(patch) {
    if (!supabase || !session) return null;
    setSaving(true);
    try {
      const payload = buildPlanningProfilePayload(patch, profile);
      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("user_id", session.user.id)
        .select("*")
        .single();

      if (error) throw error;
      setProfile(data);
      await refreshPlannerState(selectedMonth, { nextProfile: data });
      pushToast("success", "บันทึกแผนรายรับแล้ว");
      return data;
    } finally {
      setSaving(false);
    }
  }

  async function saveCategoryBudgetBehavior(categoryId, budgetBehavior) {
    if (!supabase || !session) return null;
    const targetId = String(categoryId || "").trim();
    if (!targetId) return null;

    setSaving(true);
    try {
      const normalizedBehavior = normalizeBudgetBehavior(budgetBehavior, "flexible");
      const nextPreference = await upsertCategoryPreference({
        categoryId: targetId,
        budgetBehavior: normalizedBehavior,
      });
      await refreshPlannerState();
      pushToast("success", "บันทึกประเภทงบของหมวดแล้ว");
      return nextPreference;
    } catch (error) {
      const message = getBudgetValidationMessage(error?.message || error);
      pushToast("error", message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }

  async function saveBudgetRow(input) {
    if (!supabase || !session) return null;

    setSaving(true);
    try {
      const row = buildBudgetRowPayload(input);
      const monthKey = sanitizeMonthKey(row.month_key || selectedMonth);
      const { categoryMap } = buildRuntimeCategoryIndex();
      const category = categoryMap.get(String(row.category_id || "").trim()) || null;

      if (!category || String(category.kind || "").toLowerCase() !== "expense") {
        throw new Error("budget_category_required");
      }
      if (row.limit_satang <= 0) {
        throw new Error("budget_limit_required");
      }

      const rootId = getBudgetRootCategoryId(row.category_id, categoryMap);
      const isRootBudget = rootId === row.category_id;
      const monthRows = normalizeBudgetRows(budgetRows).filter((budgetRow) => budgetRow.month_key === monthKey);
      const siblingDescendantIds = new Set(listDescendantCategoryIds(rootId, categoryMap));

      if (!isRootBudget) {
        const rootRow =
          monthRows.find((budgetRow) => budgetRow.category_id === rootId) ||
          (row.category_id === rootId ? row : null);
        const rootLimitSatang = Number(rootRow?.limit_satang || 0);

        if (!rootRow || rootLimitSatang <= 0) {
          throw new Error("budget_root_required");
        }

        const siblingTotalSatang = monthRows.reduce((sum, budgetRow) => {
          if (!siblingDescendantIds.has(budgetRow.category_id)) return sum;
          if (budgetRow.category_id === row.category_id) return sum;
          return sum + Number(budgetRow.limit_satang || 0);
        }, 0);

        if (siblingTotalSatang + row.limit_satang > rootLimitSatang) {
          throw new Error("budget_child_limit_exceeded");
        }
      } else {
        const childTotalSatang = monthRows.reduce((sum, budgetRow) => {
          if (!siblingDescendantIds.has(budgetRow.category_id)) return sum;
          return sum + Number(budgetRow.limit_satang || 0);
        }, 0);

        if (childTotalSatang > row.limit_satang) {
          throw new Error("budget_child_limit_exceeded");
        }
      }

      const payload = {
        user_id: session.user.id,
        month_key: monthKey,
        category_id: row.category_id,
        limit_satang: row.limit_satang,
        alert_pct: row.alert_pct || DEFAULT_BUDGET_ALERT_PCT,
        source: row.source || "manual",
        manual_override: row.manual_override === true,
      };

      const query = row.id
        ? supabase.from("budgets").update(payload).eq("id", row.id).eq("user_id", session.user.id)
        : supabase.from("budgets").upsert(payload, {
            onConflict: "user_id,month_key,category_id",
          });
      const { error } = await query;
      if (error) throw error;

      await refreshPlannerState(monthKey);
      pushToast("success", "บันทึกงบรายเดือนแล้ว");
      return true;
    } catch (error) {
      const message = getBudgetValidationMessage(error?.message || error);
      pushToast("error", message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBudgetRow({ id, categoryId, monthKey } = {}) {
    if (!supabase || !session) return false;

    const targetCategoryId = String(categoryId || "").trim();
    const safeMonthKey = sanitizeMonthKey(monthKey || selectedMonth);
    if (!targetCategoryId) return false;

    const { categoryMap } = buildRuntimeCategoryIndex();
    const rootId = getBudgetRootCategoryId(targetCategoryId, categoryMap);
    const deleteIds = rootId === targetCategoryId
      ? [targetCategoryId, ...listDescendantCategoryIds(rootId, categoryMap)]
      : [targetCategoryId];

    setSaving(true);
    try {
      let query = supabase
        .from("budgets")
        .delete()
        .eq("user_id", session.user.id)
        .eq("month_key", safeMonthKey);
      if (id) {
        query = query.eq("id", Number(id));
      } else {
        query = query.in("category_id", deleteIds);
      }

      const { error } = await query;
      if (error) throw error;

      await refreshPlannerState(safeMonthKey);
      pushToast("success", rootId === targetCategoryId ? "ลบงบของหมวดแล้ว" : "ลบ child override แล้ว");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function applySuggestedBudgets() {
    return applyPlannerPlan({ scenarioKey: "baseline" });
    /*

    const safeMonthKey = sanitizeMonthKey(selectedMonth);
    const { categoryMap } = buildRuntimeCategoryIndex();
    const snapshot = buildBudgetPlanSnapshot({
      profile,
      categories,
      debtPlans,
      budgetRows,
      transactions: planningTransactions,
      monthValue: safeMonthKey,
      today: todayDate(),
    });
    const childRows = normalizeBudgetRows(budgetRows).filter((row) => {
      if (row.month_key !== safeMonthKey) return false;
      return getBudgetRootCategoryId(row.category_id, categoryMap) !== row.category_id;
    });
    const childTotalsByRoot = childRows.reduce((map, row) => {
      const rootId = getBudgetRootCategoryId(row.category_id, categoryMap);
      map.set(rootId, (map.get(rootId) || 0) + Number(row.limit_satang || 0));
      return map;
    }, new Map());

    const rootRows = snapshot.categoryPlans
      .map((plan) => {
        const childTotalSatang = Number(childTotalsByRoot.get(plan.categoryId) || 0);
        const suggestedLimitSatang = Math.max(Number(plan.suggestedLimitSatang || 0), childTotalSatang);
        if (suggestedLimitSatang <= 0) return null;
        return {
          user_id: session.user.id,
          month_key: safeMonthKey,
          category_id: plan.categoryId,
          limit_satang: suggestedLimitSatang,
          alert_pct: Number(plan.alertPct || DEFAULT_BUDGET_ALERT_PCT),
          source: "suggested",
          manual_override: false,
        };
      })
      .filter(Boolean);

    setSaving(true);
    try {
      const rootCategoryIds = snapshot.categoryPlans.map((plan) => plan.categoryId);
      if (rootCategoryIds.length) {
        const { error: deleteError } = await supabase
          .from("budgets")
          .delete()
          .eq("user_id", session.user.id)
          .eq("month_key", safeMonthKey)
          .in("category_id", rootCategoryIds);
        if (deleteError) throw deleteError;
      }

      if (rootRows.length) {
        const { error: insertError } = await supabase
          .from("budgets")
          .upsert(rootRows, { onConflict: "user_id,month_key,category_id" });
        if (insertError) throw insertError;
      }

      await refreshPlannerState(safeMonthKey);
      pushToast("success", "นำงบแนะนำมาใช้แล้ว");
      return true;
    } finally {
      setSaving(false);
    }
    */
  }

  function getPlannerScenario(scenarioKey = "baseline") {
    return (Array.isArray(plannerMonthlyPlan?.scenarios) ? plannerMonthlyPlan.scenarios : []).find(
      (scenario) => scenario.id === scenarioKey,
    ) || null;
  }

  function buildPlannerRootRowsForScenario(scenarioKey = "baseline") {
    const safeMonthKey = sanitizeMonthKey(selectedMonth);
    const scenario = getPlannerScenario(scenarioKey);
    if (!scenario) return { rootRows: [], rootCategoryIds: [], safeMonthKey, scenario: null };

    const { categoryMap } = buildRuntimeCategoryIndex();
    const childRows = normalizeBudgetRows(budgetRows).filter((row) => {
      if (row.month_key !== safeMonthKey) return false;
      return getBudgetRootCategoryId(row.category_id, categoryMap) !== row.category_id;
    });
    const childTotalsByRoot = childRows.reduce((map, row) => {
      const rootId = getBudgetRootCategoryId(row.category_id, categoryMap);
      map.set(rootId, (map.get(rootId) || 0) + Number(row.limit_satang || 0));
      return map;
    }, new Map());

    const rootRows = scenario.items
      .map((item) => {
        const childTotalSatang = Number(childTotalsByRoot.get(item.categoryId) || 0);
        const suggestedLimitSatang = item.lockedByUser
          ? Number(item.currentLimitSatang || item.recommendedLimitSatang || 0)
          : Number(item.recommendedLimitSatang || 0);
        const nextLimitSatang = Math.max(childTotalSatang, suggestedLimitSatang);
        if (nextLimitSatang <= 0) return null;
        return {
          user_id: session.user.id,
          month_key: safeMonthKey,
          category_id: item.categoryId,
          limit_satang: nextLimitSatang,
          alert_pct: Number(item.alertPct || DEFAULT_BUDGET_ALERT_PCT),
          source: item.lockedByUser ? "manual" : "suggested",
          manual_override: item.lockedByUser === true,
        };
      })
      .filter(Boolean);

    return {
      rootRows,
      rootCategoryIds: scenario.items.map((item) => item.categoryId),
      safeMonthKey,
      scenario,
    };
  }

  async function persistPlannerItemDecision(item, scenarioKey, overrides = {}) {
    if (!supabase || !session || plannerStorage.unavailable === true) return null;

    const safeMonthKey = sanitizeMonthKey(selectedMonth);
    const syncedStorage = await syncPlannerMonthlyPlanRows(safeMonthKey, plannerMonthlyPlan);
    const planId = (syncedStorage?.plans || []).find((row) => row.scenario_key === scenarioKey)?.id || null;
    const { error } = await supabase.from("planner_monthly_plan_items").upsert(
      {
        user_id: session.user.id,
        plan_id: planId,
        month_key: safeMonthKey,
        scenario_key: scenarioKey,
        category_id: item.categoryId,
        behavior: item.behavior,
        baseline_spend_satang: item.baselineSpendSatang,
        recent_spend_satang: item.recentSpendSatang,
        current_pace_satang: item.currentPaceSatang,
        volatility_score: item.volatilityScore,
        recommended_limit_satang: item.recommendedLimitSatang,
        delta_satang: item.deltaSatang,
        confidence_score: item.confidenceScore,
        reason_codes: item.reasonCodes,
        locked_by_user: item.lockedByUser === true,
        decision_status: item.decisionStatus || "pending",
        applied_limit_satang: item.currentLimitSatang,
        locked_limit_satang: item.lockedLimitSatang,
        metadata: {
          label: item.name,
          projectedMonthEndSatang: item.projectedMonthEndSatang,
          currentSpentSatang: item.currentSpentSatang,
        },
        ...overrides,
      },
      { onConflict: "user_id,month_key,scenario_key,category_id" },
    );
    if (error) throw error;
    return true;
  }

  async function applyPlannerPlan({ scenarioKey = "baseline" } = {}) {
    if (!supabase || !session) return false;

    const { rootRows, rootCategoryIds, safeMonthKey, scenario } = buildPlannerRootRowsForScenario(scenarioKey);
    if (!scenario) return false;

    setSaving(true);
    try {
      if (rootCategoryIds.length) {
        const { error: deleteError } = await supabase
          .from("budgets")
          .delete()
          .eq("user_id", session.user.id)
          .eq("month_key", safeMonthKey)
          .in("category_id", rootCategoryIds);
        if (deleteError) throw deleteError;
      }

      if (rootRows.length) {
        const { error: insertError } = await supabase
          .from("budgets")
          .upsert(rootRows, { onConflict: "user_id,month_key,category_id" });
        if (insertError) throw insertError;
      }

      if (plannerStorage.unavailable !== true) {
        await syncPlannerMonthlyPlanRows(safeMonthKey, plannerMonthlyPlan);
        const { error: resetPlanError } = await supabase
          .from("planner_monthly_plans")
          .update({ status: "draft" })
          .eq("user_id", session.user.id)
          .eq("month_key", safeMonthKey)
          .neq("scenario_key", scenarioKey);
        if (resetPlanError) throw resetPlanError;

        const { error: planError } = await supabase
          .from("planner_monthly_plans")
          .update({ status: "applied" })
          .eq("user_id", session.user.id)
          .eq("month_key", safeMonthKey)
          .eq("scenario_key", scenarioKey);
        if (planError) throw planError;

        for (const item of scenario.items) {
          await persistPlannerItemDecision(item, scenarioKey, {
            decision_status: item.lockedByUser ? item.decisionStatus || "accepted" : "accepted",
            locked_by_user: item.lockedByUser === true,
            locked_limit_satang: item.lockedByUser ? item.currentLimitSatang : 0,
            applied_limit_satang: item.lockedByUser ? item.currentLimitSatang : item.recommendedLimitSatang,
          });
        }
      }

      await refreshPlannerState(safeMonthKey);
      pushToast("success", `นำแผน ${scenario.label} มาใช้แล้ว`);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function acceptPlannerRecommendation({ scenarioKey = "baseline", categoryId } = {}) {
    if (!supabase || !session || !categoryId) return false;

    const scenario = getPlannerScenario(scenarioKey);
    const item = (Array.isArray(scenario?.items) ? scenario.items : []).find((entry) => entry.categoryId === categoryId) || null;
    if (!item) return false;

    setSaving(true);
    try {
      const { error } = await supabase.from("budgets").upsert(
        {
          user_id: session.user.id,
          month_key: sanitizeMonthKey(selectedMonth),
          category_id: item.categoryId,
          limit_satang: item.recommendedLimitSatang,
          alert_pct: Number(item.alertPct || DEFAULT_BUDGET_ALERT_PCT),
          source: "suggested",
          manual_override: false,
        },
        { onConflict: "user_id,month_key,category_id" },
      );
      if (error) throw error;

      await persistPlannerItemDecision(item, scenarioKey, {
        decision_status: "accepted",
        locked_by_user: false,
        locked_limit_satang: 0,
        applied_limit_satang: item.recommendedLimitSatang,
      });
      await refreshPlannerState();
      pushToast("success", "รับคำแนะนำแล้ว");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function dismissPlannerRecommendation({ scenarioKey = "baseline", categoryId } = {}) {
    if (!supabase || !session || !categoryId) return false;

    const scenario = getPlannerScenario(scenarioKey);
    const item = (Array.isArray(scenario?.items) ? scenario.items : []).find((entry) => entry.categoryId === categoryId) || null;
    if (!item) return false;

    setSaving(true);
    try {
      await persistPlannerItemDecision(item, scenarioKey, {
        decision_status: "dismissed",
        applied_limit_satang: item.currentLimitSatang,
      });
      await refreshPlannerState();
      pushToast("success", "คงงบเดิมไว้แล้ว");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function lockPlannerRecommendation({ scenarioKey = "baseline", categoryId, limitSatang = null } = {}) {
    if (!supabase || !session || !categoryId) return false;

    const scenario = getPlannerScenario(scenarioKey);
    const item = (Array.isArray(scenario?.items) ? scenario.items : []).find((entry) => entry.categoryId === categoryId) || null;
    if (!item) return false;

    const nextLimitSatang = Math.max(0, Number(limitSatang || item.currentLimitSatang || item.recommendedLimitSatang || 0));

    setSaving(true);
    try {
      const { error } = await supabase.from("budgets").upsert(
        {
          user_id: session.user.id,
          month_key: sanitizeMonthKey(selectedMonth),
          category_id: item.categoryId,
          limit_satang: nextLimitSatang,
          alert_pct: Number(item.alertPct || DEFAULT_BUDGET_ALERT_PCT),
          source: "manual",
          manual_override: true,
        },
        { onConflict: "user_id,month_key,category_id" },
      );
      if (error) throw error;

      await persistPlannerItemDecision(item, scenarioKey, {
        decision_status: "accepted",
        locked_by_user: true,
        locked_limit_satang: nextLimitSatang,
        applied_limit_satang: nextLimitSatang,
      });
      await refreshPlannerState();
      pushToast("success", "ล็อกงบหมวดนี้แล้ว");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount(payload) {
    if (!session) return;
    setSaving(true);
    try {
      await fetchWithSession(session, "/api/accounts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refreshAll();
      if (transactionsPage.items.length) {
        await refreshTransactionsPage({ silent: true });
      }
      pushToast("success", payload?.id ? "อัปเดตบัญชีแล้ว" : "เพิ่มบัญชีแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(accountId) {
    if (!session || !accountId) return false;
    setSaving(true);
    try {
      await fetchWithSession(session, "/api/accounts", {
        method: "DELETE",
        body: JSON.stringify({ id: Number(accountId) }),
      });
      await refreshAll();
      if (transactionsPage.items.length) {
        await refreshTransactionsPage({ silent: true });
      }
      pushToast("success", "ลบบัญชีแล้ว");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function adjustAccountBalance(payload) {
    if (!session) return null;
    if (!isOnline) {
      pushToast("error", "ต้องออนไลน์เพื่อปรับยอดบัญชี");
      return null;
    }

    setSaving(true);
    try {
      const json = await fetchWithSession(session, "/api/account-adjustments", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });

      await refreshAll();

      if (json?.noop) {
        pushToast("info", "ยอดบัญชีตรงอยู่แล้ว");
        return json;
      }

      pushToast(
        "success",
        String(json?.mode || "").trim() === "silent" ? "ปรับยอดบัญชีแล้ว" : "บันทึกการปรับยอดแล้ว",
      );
      return json;
    } finally {
      setSaving(false);
    }
  }

  async function saveFinancialGoal(payload) {
    if (!supabase || !session || savingRef.current) return false;

    const goal = buildFinancialGoalPayload(payload);
    if (Number(goal.target_amount_satang || 0) <= 0) {
      pushToast("warning", "กรอกยอดเป้าหมายมากกว่า 0");
      return false;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const row = {
        user_id: session.user.id,
        legacy_id: goal.legacy_id,
        name: goal.name,
        target_amount_satang: goal.target_amount_satang,
        current_amount_satang: goal.current_amount_satang,
        target_date: goal.target_date,
        monthly_contribution_satang: goal.monthly_contribution_satang,
        linked_account_id: goal.linked_account_id,
        status: goal.status,
      };

      const query = goal.id
        ? supabase.from("financial_goals").update(row).eq("id", goal.id).eq("user_id", session.user.id)
        : supabase.from("financial_goals").insert(row);

      const { error } = await query;
      if (error) throw error;

      await refreshPlannerState();
      pushToast("success", goal.id ? "อัปเดตเป้าหมายแล้ว" : "เพิ่มเป้าหมายแล้ว");
      return true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function deleteFinancialGoal(goalId) {
    if (!supabase || !session || !goalId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("financial_goals")
        .delete()
        .eq("id", Number(goalId))
        .eq("user_id", session.user.id);

      if (error) throw error;

      await refreshPlannerState();
      pushToast("success", "ลบเป้าหมายแล้ว");
    } finally {
      setSaving(false);
    }
  }

  function saveCreditStatements(payloads) {
    const incoming = Array.isArray(payloads) ? payloads : [payloads].filter(Boolean);
    const validIncoming = incoming.filter((item) => {
      const draft = normalizeCreditStatement(item || {});
      return hasCreditStatementIdentity(draft);
    });
    if (!validIncoming.length) {
      pushToast("warning", "ไม่มีข้อมูลรอบบัตรให้บันทึก");
      return false;
    }
    const nextCreditStatements = mergeCreditStatements(creditStatements, validIncoming);

    try {
      const persisted = persistLocalCreditStatements(nextCreditStatements);
      setCreditStatements(persisted);
      setLegacyAvailable(hasLegacySnapshot());
      pushToast("success", "บันทึกข้อมูลรอบบัตรแล้ว");
      return true;
    } catch (error) {
      pushToast("error", String(error?.message || error || "save_credit_statement_failed"));
      return false;
    }
  }

  function saveCreditStatement(payload) {
    return saveCreditStatements([payload]);
  }

  function saveSalaryPlans(payloads) {
    const incoming = Array.isArray(payloads) ? payloads : [payloads].filter(Boolean);
    const validIncoming = incoming.filter((item) => {
      const draft = normalizeSalaryPlan(item || {});
      return hasSalaryPlanIdentity(draft);
    });
    if (!validIncoming.length) {
      pushToast("warning", "ไม่มีข้อมูลแผนเงินเดือนให้บันทึก");
      return false;
    }
    const nextSalaryPlans = mergeSalaryPlans(salaryPlans, validIncoming);

    try {
      const persisted = persistLocalSalaryPlans(nextSalaryPlans);
      setSalaryPlans(persisted);
      setLegacyAvailable(hasLegacySnapshot());
      pushToast("success", "บันทึกแผนเงินเดือนแล้ว");
      return true;
    } catch (error) {
      pushToast("error", String(error?.message || error || "save_salary_plan_failed"));
      return false;
    }
  }

  function saveSalaryPlan(payload) {
    return saveSalaryPlans([payload]);
  }

  async function saveDebtPlan(payload) {
    if (!supabase || !session || savingRef.current) return false;

    const plan = buildDebtPlanPayload(payload);
    if (Number(plan.target_payment_satang || 0) <= 0) {
      pushToast("warning", "กรอกยอดที่อยากจ่ายมากกว่า 0");
      return false;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const row = {
        user_id: session.user.id,
        legacy_id: plan.legacy_id,
        account_id: plan.account_id,
        current_balance_satang: plan.current_balance_satang,
        minimum_payment_satang: plan.minimum_payment_satang,
        target_payment_satang: plan.target_payment_satang,
        apr_bps: plan.apr_bps,
        due_day: plan.due_day,
        payoff_target_date: plan.payoff_target_date,
        status: plan.status,
        note: plan.note,
      };

      const query = plan.id
        ? supabase.from("debt_plans").update(row).eq("id", plan.id).eq("user_id", session.user.id)
        : supabase.from("debt_plans").insert(row);

      const { error } = await query;
      if (error) throw error;

      await refreshPlannerState();
      pushToast("success", plan.id ? "อัปเดตแผนชำระแล้ว" : "เพิ่มแผนชำระแล้ว");
      return true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function deleteDebtPlan(planId) {
    if (!supabase || !session || !planId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("debt_plans")
        .delete()
        .eq("id", Number(planId))
        .eq("user_id", session.user.id);

      if (error) throw error;

      await refreshPlannerState();
      pushToast("success", "ลบแผนชำระแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(payload) {
    if (!supabase || !session) return null;

    const allCategories = flattenCategoryGroups(categories);
    const categoryId = String(payload?.id || "").trim();
    const existing = categoryId
      ? allCategories.find((row) => String(row?.id || "").trim() === categoryId) || null
      : null;
    const kind = String(payload?.kind || existing?.kind || "expense").trim().toLowerCase() === "income"
      ? "income"
      : "expense";
    const name = String(payload?.name || "").trim();
    const icon = String(payload?.icon || existing?.icon || "🏷️").trim() || "🏷️";
    const color = String(payload?.color || existing?.color || "#0b84ff").trim() || "#0b84ff";
    const isSystem = payload?.isSystem === true || existing?.isSystem === true;

    if (!name) {
      throw new Error("category_name_required");
    }

    setSaving(true);
    try {
      if (isSystem) {
        const targetId = categoryId || String(existing?.id || "").trim();
        if (!targetId) throw new Error("category_write_failed");

        await upsertCategoryPreference({
          categoryId: targetId,
          name,
          icon,
          color,
          hidden: false,
        });
      } else {
        const wantsSub = String(payload?.level || "").trim() === "sub" || String(payload?.parentId || "").trim() !== "";
        const requestedParentId = String(payload?.parentId || "").trim();
        const parentCategory = requestedParentId
          ? allCategories.find((row) => String(row?.id || "").trim() === requestedParentId) || null
          : null;
        const hasChildren = categoryId
          ? allCategories.some((row) => String(row?.parentId || "").trim() === categoryId)
          : false;

        if (wantsSub && !requestedParentId) {
          throw new Error("category_parent_required");
        }

        const safeParentId =
          hasChildren
            ? ""
            : parentCategory && !String(parentCategory?.parentId || "").trim() && !parentCategory?.isHidden
            ? String(parentCategory.id)
            : "";

        if (wantsSub && !safeParentId) {
          throw new Error("category_parent_required");
        }

        const nextId = categoryId || buildNextCustomCategoryId({
          userId: session.user.id,
          kind,
          name,
          existingIds: allCategories.map((row) => row.id),
        });

        const categoryRow = {
          id: nextId,
          user_id: session.user.id,
          is_system: false,
          kind,
          name,
          icon,
          color,
          parent_id: safeParentId || null,
          sort_order: existing?.sortOrder ?? getNextCategorySortOrder(categories, kind),
        };

        if (categoryId) {
          const { error } = await supabase
            .from("categories")
            .update(categoryRow)
            .eq("id", nextId)
            .eq("user_id", session.user.id);

          if (error) throw new Error(String(error.message || "category_write_failed"));
        } else {
          const { error } = await supabase.from("categories").insert(categoryRow);
          if (error) throw new Error(String(error.message || "category_write_failed"));
        }
      }

      await refreshAll();
      pushToast("success", categoryId ? "บันทึกหมวดหมู่แล้ว" : "เพิ่มหมวดหมู่แล้ว");
      return true;
    } catch (error) {
      const message = toCategoryErrorMessage(error);
      pushToast("error", message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }

  async function setCategoryHidden(categoryId, hidden) {
    if (!supabase || !session) return null;

    const targetId = String(categoryId || "").trim();
    const allCategories = flattenCategoryGroups(categories);
    const target = allCategories.find((row) => String(row?.id || "").trim() === targetId) || null;
    if (!target || target.isSystem) return null;

    setSaving(true);
    try {
      if (hidden) {
        await upsertCategoryPreference({ categoryId: targetId, hidden: true });
      } else {
        await clearCategoryPreference(targetId);
      }

      await refreshAll();
      pushToast("success", hidden ? "ซ่อนหมวดหมู่แล้ว" : "กู้คืนหมวดหมู่แล้ว");
      return true;
    } catch (error) {
      const message = toCategoryErrorMessage(error);
      pushToast("error", message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }

  async function upsertMerchantMappingFromDraft(draft, metadata = {}) {
    if (!supabase || !session) return null;

    const sanitized = sanitizeTransactionDraft(draft);
    const kind = String(sanitized?.kind || "").trim().toLowerCase();
    const merchantName = String(sanitized?.merchant || "").trim();
    const merchantKey = normalizeMerchantKey(merchantName);
    const existing =
      merchantMappings.find((item) => String(item?.merchant_key || "").trim() === merchantKey) || null;

    if (!merchantKey || kind === "transfer") return null;

    const accountId =
      kind === "transfer"
        ? sanitized.fromAccountId
        : sanitized.accountId;
    const payload = {
      user_id: session.user.id,
      merchant_key: merchantKey,
      canonical_merchant: merchantName || merchantKey,
      preferred_category_id: sanitized.categoryId || null,
      preferred_account_id: accountId ? Number(accountId) : null,
      usage_count: Math.max(1, Number(existing?.usage_count || 0) + 1),
      last_used_at: new Date().toISOString(),
      metadata: {
        ...(existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
        kind,
        ...metadata,
      },
    };

    const { data, error } = await supabase
      .from("merchant_mappings")
      .upsert(payload, {
        onConflict: "user_id,merchant_key",
      })
      .select("*")
      .single();
    if (error) throw error;
    if (data) {
      setMerchantMappings((current) => {
        const next = [
          ...current.filter((item) => String(item?.merchant_key || "").trim() !== merchantKey),
          data,
        ];
        return next.sort(
          (left, right) =>
            Number(right?.usage_count || 0) - Number(left?.usage_count || 0) ||
            String(right?.last_used_at || "").localeCompare(String(left?.last_used_at || "")),
        );
      });
    }
    return data || payload;
  }

  async function saveTransactionDraft(draft, options = {}) {
    if (!supabase || !session) return null;
    const plan = buildTransactionSavePlan({
      draft,
      userId: session.user.id,
      source: options.source || "manual",
      scanDocumentId: options.scanDocumentId || null,
      attachment: options.attachment || null,
    });

    if (plan.mode === "split") {
      const insertedIds = [];

      try {
        const { data: parent, error: parentError } = await supabase
          .from("transactions")
          .insert({
            ...plan.parentRow,
            merchant_key: normalizeMerchantKey(plan.sanitized.merchant || ""),
            source_recurring_id: options.sourceRecurringId || null,
          })
          .select("id")
          .single();

        if (parentError) throw parentError;
        insertedIds.push(Number(parent.id));

        const childRows = plan.childRows.map((row) => ({
          ...row,
          split_parent_id: parent.id,
          merchant_key: normalizeMerchantKey(plan.sanitized.merchant || ""),
          source_recurring_id: options.sourceRecurringId || null,
        }));

        const { data: children, error: childError } = await supabase
          .from("transactions")
          .insert(childRows)
          .select("id");

        if (childError) throw childError;

        for (const child of Array.isArray(children) ? children : []) {
          if (child?.id != null) insertedIds.push(Number(child.id));
        }

        await upsertMerchantMappingFromDraft(plan.sanitized, {
          source: options.source || "manual",
        });

        return {
          id: Number(parent.id),
          childIds: (Array.isArray(children) ? children : []).map((child) => Number(child?.id || 0)).filter(Boolean),
          savedDraft: plan.sanitized,
        };
      } catch (error) {
        if (insertedIds.length) {
          try {
            await supabase.from("transactions").delete().in("id", insertedIds);
          } catch {
            // Ignore cleanup failures and surface the original error.
          }
        }
        throw error;
      }
    }

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        ...plan.row,
        merchant_key: normalizeMerchantKey(plan.sanitized.merchant || ""),
        source_recurring_id: options.sourceRecurringId || null,
      })
      .select("id")
      .single();

    if (error) throw error;

    if (plan.lineItems.length) {
      const { error: lineError } = await supabase.from("transaction_line_items").insert(
        plan.lineItems.map((item) => ({
          transaction_id: data.id,
          user_id: session.user.id,
          ...item,
        })),
      );

      if (lineError) {
        try {
          await supabase.from("transactions").delete().eq("id", data.id);
        } catch {
          // Ignore cleanup failures and surface the original error.
        }
        throw lineError;
      }
    }

    await upsertMerchantMappingFromDraft(plan.sanitized, {
      source: options.source || "manual",
    });

    return {
      id: Number(data.id),
      childIds: [],
      savedDraft: plan.sanitized,
    };
  }

  async function createManualTransaction(draft, options = {}) {
    if (!session) return;

    if (!isOnline && !options.skipQueue) {
      const nextQueue = enqueueManualDraft(draft);
      applyOfflineQueueState(nextQueue);
      pushToast("info", "บันทึกออฟไลน์แล้ว");
      return;
    }

    setSaving(true);
    try {
      await saveTransactionDraft(draft, { source: options.source || "manual" });
      if (options.deferRefresh !== true) {
        await refreshTransactionDependentState();
        pushToast("success", "บันทึกรายการแล้ว");
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateTransaction(transactionLike, draft) {
    if (!supabase || !session) return false;
    const transactionId = Number((transactionLike?.id ?? transactionLike) || 0);
    if (!transactionId) return false;

    const existing =
      transactionLike && typeof transactionLike === "object"
        ? transactionLike
        : recentTransactions.find((transaction) => Number(transaction?.id || 0) === transactionId) || null;

    if (existing?.is_split_parent || existing?.is_split_child) {
      pushToast("warning", "แก้ไขรายการแยกหมวดจากหน้านี้ยังไม่ได้");
      return false;
    }

    const plan = buildTransactionSavePlan({
      draft,
      userId: session.user.id,
      source: existing?.raw?.source || "manual",
    });

    if (plan.mode !== "single") {
      pushToast("warning", "แก้ไขรายการแยกหมวดจากหน้านี้ยังไม่ได้");
      return false;
    }

    setSaving(true);
    try {
      const { row, sanitized } = plan;
      const { error } = await supabase
        .from("transactions")
        .update({
          kind: row.kind,
          account_id: row.account_id,
          from_account_id: row.from_account_id,
          to_account_id: row.to_account_id,
          category_id: row.category_id,
          merchant: row.merchant,
          merchant_key: normalizeMerchantKey(sanitized.merchant || "") || null,
          note: row.note,
          reference: row.reference,
          payment_method: row.payment_method,
          amount_satang: row.amount_satang,
          currency: row.currency,
          date: row.date,
          raw: buildMergedTransactionRaw(existing?.raw, row.raw, draft),
        })
        .eq("user_id", session.user.id)
        .eq("id", transactionId);
      if (!error) {
        await upsertMerchantMappingFromDraft(sanitized, {
          source: existing?.raw?.source || "manual_update",
        });
      }

      if (error) throw error;
      await refreshTransactionDependentState();
      pushToast("success", "อัปเดตรายการแล้ว");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction(transactionLike) {
    if (!supabase || !session) return false;
    const transactionId = Number((transactionLike?.id ?? transactionLike) || 0);
    if (!transactionId) return false;

    const existing =
      transactionLike && typeof transactionLike === "object"
        ? transactionLike
        : recentTransactions.find((transaction) => Number(transaction?.id || 0) === transactionId) || null;

    setSaving(true);
    try {
      let targetIds = [transactionId];

      if (existing?.is_split_parent && existing?.split_group_id) {
        const { data, error } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("split_group_id", existing.split_group_id);

        if (error) throw error;
        const nextIds = (Array.isArray(data) ? data : []).map((row) => Number(row?.id || 0)).filter(Boolean);
        if (nextIds.length) targetIds = nextIds;
      }

      const { error: lineItemsError } = await supabase.from("transaction_line_items").delete().in("transaction_id", targetIds);
      if (lineItemsError) throw lineItemsError;

      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("user_id", session.user.id)
        .in("id", targetIds);

      if (error) throw error;
      await refreshTransactionDependentState();
      pushToast("success", targetIds.length > 1 ? "ลบรายการที่แยกหมวดแล้ว" : "ลบรายการแล้ว");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function rejectScanDocument(scanId) {
    if (!supabase) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("scan_documents")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", scanId);

      if (error) throw error;
      markScanDocumentStatus(scanId, { status: "rejected", reviewed_at: new Date().toISOString() });
      await refreshScanDocuments();
      pushToast("success", "ย้ายออกจากคิวแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function approveScanDocument(scan, draft) {
    if (!supabase || !session) return;
    setSaving(true);
    try {
      const transaction = await saveTransactionDraft(draft, {
        source: "scan_approval",
        scanDocumentId: scan.id,
        attachment: scan?.file_path
          ? {
              path: scan.file_path,
              fileName: scan.file_name,
              mimeType: scan.mime_type,
            }
          : null,
      });

      const sanitized = transaction?.savedDraft || sanitizeTransactionDraft(draft);
      const merchantKey = normalizeMerchantKey(sanitized.merchant || "");

      const { error: scanError } = await supabase
        .from("scan_documents")
        .update({
          status: "approved",
          approved_transaction_id: transaction?.id || null,
          matched_account_id:
            sanitized.kind === "transfer"
              ? sanitized.fromAccountId
                ? Number(sanitized.fromAccountId)
                : null
              : sanitized.accountId
              ? Number(sanitized.accountId)
              : null,
          matched_category_id: sanitized.categoryId || null,
          normalized_suggestion: buildApprovedSuggestion(scan, sanitized),
          merchant_key: merchantKey || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", scan.id);

      if (scanError) throw scanError;

      markScanDocumentStatus(scan.id, {
        status: "approved",
        approved_transaction_id: transaction?.id || null,
        reviewed_at: new Date().toISOString(),
      });

      if (merchantKey) {
        await upsertMerchantMappingFromDraft(sanitized, {
          source: "scan_approval",
        });
      }

      await refreshTransactionDependentState({ includeScans: true });
      pushToast("success", "บันทึกรายการแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function saveRecurringRule(input) {
    if (!supabase || !session || savingRef.current) return false;

    const rule = buildRecurringRulePayload(input);
    const isTransfer = rule.kind === "transfer";

    if (Number(rule.amount_satang || 0) <= 0) {
      pushToast("warning", "à¸à¸£à¸­à¸à¸¢à¸­à¸” recurring à¹ƒà¸«à¹‰à¸¡à¸²à¸à¸à¸§à¹ˆà¸² 0");
      return false;
    }

    if (!rule.start_date || Number(rule.interval_count || 0) <= 0) {
      pushToast("warning", "à¸à¸£à¸­à¸à¸£à¸­à¸šà¹à¸¥à¸°à¸§à¸±à¸™à¹€à¸£à¸´à¹ˆà¸¡à¹ƒà¸«à¹‰à¸„à¸£à¸š");
      return false;
    }

    if (isTransfer) {
      if (!rule.from_account_id || !rule.to_account_id || rule.from_account_id === rule.to_account_id) {
        pushToast("warning", "à¹€à¸¥à¸·à¸­à¸à¸šà¸±à¸à¸Šà¸µà¸•à¹‰à¸™à¸—à¸²à¸‡à¹à¸¥à¸°à¸›à¸¥à¸²à¸¢à¸—à¸²à¸‡à¹ƒà¸«à¹‰à¸•à¹ˆà¸²à¸‡à¸à¸±à¸™");
        return false;
      }
    } else if (!rule.account_id || !rule.category_id) {
      pushToast("warning", "à¹€à¸¥à¸·à¸­à¸à¸šà¸±à¸à¸Šà¸µà¹à¸¥à¸°à¸«à¸¡à¸§à¸”à¹ƒà¸«à¹‰à¸„à¸£à¸š");
      return false;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        user_id: session.user.id,
        legacy_id: rule.legacy_id,
        kind: rule.kind,
        amount_satang: rule.amount_satang,
        account_id: rule.account_id ? Number(rule.account_id) : null,
        from_account_id: rule.from_account_id ? Number(rule.from_account_id) : null,
        to_account_id: rule.to_account_id ? Number(rule.to_account_id) : null,
        category_id: rule.category_id || null,
        merchant: rule.merchant || null,
        note: rule.note || null,
        frequency: rule.frequency,
        interval_count: rule.interval_count,
        anchor_day: rule.anchor_day,
        start_date: rule.start_date,
        end_date: rule.end_date || null,
        last_generated_date: rule.last_generated_date || null,
        enabled: rule.enabled !== false,
      };

      const query = rule.id
        ? supabase.from("recurring_rules").update(payload).eq("id", rule.id).eq("user_id", session.user.id)
        : supabase.from("recurring_rules").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) throw error;

      setRecurringRules((current) =>
        normalizeRecurringRules([
          ...current.filter((item) => Number(item?.id || 0) !== Number(rule.id || 0)),
          data,
        ]),
      );
      pushToast("success", rule.id ? "à¸šà¸±à¸™à¸—à¸¶à¸ recurring à¹à¸¥à¹‰à¸§" : "à¹€à¸žà¸´à¹ˆà¸¡ recurring à¹à¸¥à¹‰à¸§");
      return data;
    } catch (error) {
      if (isMissingPlannerRelationError(error, "recurring_rules")) {
        pushToast("error", "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸•à¸²à¸£à¸²à¸‡ recurring_rules à¹ƒà¸™à¸à¸²à¸™à¸‚à¹‰à¸­à¸¡à¸¹à¸¥");
        return false;
      }
      throw error;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function deleteRecurringRule(ruleId) {
    if (!supabase || !session || !ruleId) return false;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("recurring_rules")
        .delete()
        .eq("user_id", session.user.id)
        .eq("id", Number(ruleId));
      if (error) throw error;

      setRecurringRules((current) => current.filter((rule) => Number(rule?.id || 0) !== Number(ruleId)));
      pushToast("success", "à¸¥à¸š recurring à¹à¸¥à¹‰à¸§");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function toggleRecurringRule(ruleLike, enabled = null) {
    const rule =
      ruleLike && typeof ruleLike === "object"
        ? ruleLike
        : recurringRules.find((item) => Number(item?.id || 0) === Number(ruleLike || 0)) || null;
    if (!rule) return false;
    const nextEnabled = enabled == null ? rule.enabled !== true : enabled === true;
    return saveRecurringRule({
      ...rule,
      enabled: nextEnabled,
    });
  }

  async function runRecurringNow(options = {}) {
    if (!supabase || !session || savingRef.current) return false;

    const todayISO = todayDate();
    const requestedIds = new Set((Array.isArray(options.ruleIds) ? options.ruleIds : []).map((id) => Number(id || 0)));
    const sourceRules = recurringRules.filter((rule) => {
      if (requestedIds.size && !requestedIds.has(Number(rule?.id || 0))) return false;
      return getRecurringDueState(rule, todayISO) === "due";
    });

    if (!sourceRules.length) {
      pushToast("info", "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ recurring à¸—à¸µà¹ˆà¸–à¸¶à¸‡à¸£à¸­à¸š");
      return false;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      let createdCount = 0;
      let truncatedCount = 0;

      for (const rule of sourceRules) {
        const occurrence = buildRecurringOccurrences(rule, todayISO);
        if (!occurrence.drafts.length) continue;

        for (const draft of occurrence.drafts) {
          await saveTransactionDraft(draft, {
            source: "recurring",
            sourceRecurringId: rule.id,
          });
          createdCount += 1;
        }

        if (occurrence.truncated) truncatedCount += 1;

        const { error } = await supabase
          .from("recurring_rules")
          .update({
            last_generated_date: occurrence.nextRule.last_generated_date || rule.last_generated_date || null,
          })
          .eq("user_id", session.user.id)
          .eq("id", Number(rule.id));
        if (error) throw error;
      }

      await refreshAll();

      if (createdCount <= 0) {
        pushToast("info", "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸à¸²à¸£ recurring à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸ªà¸£à¹‰à¸²à¸‡");
        return false;
      }

      pushToast(
        truncatedCount > 0 ? "warning" : "success",
        truncatedCount > 0
          ? `à¸ªà¸£à¹‰à¸²à¸‡ recurring à¹à¸¥à¹‰à¸§ ${createdCount} à¸£à¸²à¸¢à¸à¸²à¸£ à¹à¸¥à¸°à¸¡à¸µ ${truncatedCount} à¸à¸Žà¸—à¸µà¹ˆà¸¢à¸±à¸‡à¸„à¹‰à¸²à¸‡à¸­à¸¢à¸¹à¹ˆ`
          : `à¸ªà¸£à¹‰à¸²à¸‡ recurring à¹à¸¥à¹‰à¸§ ${createdCount} à¸£à¸²à¸¢à¸à¸²à¸£`,
      );
      return true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function markNotificationRead(notificationId) {
    const target = notifications.find((item) => String(item?.id || "") === String(notificationId || "")) || null;
    if (!target) return false;

    const runtimeKey = getNotificationRuntimeKey(target);
    if (notificationsUnavailable || Number(notificationId || 0) <= 0) {
      setLocalNotificationReadKeys((current) => mergeNotificationKeys(current, runtimeKey));
      return true;
    }

    const timestamp = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: timestamp,
      })
      .eq("user_id", session.user.id)
      .eq("id", Number(notificationId));
    if (error) throw error;

    setStoredNotifications((current) =>
      normalizeNotifications(
        current.map((item) =>
          Number(item?.id || 0) === Number(notificationId)
            ? {
                ...item,
                is_read: true,
                read_at: timestamp,
              }
            : item,
        ),
      ),
    );
    return true;
  }

  async function markAllNotificationsRead() {
    const unreadItems = notifications.filter((item) => item?.is_read !== true);
    if (!unreadItems.length) return false;

    const runtimeKeys = unreadItems.map((item) => getNotificationRuntimeKey(item));
    const persistedIds = unreadItems
      .map((item) => Number(item?.id || 0))
      .filter((id) => id > 0);

    if (!notificationsUnavailable && persistedIds.length) {
      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: timestamp,
        })
        .eq("user_id", session.user.id)
        .in("id", persistedIds);
      if (error) throw error;

      setStoredNotifications((current) =>
        normalizeNotifications(
          current.map((item) =>
            persistedIds.includes(Number(item?.id || 0))
              ? {
                  ...item,
                  is_read: true,
                  read_at: timestamp,
                }
              : item,
          ),
        ),
      );
    }

    setLocalNotificationReadKeys((current) => mergeNotificationKeyList(current, runtimeKeys));
    return true;
  }

  async function dismissNotification(notificationId) {
    const target = notifications.find((item) => String(item?.id || "") === String(notificationId || "")) || null;
    if (!target) return false;

    const runtimeKey = getNotificationRuntimeKey(target);
    if (notificationsUnavailable || Number(notificationId || 0) <= 0) {
      setLocalNotificationDismissedKeys((current) => mergeNotificationKeys(current, runtimeKey));
      return true;
    }

    const { error } = await supabase
      .from("notifications")
      .update({
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
      })
      .eq("user_id", session.user.id)
      .eq("id", Number(notificationId));
    if (error) throw error;

    setStoredNotifications((current) =>
      normalizeNotifications(current.filter((item) => Number(item?.id || 0) !== Number(notificationId))),
    );
    return true;
  }

  async function uploadScanFile(file, options = {}) {
    if (!session) return null;

    if (!isOnline && !options.skipQueue) {
      const nextQueue = await enqueueScanDraft(file);
      applyOfflineQueueState(nextQueue);
      pushToast("info", "เก็บไฟล์ไว้แล้ว");
      return null;
    }

    setSaving(true);
    try {
      const entry = appendScanUpload(file);
      const outcome = await runScanUpload(entry, options);
      if (!outcome.ok) {
        pushToast("error", String(outcome.error?.message || outcome.error || "scan_failed"));
        return null;
      }

      if (options.deferRefresh !== true) {
        await refreshScanDocuments();
        pushToast("success", "เพิ่มเข้า Inbox แล้ว");
      }
      return outcome.result;
    } finally {
      setSaving(false);
    }
  }

  async function uploadScanFiles(files, options = {}) {
    if (!session) return [];
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return [];

    if (!isOnline && !options.skipQueue) {
      let nextQueue = queue;
      for (const file of list) {
        nextQueue = await enqueueScanDraft(file);
      }
      applyOfflineQueueState(nextQueue);
      pushToast("info", list.length > 1 ? "เก็บไฟล์ไว้รออัปโหลดแล้ว" : "เก็บไฟล์ไว้แล้ว");
      return [];
    }

    setSaving(true);
    try {
      const results = [];
      let successCount = 0;
      const entries = appendScanUploads(list);

      for (const entry of entries) {
        const outcome = await runScanUpload(entry, options);
        results.push(outcome.ok ? outcome.result : null);
        if (outcome.ok) successCount += 1;
      }

      const failureCount = Math.max(0, list.length - successCount);

      if (successCount > 0) {
        await refreshScanDocuments();
        if (failureCount > 0) {
          pushToast("info", `เพิ่มเข้า Inbox แล้ว ${successCount} ไฟล์ เหลือ ${failureCount} ไฟล์ที่ต้องตรวจ`);
        } else {
          pushToast("success", successCount > 1 ? `เพิ่มเข้า Inbox แล้ว ${successCount} ไฟล์` : "เพิ่มเข้า Inbox แล้ว");
        }
      } else {
        pushToast("error", "สแกนไม่สำเร็จ กรุณาลองอีกครั้ง");
      }

      return results;
    } finally {
      setSaving(false);
    }
  }

  async function retryScanUpload(uploadId) {
    if (!session) return null;
    const entry = (Array.isArray(scanUploads) ? scanUploads : []).find((item) => item.id === uploadId);
    if (!entry?.file) return null;

    setSaving(true);
    try {
      const outcome = await runScanUpload(entry);
      if (outcome.ok) {
        await refreshScanDocuments();
        pushToast("success", "เพิ่มเข้า Inbox แล้ว");
        return outcome.result;
      }
      pushToast("error", String(outcome.error?.message || outcome.error || "scan_failed"));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function runLegacyMigration({ automatic = false } = {}) {
    if (!session) return;
    setMigrationState({ running: true, skipped: false, failures: [] });

    try {
      const payload = await buildLegacyMigrationPayload();
      if (!payload.snapshot) {
        setMigrationState({ running: false, skipped: true, failures: [] });
        return;
      }

      const result = await fetchWithSession(session, "/api/import/local", {
        method: "POST",
        body: JSON.stringify(payload),
        timeoutMs: IMPORT_TIMEOUT_MS,
      });

      setMigrationState({
        running: false,
        skipped: !!result.skipped,
        failures: Array.isArray(result.failures) ? result.failures : [],
      });
      await refreshAll();

      if (result.skipped) {
        if (!automatic) pushToast("info", "เคยย้ายข้อมูลชุดนี้แล้ว");
      } else if (result.failures?.length) {
        pushToast("error", "ย้ายข้อมูลแล้วแต่ยังมีไฟล์บางส่วนผิดพลาด");
      } else {
        pushToast("success", "ย้ายข้อมูลเดิมแล้ว");
      }
    } catch (error) {
      setMigrationState({
        running: false,
        skipped: false,
        failures: [{ type: "migration", message: String(error?.message || error || "migration_failed") }],
      });
      if (!automatic) pushToast("error", toFriendlyActionError(error, "ย้ายข้อมูลเดิมไม่สำเร็จ"));
    }
  }

  async function processOfflineQueue() {
    if (!session || !isOnline || offlineQueueRunningRef.current) return;

    const currentQueue = readOfflineQueue();
    if (!currentQueue.manual.length && !currentQueue.scans.length) return;

    offlineQueueRunningRef.current = true;
    let syncedCount = 0;
    try {
      // Each queued item defers its own refresh so a long queue costs one
      // refresh at the end instead of one full reload per item.
      for (const item of currentQueue.manual) {
        try {
          await createManualTransaction(item.payload, { skipQueue: true, deferRefresh: true });
          consumeOfflineQueueItem("manual", item.id);
          syncedCount += 1;
        } catch {
          break;
        }
      }

      for (const item of currentQueue.scans) {
        try {
          const blob = await readQueuedScanBlob(item);
          if (!blob) {
            consumeOfflineQueueItem("scans", item.id);
            continue;
          }
          const file = new File([blob], item.filename || "scan-upload", {
            type: item.mimeType || blob.type || "application/octet-stream",
          });
          await uploadScanFile(file, { skipQueue: true, deferRefresh: true });
          await clearQueuedScanBlob(item);
          consumeOfflineQueueItem("scans", item.id);
          syncedCount += 1;
        } catch {
          break;
        }
      }
    } finally {
      offlineQueueRunningRef.current = false;
    }

    const nextQueue = readOfflineQueue();
    writeOfflineQueue(nextQueue);
    applyOfflineQueueState(nextQueue);

    if (syncedCount > 0) {
      await refreshAll();
      pushToast("success", `ซิงก์รายการที่ค้างไว้แล้ว ${syncedCount} รายการ`);
    }
  }

  async function buildBackupPayload() {
    const [{ data: transactionRows, error: transactionError }, { data: mappingRows, error: mappingError }] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("*, transaction_line_items(*)")
          .order("date", { ascending: false })
          .limit(500),
        supabase.from("merchant_mappings").select("*"),
      ]);

    if (transactionError) throw transactionError;
    if (mappingError) throw mappingError;

    const exportedBudgetRows = normalizeBudgetRows(budgetRows).map((row) => ({
      id: row.id != null ? `budget_${row.id}` : `${row.month_key}_${row.category_id}`,
      month: row.month_key,
      categoryId: row.category_id,
      limit: row.limit_satang,
      alertPct: row.alert_pct,
      source: row.source,
      manualOverride: row.manual_override === true,
    }));
    const compatBudgetRows = buildBudgetCompatRows({
      monthKey: selectedMonth,
      budgetPlanSnapshot,
      budgetRows: [],
    });
    let localGoals = [];
    let localCreditStatements = [];
    let localSalaryPlans = [];
    try {
      const localSnapshot = loadAll({ defaultGoals: [] });
      localGoals = Array.isArray(localSnapshot?.goals) ? localSnapshot.goals : [];
      localCreditStatements = Array.isArray(localSnapshot?.creditStatements) ? localSnapshot.creditStatements : [];
      localSalaryPlans = Array.isArray(localSnapshot?.salaryPlans) ? localSnapshot.salaryPlans : [];
    } catch {
      localGoals = [];
      localCreditStatements = [];
      localSalaryPlans = [];
    }

    return {
      v: 3,
      exportedAt: new Date().toISOString(),
      profile,
      data: {
        moneyUnit: "satang",
        profile,
        categoryPreferences: categoryPreferenceRows,
        accounts,
        categories,
        goals: localGoals,
        financialGoals,
        creditStatements: localCreditStatements,
        salaryPlans: localSalaryPlans,
        debtPlans,
        inbox: scanDocuments,
        merchants: mappingRows || [],
        budgets: [...exportedBudgetRows, ...compatBudgetRows],
        transactions: transactionRows || [],
      },
    };
  }

  async function exportBackup() {
    if (!supabase || !session) return;
    setSaving(true);
    try {
      const payload = await buildBackupPayload();
      downloadJsonFile(payload, `smart-expense-backup-${selectedMonth}.json`);
      pushToast("success", "ส่งออกข้อมูลแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function exportBackupWithAttachments() {
    if (!supabase || !session) return;
    setSaving(true);
    try {
      const currentBackup = await buildBackupPayload();
      const data = getBackupData(currentBackup);
      const requestedIds = Array.from(collectAttachmentIds(data));
      const existingBlobs = await listExistingBlobs(requestedIds);
      const totalSize = existingBlobs.reduce((sum, item) => sum + Math.max(0, Number(item?.size || 0)), 0);

      if (totalSize >= LARGE_ATTACHMENT_BACKUP_BYTES) {
        const message = `รูปใบเสร็จ/สลิปมีขนาดรวมประมาณ ${formatAttachmentBytes(totalSize)} ไฟล์ Backup จะใหญ่ขึ้นและอาจใช้เวลาส่งออก ต้องการดำเนินการต่อหรือไม่?`;
        if (typeof window !== "undefined" && !window.confirm(message)) return;
      }

      const attachments = await exportBlobsAsDataUrls(existingBlobs.map((item) => item.id));
      downloadJsonFile(
        {
          v: 2,
          exportedAt: new Date().toISOString(),
          data,
          attachments,
        },
        `smart-expense-backup-with-receipts-${selectedMonth}.json`
      );

      const missingCount = Math.max(0, requestedIds.length - existingBlobs.length);
      pushToast(
        "success",
        `ส่งออก Backup พร้อมรูปใบเสร็จแล้ว (${Object.keys(attachments).length} ไฟล์${
          missingCount ? `, ไม่พบไฟล์เดิม ${missingCount} ไฟล์` : ""
        })`
      );
    } catch (error) {
      pushToast("error", `ส่งออก Backup พร้อมรูปไม่สำเร็จ: ${String(error?.message || error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function importBackupFile(file) {
    if (!file || !session) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateBackupImport(parsed);
      if (!validation.success) {
        pushToast("error", `ไฟล์สำรองไม่ถูกต้อง: ${String(validation.error || "backup_invalid").slice(0, 200)}`);
        return false;
      }

      const extras = extractBackupSupplementalData(parsed);
      const attachmentMap = normalizeAttachmentBackupMap(parsed?.attachments);
      const attachmentCount = Object.keys(attachmentMap).length;
      const attachmentSize = sumAttachmentBackupSize(attachmentMap);
      const serverAttachmentCount = Array.isArray(parsed?.attachments) ? parsed.attachments.length : 0;
      const attachmentWarnText = attachmentCount
        ? `\n\nBackup นี้มีรูปใบเสร็จ/สลิป ${attachmentCount} ไฟล์ (${formatAttachmentBytes(attachmentSize)}) และจะกู้คืนลงเครื่องนี้หลังนำเข้า`
        : serverAttachmentCount
          ? `\n\nBackup นี้มีไฟล์แนบ ${serverAttachmentCount} ไฟล์สำหรับนำเข้า`
          : "\n\nไฟล์ Backup นี้ไม่มีรูปใบเสร็จ/สลิปแนบมาด้วย เมื่อนำเข้าแล้วรูปเดิมในเครื่องนี้จะถูกล้างและไม่สามารถกู้คืนจากไฟล์นี้ได้";

      if (
        typeof window !== "undefined" &&
        !window.confirm(`การนำเข้าจะทับข้อมูลเดิมทั้งหมดในเครื่องนี้ ต้องการดำเนินการต่อหรือไม่?${attachmentWarnText}`)
      ) {
        return false;
      }

      const snapshot = {
        ...(validation.data && typeof validation.data === "object" ? validation.data : {}),
        profile: extras.profile,
        categoryPreferences: extras.categoryPreferences,
      };
      const attachments = extras.attachments;

      setSaving(true);
      await fetchWithSession(session, "/api/import/local", {
        method: "POST",
        body: JSON.stringify({ snapshot, attachments }),
        timeoutMs: IMPORT_TIMEOUT_MS,
      });
      try {
        const localSnapshot = loadAll({ defaultGoals: [] });
        const nextCreditStatements = normalizeCreditStatements(validation.data?.creditStatements || []);
        const nextSalaryPlans = normalizeSalaryPlans(validation.data?.salaryPlans || []);
        saveAll({
          ...localSnapshot,
          goals: Array.isArray(validation.data?.goals) ? validation.data.goals : [],
          creditStatements: nextCreditStatements,
          salaryPlans: nextSalaryPlans,
        });
        setCreditStatements(nextCreditStatements);
        setSalaryPlans(nextSalaryPlans);
      } catch {
        // Local goals are best-effort during cloud import.
      }
      let restoredAttachments = 0;
      if (attachmentCount) {
        await clearAllBlobs();
        const result = await importBlobsFromDataUrls(attachmentMap);
        restoredAttachments = result.imported;
      } else if (!serverAttachmentCount) {
        await clearAllBlobs();
      }
      await refreshAll();
      pushToast(
        "success",
        attachmentCount ? `นำเข้าข้อมูลแล้ว และกู้คืนรูป ${restoredAttachments} ไฟล์` : "นำเข้าข้อมูลแล้ว"
      );
      return true;
    } catch (error) {
      pushToast("error", toFriendlyActionError(error, "นำเข้าข้อมูลสำรองไม่สำเร็จ"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const plannerToday = todayDate();
  const accountsById = useMemo(
    () => new Map((Array.isArray(accounts) ? accounts : []).map((account) => [Number(account.id), account])),
    [accounts],
  );
  const plannerSummary = useMemo(
    () =>
      buildPlannerSnapshot({
        goals: financialGoals,
        debts: debtPlans,
        monthValue: selectedMonth,
        today: plannerToday,
      }),
    [debtPlans, financialGoals, plannerToday, selectedMonth],
  );
  const planningConfig = useMemo(() => normalizePlanningConfig(profile), [profile]);
  const baseBudgetPlanSnapshot = useMemo(
    () =>
      buildBudgetPlanSnapshot({
        profile,
        categories,
        debtPlans,
        budgetRows,
        transactions: planningTransactions,
        monthValue: selectedMonth,
        today: plannerToday,
      }),
    [budgetRows, categories, debtPlans, plannerToday, planningTransactions, profile, selectedMonth],
  );
  const plannerMonthlyPlan = useMemo(
    () => ({
      ...buildPlannerMonthlyPlanState({
        profile,
        categories,
        debtPlans,
        budgetRows,
        transactions: planningTransactions,
        monthValue: selectedMonth,
        today: plannerToday,
        storedPlans: plannerStorage.plans,
        storedItems: plannerStorage.items,
        legacySnapshot: baseBudgetPlanSnapshot,
      }),
      unavailable: plannerStorage.unavailable === true,
    }),
    [
      baseBudgetPlanSnapshot,
      budgetRows,
      categories,
      debtPlans,
      plannerStorage,
      plannerToday,
      planningTransactions,
      profile,
      selectedMonth,
    ],
  );
  const plannerActiveScenarioKey = useMemo(
    () => getActivePlannerScenarioKey(plannerMonthlyPlan, "baseline"),
    [plannerMonthlyPlan],
  );
  const plannerRecommendations = useMemo(() => {
    const scenarios = Array.isArray(plannerMonthlyPlan?.scenarios) ? plannerMonthlyPlan.scenarios : [];
    const activeScenario =
      scenarios.find((scenario) => scenario.id === plannerActiveScenarioKey) ||
      scenarios.find((scenario) => scenario.id === "baseline") ||
      scenarios[0] ||
      null;
    const items = Array.isArray(activeScenario?.items) ? activeScenario.items.slice() : [];
    return items.sort((left, right) => {
      const attentionDelta = Number(right?.needsAttention === true) - Number(left?.needsAttention === true);
      if (attentionDelta !== 0) return attentionDelta;
      const lockDelta = Number(right?.lockedByUser === true) - Number(left?.lockedByUser === true);
      if (lockDelta !== 0) return lockDelta;
      const deltaGap = Math.abs(Number(right?.deltaSatang || 0)) - Math.abs(Number(left?.deltaSatang || 0));
      if (deltaGap !== 0) return deltaGap;
      return String(left?.name || "").localeCompare(String(right?.name || ""), "th");
    });
  }, [plannerActiveScenarioKey, plannerMonthlyPlan]);
  const plannerDecisionSummary = useMemo(
    () => buildPlannerDecisionSummary(plannerMonthlyPlan, plannerActiveScenarioKey),
    [plannerActiveScenarioKey, plannerMonthlyPlan],
  );
  const budgetPlanSnapshot = useMemo(
    () =>
      buildBudgetPlanSnapshotCompat({
        legacySnapshot: baseBudgetPlanSnapshot,
        plannerMonthlyPlan,
        scenarioKey: plannerActiveScenarioKey,
      }),
    [baseBudgetPlanSnapshot, plannerActiveScenarioKey, plannerMonthlyPlan],
  );
  useEffect(() => {
    checkBudgetAndNotify({
      monthSpent: Number(budgetPlanSnapshot?.spentMonthSatang || 0),
      monthlyLimit: Number(
        budgetPlanSnapshot?.activeExpenseBudgetSatang || budgetPlanSnapshot?.fallbackMonthlyTargetSatang || 0,
      ),
      alertPct: Number(budgetPlanSnapshot?.alertPct || 90),
      monthKey: budgetPlanSnapshot?.monthKey || selectedMonth,
      formatCurrency,
    });
  }, [budgetPlanSnapshot, selectedMonth]);
  const plannerReminders = useMemo(
    () =>
      buildPlannerReminders({
        goals: financialGoals,
        debts: debtPlans,
        today: plannerToday,
        accountsById,
      }),
    [accountsById, debtPlans, financialGoals, plannerToday],
  );
  const recurringDueToday = useMemo(
    () => recurringRules.filter((rule) => getRecurringDueState(rule, plannerToday) === "due"),
    [plannerToday, recurringRules],
  );
  const runtimeNotifications = useMemo(
    () =>
      buildRuntimeNotifications({
        budgetPlanSnapshot,
        plannerReminders,
        recurringDueToday,
        scanDocuments,
      }),
    [budgetPlanSnapshot, plannerReminders, recurringDueToday, scanDocuments],
  );
  const notifications = useMemo(() => {
    const persisted = normalizeNotifications(storedNotifications);
    const persistedByKey = new Map(
      persisted.map((item) => [getNotificationRuntimeKey(item), item]),
    );
    const dismissedKeys = new Set(localNotificationDismissedKeys);
    const readKeys = new Set(localNotificationReadKeys);
    const merged = [];

    for (const item of persisted) {
      const key = getNotificationRuntimeKey(item);
      if (dismissedKeys.has(key)) continue;
      merged.push(readKeys.has(key) ? { ...item, is_read: true } : item);
    }

    for (const item of runtimeNotifications) {
      const key = getNotificationRuntimeKey(item);
      if (dismissedKeys.has(key) || persistedByKey.has(key)) continue;
      merged.push({
        ...item,
        id: `runtime:${key}`,
        is_read: readKeys.has(key),
        created_at: new Date().toISOString(),
      });
    }

    return normalizeNotifications(merged);
  }, [localNotificationDismissedKeys, localNotificationReadKeys, runtimeNotifications, storedNotifications]);
  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => item?.is_read !== true).length,
    [notifications],
  );
  const getBudgetHintForDraft = (draft) =>
    buildBudgetHintCompat({
      baseHint: buildBudgetHint({
        draft,
        budgetRows,
        categories,
        transactions: planningTransactions,
      }),
      plannerMonthlyPlan,
      categories,
      categoryId: draft?.categoryId ?? draft?.category_id,
      scenarioKey: plannerActiveScenarioKey,
    });

  useEffect(() => {
    if (!supabase || !session || notificationsUnavailable) return undefined;
    if (!runtimeNotifications.length) return undefined;

    const existingKeys = new Set(
      normalizeNotifications(storedNotifications).map((item) => getNotificationRuntimeKey(item)),
    );
    const missingItems = runtimeNotifications.filter((item) => !existingKeys.has(getNotificationRuntimeKey(item)));
    if (!missingItems.length) return undefined;

    let cancelled = false;

    const syncMissingNotifications = async () => {
      const rows = missingItems.map((item) => ({
        user_id: session.user.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        data: item.data,
        data_key: getNotificationDataKey(item),
        is_read: false,
        is_dismissed: false,
      }));

      const { data, error } = await supabase
        .from("notifications")
        .upsert(rows, { onConflict: "user_id,kind,data_key" })
        .select("*");
      if (cancelled) return;
      if (error) {
        if (isMissingPlannerRelationError(error, "notifications")) {
          setNotificationsUnavailable(true);
        }
        return;
      }

      setStoredNotifications((current) =>
        normalizeNotifications([
          ...current,
          ...(Array.isArray(data) ? data : []),
        ]),
      );
    };

    void syncMissingNotifications();

    return () => {
      cancelled = true;
    };
  }, [notificationsUnavailable, runtimeNotifications, session, storedNotifications, supabase]);

  const markMonthLoadedEvent = useEffectEvent(() => {
    loadedMonthRef.current = selectedMonth;
  });

  const refreshAllEvent = useEffectEvent((nextProfile = null) => {
    loadedMonthRef.current = selectedMonth;
    void refreshAll(nextProfile);
  });

  const runLegacyMigrationEvent = useEffectEvent((options = {}) => {
    void runLegacyMigration(options);
  });

  const processOfflineQueueEvent = useEffectEvent(() => {
    void processOfflineQueue();
  });

  const value = {
    authReady,
    session,
    authError,
    hasSupabaseConfig: hasSupabaseBrowserConfig(),
    bootstrapping,
    loading,
    saving,
    isOnline,
    legacyAvailable,
    profile,
    accounts,
    merchantMappings,
    categories,
    financialGoals,
    debtPlans,
    creditStatements,
    salaryPlans,
    budgetRows,
    recurringRules,
    recurringDueToday,
    scanDocuments,
    recentTransactions,
    transactionsPage,
    transactionsFilters,
    dashboardSnapshot,
    dashboardPreviousSnapshot,
    accountBalanceSnapshot,
    cashflowSeries,
    notifications,
    unreadNotificationCount,
    notificationPermission,
    notificationsSupported: notificationPermission !== "unsupported",
    plannerSummary,
    plannerReminders,
    planningConfig,
    budgetPlanSnapshot,
    plannerMonthlyPlan,
    plannerRecommendations,
    plannerActiveScenarioKey,
    plannerDecisionSummary,
    selectedMonth,
    queue,
    scanUploads,
    toast,
    migrationState,
    setSelectedMonth,
    setTransactionsFilters,
    clearToast,
    signIn,
    signUp,
    signInAnonymously,
    signOut,
    refreshAll,
    refreshPlannerState,
    saveProfile,
    savePlanningConfig,
    saveAccount,
    deleteAccount,
    adjustAccountBalance,
    saveFinancialGoal,
    deleteFinancialGoal,
    saveCreditStatement,
    saveCreditStatements,
    saveSalaryPlan,
    saveSalaryPlans,
    saveDebtPlan,
    deleteDebtPlan,
    saveCategory,
    setCategoryHidden,
    saveCategoryBudgetBehavior,
    saveBudgetRow,
    deleteBudgetRow,
    saveRecurringRule,
    deleteRecurringRule,
    toggleRecurringRule,
    runRecurringNow,
    applySuggestedBudgets,
    applyPlannerPlan,
    acceptPlannerRecommendation,
    dismissPlannerRecommendation,
    lockPlannerRecommendation,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotification,
    requestBudgetNotificationPermission: requestBudgetNotificationPermissionEvent,
    getBudgetHintForDraft,
    createManualTransaction,
    updateTransaction,
    deleteTransaction,
    refreshTransactionsPage,
    loadMoreTransactions,
    exportTransactionsCsv,
    uploadScanFile,
    uploadScanFiles,
    retryScanUpload,
    approveScanDocument,
    rejectScanDocument,
    runLegacyMigration,
    exportBackup,
    exportBackupWithAttachments,
    importBackupFile,
    scanToDraft,
  };

  const decoratedValue = decorateActionsWithErrorFeedback(value, (error, fallback) => {
    console.error("app_action_failed", error);
    pushToast("error", toFriendlyActionError(error, fallback));
  });

  return <AppContext.Provider value={decoratedValue}>{children}</AppContext.Provider>;
}

export function useExpenseApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useExpenseApp must be used within AppProvider");
  }
  return ctx;
}
