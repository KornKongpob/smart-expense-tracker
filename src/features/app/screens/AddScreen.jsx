import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileUp,
  Repeat2,
  RotateCcw,
  SendHorizonal,
  WifiOff,
} from "lucide-react";

import { useExpenseNavigation } from "../navigation.js";
import { useExpenseApp } from "../AppProvider.jsx";
import AccountSheetPicker from "../AccountSheetPicker.jsx";
import CategoryPresetChooser from "../CategoryPresetChooser.jsx";
import LineItemEditorSection from "../LineItemEditorSection.jsx";
import { lineItemsFromDraft } from "../lineItemDraftState.js";
import { ScreenShell, StatusPill, useKeyboardViewportState } from "../ui.jsx";
import { formatCurrency, getCurrentLocalTimeHHmm, toISODate } from "../../../utils/format.js";
import { normalizeMerchantKey } from "../../../utils/merchantDictionary.js";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../../utils/money.js";

const MANUAL_KIND_OPTIONS = [
  { id: "expense", label: "รายจ่าย", icon: ArrowDownLeft },
  { id: "income", label: "รายรับ", icon: ArrowUpRight },
  { id: "transfer", label: "โอน", icon: Repeat2 },
];

const SCAN_FLOW_STEPS = [
  {
    title: "เลือกภาพหรือ PDF",
    copy: "อัปโหลดได้หลายไฟล์ในครั้งเดียวเพื่อคิวงานต่อเนื่อง",
  },
  {
    title: "ตรวจต่อใน Inbox",
    copy: "เช็กชื่อร้าน หมวด และยอดที่ระบบอ่านได้ก่อนบันทึก",
  },
  {
    title: "สรุปเข้าบัญชีทันที",
    copy: "ยืนยันแล้วรายการจะไปโผล่บนภาพรวมและแผนการเงินต่อทันที",
  },
];

function getKindCategories(categories, kind) {
  if (kind === "income") {
    return Array.isArray(categories?.income) ? categories.income.filter((category) => category?.isHidden !== true) : [];
  }
  if (kind === "transfer") return [];
  return Array.isArray(categories?.expense) ? categories.expense.filter((category) => category?.isHidden !== true) : [];
}

function defaultDraft(accounts, latestDefaultsByKind = {}) {
  const firstAccountId = accounts[0] ? String(accounts[0].id) : "";
  const expenseDefaults = latestDefaultsByKind?.expense || {};
  const defaultAccountId = String(expenseDefaults.accountId || "").trim() || firstAccountId;

  return {
    kind: "expense",
    accountId: defaultAccountId,
    fromAccountId: defaultAccountId,
    toAccountId: "",
    categoryId: String(expenseDefaults.categoryId || "").trim(),
    amountSatang: 0,
    merchant: "",
    note: "",
    reference: "",
    paymentMethod: "",
    date: toISODate(new Date()),
    time: getCurrentLocalTimeHHmm(),
    lineItems: [],
  };
}

