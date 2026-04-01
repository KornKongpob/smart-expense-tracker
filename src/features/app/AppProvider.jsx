import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
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
  buildDebtPlanPayload,
  buildFinancialGoalPayload,
  buildPlannerReminders,
  buildPlannerSnapshot,
  normalizeDebtPlans,
  normalizeFinancialGoals,
} from "./plannerState.js";
import { normalizeAccountBalanceRows } from "./accountBalanceState.js";
import { getSupabaseBrowserClient, hasSupabaseBrowserConfig } from "../../lib/supabase/client.js";
import { canonicalizeCategoryId } from "../../utils/categoryIds.js";
import { normalizeMerchantKey } from "../../utils/merchantDictionary.js";

const AppContext = createContext(null);
const GUEST_DISPLAY_NAME = "Guest";

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

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
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

function sanitizeTransactionDraft(input) {
  const draft = input && typeof input === "object" ? input : {};
  const kind = String(draft.kind || draft.type || "expense").trim().toLowerCase();
  const baseKind = kind === "income" || kind === "transfer" ? kind : "expense";

  return {
    kind: baseKind,
    accountId: draft.accountId ? String(draft.accountId) : "",
    fromAccountId: draft.fromAccountId ? String(draft.fromAccountId) : "",
    toAccountId: draft.toAccountId ? String(draft.toAccountId) : "",
    categoryId: canonicalizeCategoryId(baseKind, draft.categoryId ? String(draft.categoryId) : ""),
    amountSatang: Math.max(0, toInt(draft.amountSatang ?? draft.amount, 0)),
    merchant: String(draft.merchant || "").trim(),
    note: String(draft.note || "").trim(),
    reference: String(draft.reference || draft.ref || "").trim(),
    paymentMethod: String(draft.paymentMethod || draft.payment_method || "").trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(draft.date || "").trim()) ? String(draft.date).trim() : todayDate(),
    lineItems: Array.isArray(draft.lineItems)
      ? draft.lineItems
      : Array.isArray(draft.items)
      ? draft.items
      : [],
  };
}

function normalizeLineItems(items, kind = "expense") {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const amountRaw = Number(item?.amountSatang ?? item?.amount ?? item?.total ?? 0);
      const isAdjustment =
        String(item?.receiptLineType || item?.receipt_line_type || "").trim() === "adjustment" ||
        String(item?.adjustmentType || item?.adjustment_type || "").trim() !== "" ||
        String(item?.categoryId || item?.category || "").trim() === "discount" ||
        amountRaw < 0;

      return {
        line_order: index,
        name: String(item?.name || item?.title || item?.label || (isAdjustment ? "Adjustment" : "Item")).trim(),
        category_id: canonicalizeCategoryId(kind, item?.categoryId || item?.category) || null,
        amount_satang: Math.abs(toInt(amountRaw, 0)),
        quantity:
          item?.qty != null
            ? Number(item.qty)
            : item?.quantity != null
            ? Number(item.quantity)
            : null,
        unit_price_satang:
          item?.unitPriceSatang != null
            ? toInt(item.unitPriceSatang, null)
            : item?.unit_price_satang != null
            ? toInt(item.unit_price_satang, null)
            : item?.unitPrice != null
            ? toInt(item.unitPrice, null)
            : null,
        receipt_line_type: isAdjustment ? "adjustment" : "item",
        adjustment_effect:
          String(item?.adjustmentEffect || item?.adjustment_effect || "").trim() === "subtract" || amountRaw < 0
            ? "subtract"
            : "add",
        adjustment_type: String(item?.adjustmentType || item?.adjustment_type || "").trim() || null,
        metadata: item,
      };
    })
    .filter((item) => item.name || item.amount_satang > 0);
}

