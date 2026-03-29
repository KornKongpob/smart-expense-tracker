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

import { useExpenseApp } from "../AppProvider.jsx";
import { ScreenShell, StatusPill } from "../ui.jsx";
import { formatCurrency } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";

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
    date: new Date().toISOString().slice(0, 10),
    lineItems: [],
  };
}

function lineItemsFromDraft(draft) {
  return Array.isArray(draft?.lineItems) ? draft.lineItems : [];
}

function toInputAmount(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

export default function AddScreen() {
  const {
    accounts,
    categories,
    queue,
    saving,
    isOnline,
    createManualTransaction,
    uploadScanFile,
  } = useExpenseApp();

  const [mode, setMode] = useState("scan");
  const [draft, setDraft] = useState(defaultDraft(accounts));
  const [amountInput, setAmountInput] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const fileInputRef = useRef(null);

  const hasAccounts = accounts.length > 0;
  const queueCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const kindCategories =
    draft.kind === "income" ? categories.income : draft.kind === "transfer" ? [] : categories.expense;

  useEffect(() => {
    setDraft((current) =>
      current.accountId || !accounts.length
        ? current
        : {
            ...current,
            accountId: String(accounts[0].id),
            fromAccountId: String(accounts[0].id),
          },
    );
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

    setDraft((current) => ({
      ...current,
      kind,
      categoryId: kind === "transfer" ? "" : current.categoryId,
      accountId: kind === "transfer" ? current.accountId : current.accountId || current.fromAccountId || firstAccountId,
      fromAccountId:
        kind === "transfer" ? current.fromAccountId || current.accountId || firstAccountId : current.fromAccountId,
      toAccountId: kind === "transfer" ? current.toAccountId : "",
      lineItems: kind === "transfer" ? [] : lineItemsFromDraft(current),
    }));

    if (kind === "transfer") setShowLines(false);
  };

  const canSave =
    Number(draft.amountSatang || 0) > 0 &&
    (draft.kind === "transfer"
      ? Boolean(draft.fromAccountId && draft.toAccountId && draft.fromAccountId !== draft.toAccountId)
      : Boolean(draft.accountId));

  const lineItemsTotal = lineItemsFromDraft(draft).reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);

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
                  accept="image/*,application/pdf"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    await uploadScanFile(file);
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
                  onClick={() => {
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
                        placeholder="0.00"
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

                      <label className="finance-field">
                        <span className="ui-label">หมวดหมู่</span>
                        <select
                          className="ui-select"
                          value={draft.categoryId}
                          onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
                        >
                          <option value="">เลือกหมวดหมู่</option>
                          {kindCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  <label className="finance-field">
                    <span className="ui-label">รายการ</span>
                    <input
                      className="ui-input"
                      value={draft.merchant}
                      onChange={(event) => setDraft((current) => ({ ...current, merchant: event.target.value }))}
                      placeholder="เช่น ค่าอาหาร"
                    />
                  </label>
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
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, reference: event.target.value }))
                            }
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
                  <details className="finance-details" open={showLines}>
                    <summary
                      className="finance-details-summary bento-summary"
                      onClick={(event) => {
                        event.preventDefault();
                        setShowLines((current) => !current);
                      }}
                    >
                      <span>แยกรายการ</span>
                      <span className="finance-details-caret">{showLines ? "ซ่อน" : "แสดง"}</span>
                    </summary>

                    {showLines ? (
                      <div className="finance-details-body">
                        <div className="finance-line-items">
                          <div className="finance-line-items-head">
                            <button
                              type="button"
                              className="ui-btn ui-btn-secondary"
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  lineItems: [
                                    ...lineItemsFromDraft(current),
                                    { name: "", amountSatang: 0, categoryId: current.categoryId || "" },
                                  ],
                                }))
                              }
                            >
                              เพิ่มบรรทัด
                            </button>
                          </div>

                          {lineItemsFromDraft(draft).length ? (
                            lineItemsFromDraft(draft).map((item, index) => (
                              <div key={`manual-line-${index}`} className="finance-line-item-card">
                                <div className="finance-grid finance-grid-2">
                                  <label className="finance-field">
                                    <span className="ui-label">ชื่อรายการ</span>
                                    <input
                                      className="ui-input"
                                      value={item.name || ""}
                                      onChange={(event) =>
                                        setDraft((current) => ({
                                          ...current,
                                          lineItems: lineItemsFromDraft(current).map((row, rowIndex) =>
                                            rowIndex === index ? { ...row, name: event.target.value } : row,
                                          ),
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="finance-field">
                                    <span className="ui-label">จำนวนเงิน</span>
                                    <input
                                      className="ui-input"
                                      inputMode="decimal"
                                      value={toInputAmount(item.amountSatang)}
                                      onChange={(event) =>
                                        setDraft((current) => ({
                                          ...current,
                                          lineItems: lineItemsFromDraft(current).map((row, rowIndex) =>
                                            rowIndex === index
                                              ? { ...row, amountSatang: parseMoneyToSatang(event.target.value) }
                                              : row,
                                          ),
                                        }))
                                      }
                                    />
                                  </label>
                                </div>

                                <label className="finance-field">
                                  <span className="ui-label">หมวดหมู่</span>
                                  <select
                                    className="ui-select"
                                    value={item.categoryId || ""}
                                    onChange={(event) =>
                                      setDraft((current) => ({
                                        ...current,
                                        lineItems: lineItemsFromDraft(current).map((row, rowIndex) =>
                                          rowIndex === index ? { ...row, categoryId: event.target.value } : row,
                                        ),
                                      }))
                                    }
                                  >
                                    <option value="">ใช้หมวดหลัก</option>
                                    {kindCategories.map((category) => (
                                      <option key={category.id} value={category.id}>
                                        {category.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            ))
                          ) : (
                            <div className="finance-line-items-empty">ยังไม่มีบรรทัด</div>
                          )}

                          {lineItemsFromDraft(draft).length ? (
                            <div className="finance-review-summary">
                              <div>
                                <span className="ui-label">ยอดหลัก</span>
                                <div className="finance-row-title">{formatCurrency(draft.amountSatang)}</div>
                              </div>
                              <div>
                                <span className="ui-label">รวมบรรทัด</span>
                                <div className="finance-row-title">{formatCurrency(lineItemsTotal)}</div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </details>
                ) : null}

                <div className="finance-page-actions">
                  <button type="button" className="ui-btn ui-btn-secondary" onClick={() => resetDraft()}>
                    <RotateCcw size={16} />
                    ล้าง
                  </button>

                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    disabled={saving || !canSave}
                    onClick={async () => {
                      await createManualTransaction(draft);
                      resetDraft();
                    }}
                  >
                    <SendHorizonal size={16} />
                    บันทึก
                  </button>
                </div>
              </>
            )}
          </div>
        </article>
      )}
    </ScreenShell>
  );
}
