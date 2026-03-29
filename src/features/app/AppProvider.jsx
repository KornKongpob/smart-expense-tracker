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

function groupCategories(rows) {
  const expense = [];
  const income = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const kind = String(row?.kind || "").trim().toLowerCase();
    if (kind === "income") income.push(row);
    else expense.push(row);
  }
  return { expense, income };
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
  const [scanDocuments, setScanDocuments] = useState([]);
  const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
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
      setScanDocuments([]);
      setDashboardSnapshot(null);
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

  async function refreshAll(nextProfile = null) {
    if (!supabase || !session) return;

    startTransition(() => setLoading(true));
    try {
      const monthDate = monthToDate(selectedMonth);
      const [
        profileResult,
        categoriesResult,
        accountsResult,
        scansResult,
        snapshotResult,
        cashflowResult,
      ] = await Promise.all([
        nextProfile
          ? Promise.resolve({ data: nextProfile, error: null })
          : supabase.from("profiles").select("*").eq("user_id", session.user.id).single(),
        supabase
          .from("categories")
          .select("id, user_id, is_system, kind, name, icon, color, parent_id, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("accounts")
          .select(
            "id, legacy_id, name, type, institution_label, currency, color, icon, opening_balance_satang, credit_limit_satang, last4, last6, digits_masked, statement_day, due_day, created_at",
          )
          .order("created_at", { ascending: true }),
        supabase
          .from("scan_documents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.rpc("dashboard_snapshot", { target_month: monthDate }),
        supabase.rpc("dashboard_cashflow_series", { target_month: monthDate }),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (accountsResult.error) throw accountsResult.error;
      if (scansResult.error) throw scansResult.error;
      if (snapshotResult.error) throw snapshotResult.error;
      if (cashflowResult.error) throw cashflowResult.error;

      setProfile(profileResult.data || nextProfile || null);
      setCategories(groupCategories(categoriesResult.data || []));
      setAccounts(Array.isArray(accountsResult.data) ? accountsResult.data : []);
      setScanDocuments(Array.isArray(scansResult.data) ? scansResult.data : []);
      setDashboardSnapshot(snapshotResult.data || null);
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
      pushToast("success", "Signed in to Smart Expense");
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
      pushToast("success", "Check your email to verify your account");
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
      pushToast("success", "Signed in as guest");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    migrationAttemptedRef.current = false;
    pushToast("success", "Signed out");
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
      pushToast("success", "Profile updated");
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
      pushToast("success", payload?.id ? "Account updated" : "Account added");
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
      pushToast("info", "Saved to offline queue. It will sync automatically.");
      return;
    }

    setSaving(true);
    try {
      await saveTransactionDraft(draft, { source: "manual" });
      await refreshAll();
      pushToast("success", "Transaction saved");
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
      pushToast("success", "Scan moved out of review");
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
      pushToast("success", "Scan approved and posted");
    } finally {
      setSaving(false);
    }
  }

  async function uploadScanFile(file, options = {}) {
    if (!session) return null;

    if (!isOnline && !options.skipQueue) {
      const nextQueue = await enqueueScanDraft(file);
      setQueue(nextQueue);
      pushToast("info", "Receipt saved offline. It will upload when you are back online.");
      return null;
    }

    setSaving(true);
    try {
      const result = await uploadScanWithSession(session, accounts, file);
      await refreshAll();
      pushToast("success", "Scan added to Inbox");
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
        if (!automatic) pushToast("info", "This legacy snapshot was already imported.");
      } else if (result.failures?.length) {
        pushToast("error", "Legacy data imported with some attachment failures. Review Settings for details.");
      } else {
        pushToast("success", "Legacy local data imported successfully");
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
      pushToast("success", "Backup exported");
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
      pushToast("success", "Backup imported");
    } finally {
      setSaving(false);
    }
  }

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
    scanDocuments,
    dashboardSnapshot,
    cashflowSeries,
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