function scanToDraft(scan) {
  const suggestion = scan?.normalized_suggestion && typeof scan.normalized_suggestion === "object"
    ? scan.normalized_suggestion
    : scan?.suggestion && typeof scan.suggestion === "object"
    ? scan.suggestion
    : {};

  return sanitizeTransactionDraft({
    kind: suggestion?.tx_type || "expense",
    accountId: suggestion?.account_id || scan?.matched_account_id || "",
    fromAccountId: suggestion?.from_account || "",
    toAccountId: suggestion?.to_account || "",
    categoryId: scan?.matched_category_id || suggestion?.category_key || suggestion?.category || "",
    amountSatang: suggestion?.amount ?? 0,
    merchant: suggestion?.merchant || "",
    note: suggestion?.note || "",
    reference: suggestion?.ref || "",
    paymentMethod: suggestion?.payment_method || "",
    date: suggestion?.date || todayDate(),
    lineItems: Array.isArray(suggestion?.items)
      ? suggestion.items.map((item) => ({
          name: item?.name || "",
          amountSatang: item?.total ?? item?.amount ?? 0,
          categoryId: item?.category_key || item?.category || "",
          qty: item?.qty ?? item?.quantity ?? null,
          unitPriceSatang: item?.unit_price ?? item?.unitPrice ?? null,
        }))
      : [],
  });
}

async function fetchWithSession(session, url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const json = await readJson(res);
  if (!res.ok || json?.ok === false) {
    throw new Error(String(json?.message || json?.detail || res.statusText || "request_failed"));
  }
  return json;
}

async function uploadScanWithSession(session, accounts, file) {
  const form = new FormData();
  form.append("file", file, file.name || "scan-upload");
  form.append(
    "accounts",
    JSON.stringify(
      (Array.isArray(accounts) ? accounts : []).map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        last4: account.last4,
        last6: account.last6,
        cardLast4: account.last4,
      })),
    ),
  );

  const headers = new Headers();
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const res = await fetch("/api/scan", {
    method: "POST",
    headers,
    body: form,
  });

  const json = await readJson(res);
  if (!res.ok || json?.ok === false) {
    throw new Error(String(json?.message || res.statusText || "scan_failed"));
  }
  return json;
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

