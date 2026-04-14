import { useEffect, useRef, useState } from "react";
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
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../../utils/money.js";

const MANUAL_KIND_OPTIONS = [
  { id: "expense", label: "รายจ่าย", icon: ArrowDownLeft },
  { id: "income", label: "รายรับ", icon: ArrowUpRight },
  { id: "transfer", label: "โอน", icon: Repeat2 },
];

function defaultDraft(accounts) {
  const firstAccountId = accounts[0] ? String(accounts[0].id) : "";

  return {
    kind: "expense",
    accountId: firstAccountId,
    fromAccountId: firstAccountId,
    toAccountId: "",
    categoryId: "",
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

export default function AddScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    accounts,
    categories,
    queue,
    scanUploads,
    saving,
    isOnline,
    getBudgetHintForDraft,
    createManualTransaction,
    uploadScanFiles,
    retryScanUpload,
  } = useExpenseApp();

  const [mode, setMode] = useState("scan");
  const [draft, setDraft] = useState(defaultDraft(accounts));
  const [amountInput, setAmountInput] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const fileInputRef = useRef(null);

  const hasAccounts = accounts.length > 0;
  const queueCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const activeUploads = (Array.isArray(scanUploads) ? scanUploads : []).slice(0, 6);
  const kindCategories = (
    draft.kind === "income" ? categories.income : draft.kind === "transfer" ? [] : categories.expense
  ).filter((category) => category?.isHidden !== true);
  const budgetHint = getBudgetHintForDraft?.(draft) || null;

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

  const resetDraft = (nextAccounts = accounts) => {
    const nextDraft = defaultDraft(nextAccounts);
    setDraft(nextDraft);
    setAmountInput(toInputAmount(nextDraft.amountSatang));
    setShowMore(false);
    setShowLines(false);
  };

  const applyKind = (kind) => {
    const firstAccountId = accounts[0] ? String(accounts[0].id) : "";

    setDraft((current) => {
      const currentAccountId = normalizeAccountId(accounts, current.accountId, current.fromAccountId || firstAccountId);
      const currentFromAccountId = normalizeAccountId(accounts, current.fromAccountId, currentAccountId || firstAccountId);
      const currentToAccountId = hasAccountId(accounts, current.toAccountId) ? String(current.toAccountId) : "";
      const nextLineItems = kind === "transfer" ? [] : lineItemsFromDraft(current);
      const nextDraft = {
        ...current,
        kind,
        categoryId: kind === "transfer" ? "" : current.categoryId,
        accountId:
          kind === "transfer"
            ? currentFromAccountId || currentAccountId || firstAccountId
            : current.kind === "transfer"
              ? currentFromAccountId || currentAccountId || firstAccountId
              : currentAccountId || currentFromAccountId || firstAccountId,
        fromAccountId: currentFromAccountId || currentAccountId || firstAccountId,
        toAccountId:
          kind === "transfer" && currentToAccountId && currentToAccountId !== (currentFromAccountId || currentAccountId || firstAccountId)
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

  const canSave =
    Number(draft.amountSatang || 0) > 0 &&
    (draft.kind === "transfer"
      ? Boolean(draft.fromAccountId && draft.toAccountId && draft.fromAccountId !== draft.toAccountId)
      : Boolean(draft.accountId));

  const manualDock =
    mode === "manual" && hasAccounts ? (
      <div className="finance-sheet-actions finance-screen-dock-actions">
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
    ) : null;

  return (
    <ScreenShell
      title="เพิ่ม"
      dock={manualDock}
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
        <section className="finance-grid">
          <article className="ui-card finance-panel finance-dropzone-panel">
            <div className="finance-dropzone">
              <div className="finance-dropzone-icon">
                <FileUp size={24} />
              </div>
              <div className="finance-panel-title">สแกนใบเสร็จหรือสลิป</div>
              <div className="finance-dropzone-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  เลือกไฟล์
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
                  {queue.scans.length ? <StatusPill tone="warning">สแกนรอ {queue.scans.length}</StatusPill> : null}
                  {queue.manual.length ? <StatusPill tone="warning">ฟอร์มรอ {queue.manual.length}</StatusPill> : null}
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
          </article>
        </section>
      ) : (
        <article className="ui-card finance-panel">
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

              </>
            )}
          </div>
        </article>
      )}
    </ScreenShell>
  );
}
