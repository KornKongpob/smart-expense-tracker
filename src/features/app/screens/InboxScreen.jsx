import { useDeferredValue, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Repeat2, Search, XCircle } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import { formatCurrency, formatDateLong } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";

const REVIEW_KIND_OPTIONS = [
  { id: "expense", label: "รายจ่าย", icon: ArrowDownLeft },
  { id: "income", label: "รายรับ", icon: ArrowUpRight },
  { id: "transfer", label: "โอน", icon: Repeat2 },
];

function lineItemsFromDraft(draft) {
  return Array.isArray(draft?.lineItems) ? draft.lineItems : [];
}

function toInputAmount(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

export default function InboxScreen() {
  const {
    scanDocuments,
    accounts,
    categories,
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

  const lineItemsTotal = lineItemsFromDraft(draft).reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);

  const applyKind = (kind) => {
    const firstAccountId = accounts[0] ? String(accounts[0].id) : "";

    setDraft((current) =>
      current
        ? {
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
            lineItems: kind === "transfer" ? [] : lineItemsFromDraft(current),
          }
        : current,
    );

    if (kind === "transfer") setShowLines(false);
  };

  return (
    <ScreenShell title="กล่องรับ">
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
              const amount = suggestion?.amount || 0;

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
                      <div className="finance-row-amount">{formatCurrency(amount)}</div>
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

                      <label className="finance-field">
                        <span className="ui-label">หมวดหมู่</span>
                        <select
                          className="ui-select"
                          value={draft.categoryId}
                          onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
                        >
                          <option value="">{draft.kind === "transfer" ? "ไม่ใช้หมวดหมู่" : "เลือกหมวดหมู่"}</option>
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
                              <div key={`${selected.id}-${index}`} className="finance-line-item-card">
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
              </>
            )}
          </div>
        ) : null}
      </Sheet>
    </ScreenShell>
  );
}