function toInputAmount(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

function getUploadTone(stage) {
  if (stage === "done") return "success";
  if (stage === "error") return "danger";
  return "warning";
}

function hasAccountId(accounts, value) {
  const target = String(value || "").trim();
  if (!target) return false;
  return (Array.isArray(accounts) ? accounts : []).some((account) => String(account?.id || "") === target);
}

function normalizeAccountId(accounts, value, fallback = "") {
  const target = String(value || "").trim();
  if (target && hasAccountId(accounts, target)) return target;
  const safeFallback = String(fallback || "").trim();
  if (safeFallback && hasAccountId(accounts, safeFallback)) return safeFallback;
  return accounts[0] ? String(accounts[0].id) : "";
}

function buildLatestDefaultsByKind(recentTransactions, accounts) {
  const defaults = {
    expense: null,
    income: null,
    transfer: null,
  };

  for (const transaction of Array.isArray(recentTransactions) ? recentTransactions : []) {
    const kind = String(transaction?.kind || "").trim().toLowerCase();
    if (!(kind in defaults) || defaults[kind]) continue;

    if (kind === "transfer") {
      const fromAccountId = normalizeAccountId(accounts, transaction?.from_account_id, transaction?.account_id);
      const toAccountId = hasAccountId(accounts, transaction?.to_account_id) ? String(transaction.to_account_id) : "";
      defaults.transfer = {
        fromAccountId,
        toAccountId: toAccountId && toAccountId !== fromAccountId ? toAccountId : "",
      };
      continue;
    }

    defaults[kind] = {
      accountId: normalizeAccountId(accounts, transaction?.account_id),
      categoryId: String(transaction?.category_id || "").trim(),
    };
  }

  return defaults;
}

function buildMerchantSuggestions({ merchantMappings, recentTransactions, kind, query }) {
  const normalizedQuery = normalizeMerchantKey(query);
  if (!normalizedQuery) return [];

  const suggestionsByKey = new Map();

  const upsertSuggestion = (entry) => {
    const key = String(entry?.key || "").trim();
    if (!key) return;

    const existing = suggestionsByKey.get(key);
    if (!existing || Number(entry.score || 0) > Number(existing.score || 0)) {
      suggestionsByKey.set(key, entry);
    }
  };

  for (const mapping of Array.isArray(merchantMappings) ? merchantMappings : []) {
    const mappingKind = String(mapping?.metadata?.kind || "").trim().toLowerCase();
    if (mappingKind && mappingKind !== String(kind || "").trim().toLowerCase()) continue;
    const merchant = String(mapping?.canonical_merchant || mapping?.merchant_key || "").trim();
    const key = normalizeMerchantKey(merchant);
    if (!key || !key.includes(normalizedQuery)) continue;
    upsertSuggestion({
      key,
      merchant,
      accountId: mapping?.preferred_account_id ? String(mapping.preferred_account_id) : "",
      categoryId: String(mapping?.preferred_category_id || "").trim(),
      fromAccountId: "",
      toAccountId: "",
      score: 1000 + Number(mapping?.usage_count || 0),
    });
  }

  (Array.isArray(recentTransactions) ? recentTransactions : []).forEach((transaction, index) => {
    const transactionKind = String(transaction?.kind || "").trim().toLowerCase();
    if (transactionKind !== String(kind || "").trim().toLowerCase()) return;

    const merchant = String(transaction?.merchant || "").trim();
    const key = normalizeMerchantKey(merchant);
    if (!key || !key.includes(normalizedQuery)) return;

    upsertSuggestion({
      key,
      merchant,
      accountId: transaction?.account_id ? String(transaction.account_id) : "",
      categoryId: String(transaction?.category_id || "").trim(),
      fromAccountId: transaction?.from_account_id ? String(transaction.from_account_id) : "",
      toAccountId: transaction?.to_account_id ? String(transaction.to_account_id) : "",
      score: 600 - index,
    });
  });

  return Array.from(suggestionsByKey.values())
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0) || left.merchant.localeCompare(right.merchant, "th"))
    .slice(0, 6);
}

