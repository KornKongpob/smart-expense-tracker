import { useDeferredValue, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Repeat2, Search, XCircle } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import CategoryPresetChooser from "../CategoryPresetChooser.jsx";
import LineItemEditorSection from "../LineItemEditorSection.jsx";
import { lineItemsFromDraft } from "../lineItemDraftState.js";
import { getScanDisplayAmountSatang } from "../transactionDrafts.js";
import { EmptyPanel, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import { formatCurrency, formatDateLong } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";

const REVIEW_KIND_OPTIONS = [
  { id: "expense", label: "รายจ่าย", icon: ArrowDownLeft },
  { id: "income", label: "รายรับ", icon: ArrowUpRight },
  { id: "transfer", label: "โอน", icon: Repeat2 },
];

function toInputAmount(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

function splitGroupsFromDraft(draft) {
  return lineItemsFromDraft(draft).filter(
    (item) => Number(item?.amountSatang || 0) > 0 || String(item?.name || "").trim(),
  );
}

export default function InboxScreen() {
  const {
    scanDocuments,
    accounts,
    categories,
    plannerReminders,
    approveScanDocument,
    rejectScanDocument,
    scanToDraft,
    saving,
  } = useExpenseApp();

  const [filter, setFilter] = useState("pending_review");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [amountInput, setAmountInput] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setAmountInput("");
      setShowMore(false);
      setShowLines(false);
      return;
    }

    const nextDraft = scanToDraft(selected);
    setDraft(nextDraft);
    setAmountInput(toInputAmount(nextDraft?.amountSatang));
    setShowMore(false);
    setShowLines(false);
  }, [scanToDraft, selected]);

  const rows = (Array.isArray(scanDocuments) ? scanDocuments : []).filter((scan) => {
    const status = String(scan?.status || "").trim().toLowerCase();
    if (filter !== "all" && status !== filter) return false;

    const haystack = [
      scan?.file_name,
      scan?.merchant_key,
      scan?.normalized_suggestion?.merchant,
      scan?.normalized_suggestion?.note,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(String(deferredSearch || "").trim().toLowerCase());
  });

  const kindCategories = (
    draft?.kind === "income" ? categories.income : draft?.kind === "transfer" ? [] : categories.expense
  ).filter((category) => category?.isHidden !== true);

  const hasAccounts = accounts.length > 0;
  const canApprove =
    Number(draft?.amountSatang || 0) > 0 &&
    (draft?.kind === "transfer"
      ? Boolean(draft?.fromAccountId && draft?.toAccountId && draft?.fromAccountId !== draft?.toAccountId)
      : Boolean(draft?.accountId));

  const splitGroups = splitGroupsFromDraft(draft);
  const splitItemCount = splitGroups.filter((item) => item.receiptLineType !== "adjustment").length;
  const splitAdjustmentCount = splitGroups.filter((item) => item.receiptLineType === "adjustment").length;

  const applyKind = (kind) => {
    const firstAccountId = accounts[0] ? String(accounts[0].id) : "";

    setDraft((current) =>
      current
        ? (() => {
            const nextLineItems = kind === "transfer" ? [] : lineItemsFromDraft(current);
            const nextDraft = {
              ...current,
              kind,
              categoryId: kind === "transfer" ? "" : current.categoryId,
              accountId:
                kind === "transfer" ? current.accountId : current.accountId || current.fromAccountId || firstAccountId,
              fromAccountId:
                kind === "transfer"
                  ? current.fromAccountId || current.accountId || firstAccountId
                  : current.fromAccountId,
              toAccountId: kind === "transfer" ? current.toAccountId : "",
              lineItems: nextLineItems,
            };

            if (Array.isArray(current?.receiptGroups)) {
              nextDraft.receiptGroups = nextLineItems;
            }

            return nextDraft;
          })()
        : current,
    );

    if (kind === "transfer") setShowLines(false);
  };

  return (
    <ScreenShell title="กล่องรับ">
      {plannerReminders.length ? (
        <section className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">เตือนจาก Planner</div>
              <div className="finance-panel-copy">รายการที่ใกล้ถึงกำหนดภายใน 7 วัน</div>
            </div>
            <StatusPill tone="warning">{plannerReminders.length} รายการ</StatusPill>
          </div>

          <div className="finance-list finance-reminder-list">
            {plannerReminders.map((reminder) => (
              <button
                key={reminder.id}
                type="button"
                className="finance-list-button"
                onClick={() => {
                  setSelected(null);
                  window.location.hash = "#planner";
                }}
              >
                <div className="finance-row finance-reminder-row">
                  <div className="finance-row-main">
                    <div>
                      <div className="finance-row-title">{reminder.title}</div>
                      <div className="finance-row-meta">
                        {reminder.copy} · {formatDateLong(reminder.due_date)}
                      </div>
                    </div>
                  </div>

                  <div className="finance-row-side">
                    <StatusPill tone={reminder.type === "debt" ? "warning" : "default"}>
                      {reminder.type === "debt" ? "หนี้" : "เป้าหมาย"}
                    </StatusPill>
                    <div className="finance-row-amount">{formatCurrency(reminder.amount_satang || 0)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="ui-card finance-panel">
        <div className="finance-toolbar">
          <label className="finance-search">
            <Search size={16} />
            <input
              className="ui-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหา"
            />
          </label>

          <div className="view-segmented finance-filter">
            {[
              { id: "pending_review", label: "รอตรวจ" },
              { id: "approved", label: "อนุมัติ" },
              { id: "all", label: "ทั้งหมด" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={["view-segmented-btn", filter === item.id ? "is-active" : ""].join(" ")}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length ? (
          <div className="finance-list">
            {rows.map((scan) => {
              const suggestion = scan?.normalized_suggestion || {};
              const amountSatang = getScanDisplayAmountSatang(scan);

              return (
                <button
                  key={scan.id}
                  type="button"
                  className="finance-list-button"
                  onClick={() => setSelected(scan)}
                >
                  <div className="finance-row">
                    <div className="finance-row-main">
                      <div>
                        <div className="finance-row-title">
                          {suggestion?.merchant || scan.file_name || "รายการสแกน"}
                        </div>
                        <div className="finance-row-meta">{formatDateLong(suggestion?.date || scan.created_at)}</div>
                      </div>
                    </div>

                    <div className="finance-row-side">
                      <StatusPill tone={scan.status === "approved" ? "success" : "warning"}>
                        {scan.status === "approved" ? "อนุมัติ" : "รอตรวจ"}
                      </StatusPill>
                      <div className="finance-row-amount">{formatCurrency(amountSatang)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyPanel title="ยังไม่มีรายการ" copy="รายการสแกนจะขึ้นที่นี่" />
        )}
      </section>

      <Sheet
        open={!!selected && !!draft}
        onClose={() => setSelected(null)}
        title={selected?.normalized_suggestion?.merchant || selected?.file_name || "ตรวจรายการ"}
        footer={
          <div className="finance-sheet-actions">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={async () => {
                if (!selected) return;
                await rejectScanDocument(selected.id);
                setSelected(null);
              }}
              disabled={saving}
            >
              <XCircle size={16} />
              ไม่ใช้
            </button>

            <button
              type="button"
              className="ui-btn ui-btn-primary"
              onClick={async () => {
                if (!selected || !draft) return;
                await approveScanDocument(selected, draft);
                setSelected(null);
              }}
              disabled={saving || !hasAccounts || !canApprove}
            >
              <CheckCircle2 size={16} />
              บันทึก
            </button>
          </div>
        }
      >
        {draft ? (
          <div className="finance-form">
            <section className="finance-form-section finance-form-section-compact">
              <div className="finance-section-label">ประเภท</div>
              <div className="finance-type-grid">
                {REVIEW_KIND_OPTIONS.map((option) => {
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
                <div className="finance-toast-copy">เพิ่มบัญชีก่อนอนุมัติรายการ</div>
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={() => {
                    setSelected(null);
                    window.location.hash = "#accounts";
                  }}
                >
                  ไปที่บัญชี
                </button>
              </div>
            ) : (
              <>
                <section className="finance-form-section">
                  <div className="finance-grid finance-grid-2">
                    <label className="finance-field">
                      <span className="ui-label">จำนวนเงิน</span>
                      <input
                        className="ui-input"
                        inputMode="decimal"
                        value={amountInput}
                        onChange={(event) => {
                          setAmountInput(event.target.value);
                          setDraft((current) => ({
                            ...current,
                            amountSatang: parseMoneyToSatang(event.target.value),
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
                  </div>

                  {draft.kind === "transfer" ? (
                    <div className="finance-grid finance-grid-2">
                      <label className="finance-field">
                        <span className="ui-label">จากบัญชี</span>
                        <select
                          className="ui-select"
                          value={draft.fromAccountId}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, fromAccountId: event.target.value }))
                          }
                        >
                          <option value="">เลือกบัญชี</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="finance-field">
                        <span className="ui-label">ไปบัญชี</span>
                        <select
                          className="ui-select"
                          value={draft.toAccountId}
                          onChange={(event) => setDraft((current) => ({ ...current, toAccountId: event.target.value }))}
                        >
                          <option value="">เลือกบัญชี</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="finance-grid finance-grid-2">
                      <label className="finance-field">
                        <span className="ui-label">บัญชี</span>
                        <select
                          className="ui-select"
                          value={draft.accountId}
                          onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value }))}
                        >
                          <option value="">เลือกบัญชี</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>

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
                      onChange={(event) => setDraft((current) => ({ ...current, merchant: event.target.value }))}
                    />
                  </label>
                </section>

                {draft.splitByCategory && draft.kind === "expense" && splitGroups.length ? (
                  <section className="finance-form-section finance-review-split-section">
                    <div className="finance-section-label">บันทึกแบบแยกรายการ</div>
                    <div className="ui-card finance-review-split-card">
                      <div className="finance-review-split-head">
                        <div>
                          <div className="finance-panel-title">ระบบจะสร้าง 1 รายการหลักและรายการย่อยตามใบเสร็จ</div>
                          <div className="finance-panel-copy">
                            {splitItemCount} รายการซื้อ
                            {splitAdjustmentCount ? ` และ ${splitAdjustmentCount} รายการปรับยอด` : ""}
                          </div>
                        </div>
                        <div className="finance-review-split-total">{formatCurrency(draft.amountSatang)}</div>
                      </div>
                      <div className="finance-review-split-list">
                        {splitGroups.map((item, index) => (
                          <div key={`${selected.id}-split-${index}`} className="finance-review-split-row">
                            <div className="finance-review-split-copy">
                              <div className="finance-row-title">{item.name || `รายการ ${index + 1}`}</div>
                              <div className="finance-row-meta">
                                {item.receiptLineType === "adjustment"
                                  ? item.adjustmentEffect === "subtract"
                                    ? "ปรับยอดลด"
                                    : "ปรับยอดเพิ่ม"
                                  : "รายการย่อย"}
                              </div>
                            </div>
                            <div className="finance-review-split-amount">
                              {item.receiptLineType === "adjustment" && item.adjustmentEffect === "subtract" ? "-" : ""}
                              {formatCurrency(item.amountSatang)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}

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
                    addTestId="review-line-add"
                    removeTestIdPrefix="review-line-remove"
                  />
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Sheet>
    </ScreenShell>
  );
}