export function AppProvider({ children }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [financialGoals, setFinancialGoals] = useState([]);
  const [debtPlans, setDebtPlans] = useState([]);
  const [scanDocuments, setScanDocuments] = useState([]);
  const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
  const [accountBalanceSnapshot, setAccountBalanceSnapshot] = useState([]);
  const [cashflowSeries, setCashflowSeries] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(todayMonth());
  const [toast, setToast] = useState(null);
  const [queue, setQueue] = useState(readOfflineQueue());
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  const [legacyAvailable, setLegacyAvailable] = useState(hasLegacySnapshot());
  const [migrationState, setMigrationState] = useState({ running: false, skipped: false, failures: [] });
  const migrationAttemptedRef = useRef(false);

  const supabase = hasSupabaseBrowserConfig() ? getSupabaseBrowserClient() : null;

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
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
    setQueue(readOfflineQueue());
    setLegacyAvailable(hasLegacySnapshot());
  }, [session]);

  useEffect(() => {
    if (!session || !supabase) {
      setProfile(null);
      setAccounts([]);
      setCategories({ expense: [], income: [] });
      setFinancialGoals([]);
      setDebtPlans([]);
      setScanDocuments([]);
      setDashboardSnapshot(null);
      setAccountBalanceSnapshot([]);
      setCashflowSeries([]);
      return;
    }

    let cancelled = false;

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
          pushToast("error", String(error?.message || error || "bootstrap_failed"));
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
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

  function clearToast() {
    setToast(null);
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

    const payload = {
      categoryId: String(row?.category_id || row?.categoryId || "").trim(),
      name: row?.name != null ? String(row.name || "").trim() || null : null,
      icon: row?.icon != null ? String(row.icon || "").trim() || null : null,
      color: row?.color != null ? String(row.color || "").trim() || null : null,
      hidden: row?.hidden === true,
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

  async function refreshAll(nextProfile = null) {
    if (!supabase || !session) return;

    startTransition(() => setLoading(true));
    try {
      const monthDate = monthToDate(selectedMonth);
      const [
        profileResult,
        categoriesResult,
        categoryPreferencesResult,
        accountsResult,
        goalsResult,
        debtPlansResult,
        scansResult,
        snapshotResult,
        accountBalanceResult,
        cashflowResult,
      ] = await Promise.all([
        nextProfile
          ? Promise.resolve({ data: nextProfile, error: null })
          : supabase.from("profiles").select("*").eq("user_id", session.user.id).single(),
        supabase
          .from("categories")
          .select("id, user_id, is_system, kind, name, icon, color, parent_id, sort_order")
          .order("sort_order", { ascending: true }),
        fetchCategoryPreferencesSafe(),
        supabase
          .from("accounts")
          .select(
            "id, legacy_id, name, type, institution_label, currency, color, icon, opening_balance_satang, credit_limit_satang, last4, last6, digits_masked, statement_day, due_day, created_at",
          )
          .order("created_at", { ascending: true }),
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
              "id, legacy_id, account_id, current_balance_satang, target_payment_satang, due_day, payoff_target_date, status, note, created_at",
            )
            .order("created_at", { ascending: true }),
          "debt_plans",
        ),
        supabase
          .from("scan_documents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.rpc("dashboard_snapshot", { target_month: monthDate }),
        fetchOptionalRpcRows(
          supabase.rpc("account_balance_snapshot", { target_user: session.user.id }),
          "account_balance_snapshot",
        ),
        supabase.rpc("dashboard_cashflow_series", { target_month: monthDate }),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (categoryPreferencesResult.error) throw categoryPreferencesResult.error;
      if (accountsResult.error) throw accountsResult.error;
      if (goalsResult.error) throw goalsResult.error;
      if (debtPlansResult.error) throw debtPlansResult.error;
      if (scansResult.error) throw scansResult.error;
      if (snapshotResult.error) throw snapshotResult.error;
      if (accountBalanceResult.error) throw accountBalanceResult.error;
      if (cashflowResult.error) throw cashflowResult.error;

      const nextCategories = mergeCategoryState(
        categoriesResult.data || [],
        categoryPreferencesResult.data || [],
      );
      const nextSnapshot = applyCategoryPresentationToSnapshot(snapshotResult.data || null, nextCategories);

      setProfile(profileResult.data || nextProfile || null);
      setCategories(nextCategories);
      setAccounts(Array.isArray(accountsResult.data) ? accountsResult.data : []);
      setFinancialGoals(normalizeFinancialGoals(goalsResult.data || []));
      setDebtPlans(normalizeDebtPlans(debtPlansResult.data || []));
      setScanDocuments(Array.isArray(scansResult.data) ? scansResult.data : []);
      setDashboardSnapshot(nextSnapshot);
      setAccountBalanceSnapshot(normalizeAccountBalanceRows(accountBalanceResult.data || []));
      setCashflowSeries(Array.isArray(cashflowResult.data) ? cashflowResult.data : []);
      setLegacyAvailable(hasLegacySnapshot());
      setQueue(readOfflineQueue());
    } finally {
      startTransition(() => setLoading(false));
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
      const payload = {
        display_name: String(patch?.display_name || patch?.displayName || profile?.display_name || "").trim(),
        monthly_target_satang: Math.max(
          0,
          toInt(patch?.monthly_target_satang ?? patch?.monthlyTargetSatang ?? profile?.monthly_target_satang, 0),
        ),
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("user_id", session.user.id)
        .select("*")
        .single();

      if (error) throw error;
      setProfile(data);
      await refreshAll(data);
      pushToast("success", "บันทึกโปรไฟล์แล้ว");
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
      pushToast("success", payload?.id ? "อัปเดตบัญชีแล้ว" : "เพิ่มบัญชีแล้ว");
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
    if (!supabase || !session) return;

    const goal = buildFinancialGoalPayload(payload);
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

      await refreshAll();
      pushToast("success", goal.id ? "อัปเดตเป้าหมายแล้ว" : "เพิ่มเป้าหมายแล้ว");
    } finally {
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

      await refreshAll();
      pushToast("success", "ลบเป้าหมายแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function saveDebtPlan(payload) {
    if (!supabase || !session) return;

    const plan = buildDebtPlanPayload(payload);
    setSaving(true);
    try {
      const row = {
        user_id: session.user.id,
        legacy_id: plan.legacy_id,
        account_id: plan.account_id,
        current_balance_satang: plan.current_balance_satang,
        target_payment_satang: plan.target_payment_satang,
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

      await refreshAll();
      pushToast("success", plan.id ? "อัปเดตแผนชำระแล้ว" : "เพิ่มแผนชำระแล้ว");
    } finally {
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

      await refreshAll();
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

  async function saveTransactionDraft(draft, options = {}) {
    if (!supabase || !session) return null;

    const sanitized = sanitizeTransactionDraft(draft);
    const kind = sanitized.kind;
    const lineItems = normalizeLineItems(sanitized.lineItems, kind);

    const row = {
      user_id: session.user.id,
      legacy_id: null,
      scan_document_id: options.scanDocumentId || null,
      kind,
      status: "posted",
      account_id: kind === "transfer" ? null : sanitized.accountId || null,
      from_account_id: kind === "transfer" ? sanitized.fromAccountId || null : null,
      to_account_id: kind === "transfer" ? sanitized.toAccountId || null : null,
      category_id: kind === "transfer" ? null : sanitized.categoryId || null,
      merchant: sanitized.merchant || null,
      merchant_key: normalizeMerchantKey(sanitized.merchant || ""),
      note: sanitized.note || null,
      reference: sanitized.reference || null,
      payment_method: sanitized.paymentMethod || null,
      amount_satang: sanitized.amountSatang,
      currency: "THB",
      date: sanitized.date,
      attachment_path: options.attachment?.path || null,
      attachment_name: options.attachment?.fileName || null,
      attachment_mime_type: options.attachment?.mimeType || null,
      raw: {
        source: options.source || "manual",
        lineItems: sanitized.lineItems,
      },
    };

    const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
    if (error) throw error;

    if (lineItems.length) {
      const { error: lineError } = await supabase.from("transaction_line_items").insert(
        lineItems.map((item) => ({
          transaction_id: data.id,
          user_id: session.user.id,
          ...item,
        })),
      );

      if (lineError) throw lineError;
    }

    return data;
  }

  async function createManualTransaction(draft, options = {}) {
    if (!session) return;

    if (!isOnline && !options.skipQueue) {
      const nextQueue = enqueueManualDraft(draft);
      setQueue(nextQueue);
      pushToast("info", "บันทึกออฟไลน์แล้ว");
      return;
    }

    setSaving(true);
    try {
      await saveTransactionDraft(draft, { source: "manual" });
      await refreshAll();
      pushToast("success", "บันทึกรายการแล้ว");
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
      await refreshAll();
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

      const sanitized = sanitizeTransactionDraft(draft);
      const merchantKey = normalizeMerchantKey(sanitized.merchant || "");

      const { error: scanError } = await supabase
        .from("scan_documents")
        .update({
          status: "approved",
          approved_transaction_id: transaction?.id || null,
          matched_account_id: sanitized.accountId ? Number(sanitized.accountId) : null,
          matched_category_id: sanitized.categoryId || null,
          normalized_suggestion: {
            ...(scan?.normalized_suggestion || {}),
            amount: sanitized.amountSatang,
            date: sanitized.date,
            merchant: sanitized.merchant,
            note: sanitized.note,
            category_key: sanitized.categoryId || null,
            items: sanitized.lineItems,
            payment_method: sanitized.paymentMethod || null,
          },
          merchant_key: merchantKey || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", scan.id);

      if (scanError) throw scanError;

      if (merchantKey) {
        await supabase.from("merchant_mappings").upsert(
          {
            user_id: session.user.id,
            merchant_key: merchantKey,
            canonical_merchant: sanitized.merchant || merchantKey,
            preferred_category_id: sanitized.kind === "transfer" ? null : sanitized.categoryId || null,
            preferred_account_id:
              sanitized.kind === "transfer"
                ? sanitized.fromAccountId
                  ? Number(sanitized.fromAccountId)
                  : null
                : sanitized.accountId
                ? Number(sanitized.accountId)
                : null,
            usage_count: 1,
            last_used_at: new Date().toISOString(),
            metadata: {
              source: "scan_approval",
            },
          },
          { onConflict: "user_id,merchant_key" },
        );
      }

      await refreshAll();
      pushToast("success", "บันทึกรายการแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function uploadScanFile(file, options = {}) {
    if (!session) return null;

    if (!isOnline && !options.skipQueue) {
      const nextQueue = await enqueueScanDraft(file);
      setQueue(nextQueue);
      pushToast("info", "เก็บไฟล์ไว้แล้ว");
      return null;
    }

    setSaving(true);
    try {
      const result = await uploadScanWithSession(session, accounts, file);
      await refreshAll();
      pushToast("success", "เพิ่มเข้า Inbox แล้ว");
      return result;
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
      if (!automatic) pushToast("error", String(error?.message || error || "migration_failed"));
    }
  }

  async function processOfflineQueue() {
    if (!session || !isOnline) return;

    const currentQueue = readOfflineQueue();
    if (!currentQueue.manual.length && !currentQueue.scans.length) return;

    for (const item of currentQueue.manual) {
      try {
        await createManualTransaction(item.payload, { skipQueue: true });
        consumeOfflineQueueItem("manual", item.id);
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
        await uploadScanFile(file, { skipQueue: true });
        await clearQueuedScanBlob(item);
        consumeOfflineQueueItem("scans", item.id);
      } catch {
        break;
      }
    }

    const nextQueue = readOfflineQueue();
    writeOfflineQueue(nextQueue);
    setQueue(nextQueue);
  }

  async function exportBackup() {
    if (!supabase || !session) return;
    setSaving(true);
    try {
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

      const payload = {
        v: 2,
        exportedAt: new Date().toISOString(),
        profile,
        data: {
          moneyUnit: "satang",
          accounts,
          categories,
          financialGoals,
          debtPlans,
          inbox: scanDocuments,
          merchants: mappingRows || [],
          budgets: profile?.monthly_target_satang
            ? [{ categoryId: "__TOTAL__", limit: profile.monthly_target_satang, month: selectedMonth }]
            : [],
          transactions: transactionRows || [],
        },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `smart-expense-backup-${selectedMonth}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      pushToast("success", "ส่งออกข้อมูลแล้ว");
    } finally {
      setSaving(false);
    }
  }

  async function importBackupFile(file) {
    if (!file || !session) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const snapshot = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
    const attachments = Array.isArray(parsed?.attachments) ? parsed.attachments : [];

    setSaving(true);
    try {
      await fetchWithSession(session, "/api/import/local", {
        method: "POST",
        body: JSON.stringify({ snapshot, attachments }),
      });
      await refreshAll();
      pushToast("success", "นำเข้าข้อมูลแล้ว");
    } finally {
      setSaving(false);
    }
  }

  const accountsById = new Map(
    (Array.isArray(accounts) ? accounts : []).map((account) => [Number(account.id), account]),
  );
  const plannerSummary = buildPlannerSnapshot({
    goals: financialGoals,
    debts: debtPlans,
    monthValue: selectedMonth,
    today: todayDate(),
  });
  const plannerReminders = buildPlannerReminders({
    goals: financialGoals,
    debts: debtPlans,
    today: todayDate(),
    accountsById,
  });

  const refreshAllEvent = useEffectEvent((nextProfile = null) => {
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
    categories,
    financialGoals,
    debtPlans,
    scanDocuments,
    dashboardSnapshot,
    accountBalanceSnapshot,
    cashflowSeries,
    plannerSummary,
    plannerReminders,
    selectedMonth,
    queue,
    toast,
    migrationState,
    setSelectedMonth,
    clearToast,
    signIn,
    signUp,
    signInAnonymously,
    signOut,
    refreshAll,
    saveProfile,
    saveAccount,
    adjustAccountBalance,
    saveFinancialGoal,
    deleteFinancialGoal,
    saveDebtPlan,
    deleteDebtPlan,
    saveCategory,
    setCategoryHidden,
    createManualTransaction,
    uploadScanFile,
    approveScanDocument,
    rejectScanDocument,
    runLegacyMigration,
    exportBackup,
    importBackupFile,
    scanToDraft,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useExpenseApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useExpenseApp must be used within AppProvider");
  }
  return ctx;
}