export default function AddScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    accounts,
    categories,
    merchantMappings,
    queue,
    recentTransactions,
    scanUploads,
    saving,
    isOnline,
    getBudgetHintForDraft,
    createManualTransaction,
    uploadScanFiles,
    retryScanUpload,
  } = useExpenseApp();

  const latestDefaultsByKind = useMemo(
    () => buildLatestDefaultsByKind(recentTransactions, accounts),
    [accounts, recentTransactions],
  );
  const [mode, setMode] = useState("scan");
  const [draft, setDraft] = useState(defaultDraft(accounts));
  const [amountInput, setAmountInput] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const fileInputRef = useRef(null);

  const hasAccounts = accounts.length > 0;
  const accountNameById = useMemo(
    () => new Map((Array.isArray(accounts) ? accounts : []).map((account) => [String(account?.id || ""), account?.name || ""])),
    [accounts],
  );
  const categoryNameById = useMemo(
    () =>
      new Map(
        [...getKindCategories(categories, "expense"), ...getKindCategories(categories, "income")].map((category) => [
          String(category?.id || ""),
          category?.name || "",
        ]),
      ),
    [categories],
  );
  const queuedScanCount = Number(queue.scans.length || 0);
  const queuedManualCount = Number(queue.manual.length || 0);
  const queueCount = queuedScanCount + queuedManualCount;
  const activeUploads = (Array.isArray(scanUploads) ? scanUploads : []).slice(0, 6);
  const canOpenInbox = queuedScanCount > 0 || activeUploads.some((upload) => upload.stage === "done");
  const kindCategories = getKindCategories(categories, draft.kind);
  const merchantSuggestions = useMemo(
    () =>
      buildMerchantSuggestions({
        merchantMappings,
        recentTransactions,
        kind: draft.kind,
        query: draft.merchant,
      }),
    [draft.kind, draft.merchant, merchantMappings, recentTransactions],
  );
  const budgetHint = getBudgetHintForDraft?.(draft) || null;
  const plannerHint = budgetHint?.planner || null;
  const plannerConfidencePct = Math.max(0, Math.min(100, Math.round(Number(plannerHint?.confidenceScore || 0) * 100)));

  useKeyboardViewportState(mode === "manual" && hasAccounts);

  useEffect(() => {
    setDraft((current) => {
      if (!accounts.length) {
        if (!current.accountId && !current.fromAccountId && !current.toAccountId) return current;
        return {
          ...current,
          accountId: "",
          fromAccountId: "",
          toAccountId: "",
        };
      }

      const nextAccountId = normalizeAccountId(accounts, current.accountId, current.fromAccountId);
      const nextFromAccountId = normalizeAccountId(accounts, current.fromAccountId, nextAccountId);
      const nextToAccountId = hasAccountId(accounts, current.toAccountId) && String(current.toAccountId || "") !== nextFromAccountId
        ? String(current.toAccountId)
        : "";

      if (
        nextAccountId === String(current.accountId || "") &&
        nextFromAccountId === String(current.fromAccountId || "") &&
        nextToAccountId === String(current.toAccountId || "")
      ) {
        return current;
      }

      return {
        ...current,
        accountId: nextAccountId,
        fromAccountId: nextFromAccountId,
        toAccountId: current.kind === "transfer" ? nextToAccountId : "",
      };
    });
  }, [accounts]);

  useEffect(() => {
    setDraft((current) => {
      const isPristine =
        Number(current.amountSatang || 0) <= 0 &&
        !String(current.merchant || "").trim() &&
        !String(current.note || "").trim() &&
        !String(current.reference || "").trim() &&
        !String(current.paymentMethod || "").trim();
      if (!isPristine) return current;

      const defaults = latestDefaultsByKind?.[current.kind] || null;
      if (!defaults) return current;

      if (current.kind === "transfer") {
        const nextFromAccountId = normalizeAccountId(accounts, defaults.fromAccountId, current.fromAccountId || current.accountId);
        const nextToAccountId =
          hasAccountId(accounts, defaults.toAccountId) && String(defaults.toAccountId || "") !== String(nextFromAccountId || "")
            ? String(defaults.toAccountId)
            : current.toAccountId;
        if (
          nextFromAccountId === String(current.fromAccountId || "") &&
          nextToAccountId === String(current.toAccountId || "")
        ) {
          return current;
        }
        return {
          ...current,
          accountId: nextFromAccountId || current.accountId,
          fromAccountId: nextFromAccountId,
          toAccountId: nextToAccountId,
        };
      }

      const nextAccountId = normalizeAccountId(accounts, defaults.accountId, current.accountId);
      const nextCategoryId = String(defaults.categoryId || "").trim() || current.categoryId;
      if (nextAccountId === String(current.accountId || "") && nextCategoryId === String(current.categoryId || "")) {
        return current;
      }

      return {
        ...current,
        accountId: nextAccountId,
        fromAccountId: nextAccountId,
        categoryId: nextCategoryId,
      };
    });
  }, [accounts, latestDefaultsByKind]);

  const resetDraft = (nextAccounts = accounts) => {
    const nextDraft = defaultDraft(nextAccounts, latestDefaultsByKind);
    setDraft(nextDraft);
    setAmountInput(toInputAmount(nextDraft.amountSatang));
    setShowMore(false);
    setShowLines(false);
  };

  const applyKind = (kind) => {
    const kindDefaults = latestDefaultsByKind?.[kind] || {};
    const firstAccountId = accounts[0] ? String(accounts[0].id) : "";

    setDraft((current) => {
      const currentAccountId = normalizeAccountId(accounts, current.accountId, current.fromAccountId || firstAccountId);
      const currentFromAccountId = normalizeAccountId(accounts, current.fromAccountId, currentAccountId || firstAccountId);
      const currentToAccountId = hasAccountId(accounts, current.toAccountId) ? String(current.toAccountId) : "";
      const nextLineItems = kind === "transfer" ? [] : lineItemsFromDraft(current);
      const defaultCategoryId = String(kindDefaults.categoryId || "").trim();
      const defaultAccountId = normalizeAccountId(accounts, kindDefaults.accountId, currentAccountId || currentFromAccountId || firstAccountId);
      const defaultFromAccountId = normalizeAccountId(accounts, kindDefaults.fromAccountId, currentFromAccountId || currentAccountId || firstAccountId);
      const defaultToAccountId = hasAccountId(accounts, kindDefaults.toAccountId) ? String(kindDefaults.toAccountId) : "";
      const nextDraft = {
        ...current,
        kind,
        categoryId:
          kind === "transfer"
            ? ""
            : defaultCategoryId || current.categoryId,
        accountId:
          kind === "transfer"
            ? defaultFromAccountId || currentFromAccountId || currentAccountId || firstAccountId
            : current.kind === "transfer"
              ? defaultAccountId || currentFromAccountId || currentAccountId || firstAccountId
              : defaultAccountId || currentAccountId || currentFromAccountId || firstAccountId,
        fromAccountId: defaultFromAccountId || currentFromAccountId || currentAccountId || firstAccountId,
        toAccountId:
          kind === "transfer" && defaultToAccountId && defaultToAccountId !== (defaultFromAccountId || currentFromAccountId || currentAccountId || firstAccountId)
            ? defaultToAccountId
            : kind === "transfer" && currentToAccountId && currentToAccountId !== (defaultFromAccountId || currentFromAccountId || currentAccountId || firstAccountId)
            ? currentToAccountId
            : "",
        lineItems: nextLineItems,
      };

      if (Array.isArray(current?.receiptGroups)) {
        nextDraft.receiptGroups = nextLineItems;
      }

      return nextDraft;
    });

    if (kind === "transfer") setShowLines(false);
  };

  const applySingleAccountSelection = (nextAccountId) => {
    setDraft((current) => {
      const resolvedAccountId = normalizeAccountId(
        accounts,
        nextAccountId,
        current.accountId || current.fromAccountId,
      );

      return {
        ...current,
        accountId: resolvedAccountId,
        fromAccountId: resolvedAccountId,
      };
    });
  };

  const applyTransferFromAccountSelection = (nextFromAccountId) => {
    setDraft((current) => {
      const resolvedFromAccountId = normalizeAccountId(
        accounts,
        nextFromAccountId,
        current.fromAccountId || current.accountId,
      );

      return {
        ...current,
        accountId: resolvedFromAccountId || current.accountId,
        fromAccountId: resolvedFromAccountId,
        toAccountId:
          String(current.toAccountId || "") === String(resolvedFromAccountId || "")
            ? ""
            : current.toAccountId,
      };
    });
  };

  const applyTransferToAccountSelection = (nextToAccountId) => {
    setDraft((current) => {
      if (String(nextToAccountId || "") === String(current.fromAccountId || "")) return current;

      return {
        ...current,
        toAccountId: nextToAccountId,
      };
    });
  };

  const applyMerchantSuggestion = (suggestion) => {
    setDraft((current) => {
      if (current.kind === "transfer") {
        const nextFromAccountId = normalizeAccountId(
          accounts,
          suggestion?.fromAccountId,
          current.fromAccountId || current.accountId,
        );
        const nextToAccountId =
          hasAccountId(accounts, suggestion?.toAccountId) && String(suggestion?.toAccountId || "") !== String(nextFromAccountId || "")
            ? String(suggestion.toAccountId)
            : current.toAccountId;

        return {
          ...current,
          merchant: suggestion?.merchant || current.merchant,
          fromAccountId: nextFromAccountId,
          accountId: nextFromAccountId || current.accountId,
          toAccountId: nextToAccountId,
        };
      }

      const nextAccountId = normalizeAccountId(
        accounts,
        suggestion?.accountId,
        current.accountId || latestDefaultsByKind?.[current.kind]?.accountId,
      );
      return {
        ...current,
        merchant: suggestion?.merchant || current.merchant,
        accountId: nextAccountId,
        fromAccountId: nextAccountId,
        categoryId: String(suggestion?.categoryId || "").trim() || current.categoryId,
      };
    });
  };

  const canSave =
    Number(draft.amountSatang || 0) > 0 &&
    (draft.kind === "transfer"
      ? Boolean(draft.fromAccountId && draft.toAccountId && draft.fromAccountId !== draft.toAccountId)
      : Boolean(draft.accountId));

  const manualConfirmationBar =
    mode === "manual" && hasAccounts ? (
      <div className="finance-manual-confirmation-bar" data-testid="manual-confirmation-bar">
        <div className="finance-manual-confirmation-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => resetDraft()}>
            <RotateCcw size={16} />
            ล้าง
          </button>

          <button
            type="button"
            className="ui-btn ui-btn-primary"
            disabled={saving || !canSave}
            data-testid="manual-save"
            onClick={async () => {
              await createManualTransaction(draft);
              resetDraft();
              setMode("scan");
            }}
          >
            <SendHorizonal size={16} />
            บันทึก
          </button>
        </div>
      </div>
    ) : null;

  return (
    <ScreenShell
      title="เพิ่ม"
      actions={
        !isOnline ? (
          <StatusPill tone="warning">
            <WifiOff size={14} />
            ออฟไลน์
          </StatusPill>
        ) : null
      }
    >
      <div className="view-segmented finance-segmented-wide">
        <button
          type="button"
          className={["view-segmented-btn", mode === "scan" ? "is-active" : ""].join(" ")}
          onClick={() => setMode("scan")}
        >
          สแกน
        </button>
        <button
          type="button"
          className={["view-segmented-btn", mode === "manual" ? "is-active" : ""].join(" ")}
          onClick={() => setMode("manual")}
          data-testid="add-mode-manual"
        >
          กรอกเอง
        </button>
      </div>

      {mode === "scan" ? (
        <section className="finance-grid finance-add-scan-grid">
          <article className="ui-card finance-panel finance-dropzone-panel">
            <div className="finance-dropzone">
              <div className="finance-dropzone-main">
                <div className="finance-dropzone-header">
                  <div className="finance-dropzone-icon">
                    <FileUp size={24} />
                  </div>
                  <div className="finance-dropzone-copy-block">
                    <div className="finance-panel-title">สแกนใบเสร็จหรือสลิป</div>
                    <div className="finance-panel-copy finance-dropzone-copy">
                      อัปโหลดภาพหรือ PDF แล้วระบบจะส่งไปที่ Inbox เพื่อให้คุณตรวจยอดและหมวดอีกครั้งก่อนบันทึก
                    </div>
                  </div>
                </div>

                <div className="finance-dropzone-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                  >
                    เลือกไฟล์
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary"
                    onClick={() => setMode("manual")}
                    disabled={saving}
                  >
                    กรอกเองตอนนี้
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    multiple
                    accept="image/*,application/pdf"
                    onChange={async (event) => {
                      const files = Array.from(event.target.files || []);
                      if (!files.length) return;
                      await uploadScanFiles(files);
                      event.target.value = "";
                    }}
                  />
                </div>

                {queueCount ? (
                  <div className="finance-chip-grid">
                    {queuedScanCount ? <StatusPill tone="warning">สแกนรอ {queuedScanCount}</StatusPill> : null}
                    {queuedManualCount ? <StatusPill tone="warning">ฟอร์มรอ {queuedManualCount}</StatusPill> : null}
                  </div>
                ) : null}

                {activeUploads.length ? (
                  <div className="finance-upload-list">
                    {activeUploads.map((upload) => (
                      <div key={upload.id} className="finance-upload-row">
                        <div className="finance-upload-copy">
                          <div className="finance-upload-title">{upload.fileName}</div>
                          <div className="finance-upload-meta">{upload.detailText || upload.label}</div>
                        </div>

                        <div className="finance-upload-side">
                          <StatusPill tone={getUploadTone(upload.stage)}>
                            {upload.badgeText || `${upload.progress}%`}
                          </StatusPill>
                          <div className="finance-upload-progress" aria-hidden="true">
                            <span style={{ width: `${upload.progress}%` }} />
                          </div>
                          {upload.stage === "error" ? (
                            <button
                              type="button"
                              className="ui-btn ui-btn-secondary finance-upload-action"
                              onClick={() => retryScanUpload(upload.id)}
                              disabled={saving}
                            >
                              ลองอีกครั้ง
                            </button>
                          ) : null}
                          {upload.stage === "done" ? (
                            <button
                              type="button"
                              className="ui-btn ui-btn-secondary finance-upload-action"
                              onClick={() => navigateToView("inbox")}
                            >
                              เปิด Inbox
                            </button>
                          ) : null}
                          {upload.error ? <div className="finance-upload-error">{upload.error}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {!activeUploads.length ? (
                <div className="finance-dropzone-foot">
                  <ol className="finance-dropzone-steps" aria-label="ขั้นตอนถัดไปหลังอัปโหลด">
                    {SCAN_FLOW_STEPS.map((step, index) => (
                      <li key={step.title} className="finance-dropzone-step">
                        <span className="finance-dropzone-step-index" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span className="finance-dropzone-step-copy">
                          <span className="finance-dropzone-step-title">{step.title}</span>
                          <span className="finance-dropzone-step-detail">{step.copy}</span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  <div className="ui-toast ui-toast--info finance-inline-note finance-dropzone-note">
                    <div className="finance-toast-copy">
                      {canOpenInbox
                        ? "มีรายการสแกนพร้อมตรวจต่อแล้ว เปิด Inbox เพื่อตรวจความถูกต้องก่อนบันทึก"
                        : "รูปที่เห็นยอดเต็มใบจะอ่านได้แม่นขึ้น และถ้ายังไม่มีเอกสารตอนนี้ก็สลับไปกรอกเองได้ทันที"}
                    </div>
                    {canOpenInbox ? (
                      <button
                        type="button"
                        className="ui-btn ui-btn-secondary"
                        onClick={() => navigateToView("inbox")}
                      >
                        เปิด Inbox
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        </section>
      ) : (
        <article className="ui-card finance-panel finance-manual-panel">
          <div className="finance-form">
            <section className="finance-form-section finance-form-section-compact">
              <div className="finance-section-label">ประเภท</div>
              <div className="finance-type-grid">
                {MANUAL_KIND_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = draft.kind === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={["finance-type-chip", active ? "is-active" : ""].join(" ")}
                      onClick={() => applyKind(option.id)}
                    >
                      <span className="finance-type-chip-icon">
                        <Icon size={16} />
                      </span>
                      <span className="finance-type-chip-label">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {!hasAccounts ? (
              <div className="ui-toast ui-toast--info finance-inline-note">
                <div className="finance-toast-copy">เพิ่มบัญชีก่อนบันทึกรายการ</div>
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={() => navigateToView("accounts")}
                >
                  ไปที่บัญชี
                </button>
              </div>
            ) : (
              <>
                <section className="finance-form-section">
                  <div className="finance-grid finance-grid-3">
                    <label className="finance-field">
                      <span className="ui-label">จำนวนเงิน</span>
                      <input
                        className="ui-input"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amountInput}
                        data-testid="manual-amount-input"
                        onChange={(event) => {
                          const nextValue = sanitizeMoneyInput(event.target.value);
                          setAmountInput(nextValue);
                          setDraft((current) => ({
                            ...current,
                            amountSatang: parseMoneyToSatang(nextValue),
                          }));
                        }}
                      />
                    </label>

                    <label className="finance-field">
                      <span className="ui-label">วันที่</span>
                      <input
                        className="ui-input"
                        type="date"
                        value={draft.date}
                        onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                      />
                    </label>

                    <label className="finance-field">
                      <span className="ui-label">เวลา</span>
                      <input
                        className="ui-input"
                        type="time"
                        value={draft.time || ""}
                        onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
                      />
                    </label>
                  </div>

                  {draft.kind === "transfer" ? (
                    <div className="finance-grid finance-grid-2">
                      <div className="finance-field">
                        <span className="ui-label">จากบัญชี</span>
                        <AccountSheetPicker
                          accounts={accounts}
                          value={draft.fromAccountId}
                          onChange={applyTransferFromAccountSelection}
                          title="เลือกบัญชีต้นทาง"
                          placeholder="เลือกบัญชีต้นทาง"
                          testId="manual-from-account-picker"
                          optionTestIdPrefix="manual-from-account-option"
                        />
                      </div>

                      <div className="finance-field">
                        <span className="ui-label">ไปบัญชี</span>
                        <AccountSheetPicker
                          accounts={accounts}
                          value={draft.toAccountId}
                          onChange={applyTransferToAccountSelection}
                          title="เลือกบัญชีปลายทาง"
                          placeholder="เลือกบัญชีปลายทาง"
                          testId="manual-to-account-picker"
                          optionTestIdPrefix="manual-to-account-option"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="finance-grid finance-grid-2">
                      <div className="finance-field">
                        <span className="ui-label">บัญชี</span>
                        <AccountSheetPicker
                          accounts={accounts}
                          value={draft.accountId}
                          onChange={applySingleAccountSelection}
                          title="เลือกบัญชี"
                          placeholder="เลือกบัญชี"
                          testId="manual-account-select"
                          optionTestIdPrefix="manual-account-option"
                        />
                      </div>

                      <CategoryPresetChooser
                        categories={kindCategories}
                        value={draft.categoryId}
                        onChange={(categoryId) => setDraft((current) => ({ ...current, categoryId }))}
                      />
                    </div>
                  )}

                  <label className="finance-field">
                    <span className="ui-label">รายการ</span>
                    <input
                      className="ui-input"
                      value={draft.merchant}
                      data-testid="manual-merchant-input"
                      onChange={(event) => setDraft((current) => ({ ...current, merchant: event.target.value }))}
                      placeholder="เช่น ค่าอาหาร"
                    />
                    {merchantSuggestions.length ? (
                      <div className="finance-merchant-suggestions">
                        {merchantSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.key}
                            type="button"
                            className="finance-merchant-suggestion"
                            onClick={() => applyMerchantSuggestion(suggestion)}
                          >
                            <span className="finance-row-title">{suggestion.merchant}</span>
                            {suggestion.categoryId || suggestion.accountId || suggestion.fromAccountId ? (
                              <span className="finance-row-meta finance-row-meta-wrap">
                                {suggestion.categoryId ? `หมวด ${categoryNameById.get(String(suggestion.categoryId)) || suggestion.categoryId}` : ""}
                                {suggestion.accountId ? `${suggestion.categoryId ? " · " : ""}บัญชี ${accountNameById.get(String(suggestion.accountId)) || suggestion.accountId}` : ""}
                                {suggestion.fromAccountId && !suggestion.accountId ? `บัญชี ${accountNameById.get(String(suggestion.fromAccountId)) || suggestion.fromAccountId}` : ""}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </label>

                  {budgetHint ? (
                    <div
                      className={`ui-toast finance-inline-note ${
                        budgetHint.status === "over"
                          ? "ui-toast--error"
                          : budgetHint.status === "warning"
                            ? "ui-toast--warning"
                            : "ui-toast--info"
                      }`}
                    >
                      <div className="finance-toast-copy">
                        {budgetHint.scope === "child" ? "งบหมวดย่อย" : "งบหมวดหลัก"} {formatCurrency(budgetHint.plannedLimitSatang)} · ใช้ไปแล้ว {formatCurrency(budgetHint.spentSatang)} · หลังบันทึกจะเป็น {formatCurrency(budgetHint.projectedSatang)}
                        {budgetHint.status === "over" ? ` · เกิน ${formatCurrency(budgetHint.overBySatang)}` : ""}
                        {budgetHint.status === "warning" ? ` · ใกล้แตะเตือน ${budgetHint.alertPct}%` : ""}
                      </div>
                      {plannerHint ? (
                        <div className="finance-budget-hint-planner">
                          <div className="finance-chip-grid">
                            <StatusPill tone={plannerHint.needsAttention ? "warning" : "default"}>
                              {plannerHint.needsAttention ? "Planner จับตาหมวดนี้" : "Planner ตรวจแล้ว"}
                            </StatusPill>
                            <StatusPill tone="default">confidence {plannerConfidencePct}%</StatusPill>
                            {plannerHint.lockedByUser ? <StatusPill tone="warning">manual lock</StatusPill> : null}
                          </div>
                          <div className="finance-toast-copy">
                            Planner แนะนำกรอบ {formatCurrency(plannerHint.recommendedLimitSatang)} · delta {plannerHint.deltaSatang > 0 ? "+" : ""}{formatCurrency(Math.abs(plannerHint.deltaSatang || 0))}
                            {Array.isArray(plannerHint.reasonLabels) && plannerHint.reasonLabels.length
                              ? ` · ${plannerHint.reasonLabels.join(" · ")}`
                              : ""}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <details className="finance-details" open={showMore}>
                  <summary
                    className="finance-details-summary bento-summary"
                    onClick={(event) => {
                      event.preventDefault();
                      setShowMore((current) => !current);
                    }}
                  >
                    <span>รายละเอียดเพิ่ม</span>
                    <span className="finance-details-caret">{showMore ? "ซ่อน" : "แสดง"}</span>
                  </summary>

                  {showMore ? (
                    <div className="finance-details-body">
                      <div className="finance-grid finance-grid-2">
                        <label className="finance-field">
                          <span className="ui-label">อ้างอิง</span>
                          <input
                            className="ui-input"
                            value={draft.reference}
                            onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
                          />
                        </label>

                        <label className="finance-field">
                          <span className="ui-label">วิธีจ่าย</span>
                          <input
                            className="ui-input"
                            value={draft.paymentMethod}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, paymentMethod: event.target.value }))
                            }
                          />
                        </label>
                      </div>

                      <label className="finance-field">
                        <span className="ui-label">บันทึกเพิ่ม</span>
                        <textarea
                          className="ui-input finance-textarea"
                          value={draft.note}
                          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                        />
                      </label>
                    </div>
                  ) : null}
                </details>

                {draft.kind !== "transfer" ? (
                  <LineItemEditorSection
                    draft={draft}
                    categories={kindCategories}
                    open={showLines}
                    onToggle={() => setShowLines((current) => !current)}
                    onDraftChange={setDraft}
                    addTestId="manual-line-add"
                    removeTestIdPrefix="manual-line-remove"
                  />
                ) : null}

                {manualConfirmationBar}
              </>
            )}
          </div>
        </article>
      )}
    </ScreenShell>
  );
}
