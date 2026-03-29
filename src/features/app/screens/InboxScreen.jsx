import { useDeferredValue, useEffect, useState } from "react";
import { CheckCircle2, Search, XCircle } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import { formatCurrency, formatDateLong } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";

function lineItemsFromDraft(draft) {
  return Array.isArray(draft?.lineItems) ? draft.lineItems : [];
}

function toInputAmount(satang) {
  const amount = Number(satang || 0) / 100;
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
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
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setDraft(selected ? scanToDraft(selected) : null);
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

  const kindCategories =
    draft?.kind === "income"
      ? categories.income
      : draft?.kind === "transfer"
      ? []
      : categories.expense;

  return (
    <ScreenShell
      eyebrow="Inbox"
      title="Review before posting."
      subtitle="Receipts and slips land here first."
    >
      <section className="ui-card finance-panel">
        <div className="finance-toolbar">
          <label className="finance-search">
            <Search size={16} />
            <input
              className="ui-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search merchant or note"
            />
          </label>
          <div className="view-segmented finance-filter">
            {[
              { id: "pending_review", label: "Pending" },
              { id: "approved", label: "Approved" },
              { id: "all", label: "All" },
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
                          {suggestion?.merchant || scan.file_name || "Untitled scan"}
                        </div>
                        <div className="finance-row-meta">
                          {formatDateLong(suggestion?.date || scan.created_at)} • {scan.mime_type || "file"}
                        </div>
                      </div>
                    </div>
                    <div className="finance-row-side">
                      <StatusPill tone={scan.status === "approved" ? "success" : "warning"}>
                        {scan.status === "approved" ? "Approved" : "Pending"}
                      </StatusPill>
                      <div className="finance-row-amount">{formatCurrency(amount)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyPanel
            title="Inbox is clean"
            copy="New scans will appear here automatically."
          />
        )}
      </section>

      <Sheet
        open={!!selected && !!draft}
        onClose={() => setSelected(null)}
        title={selected?.normalized_suggestion?.merchant || selected?.file_name || "Review scan"}
        subtitle="Adjust it before posting."
        footer={
          <div className="finance-sheet-actions">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={async () => {
                await rejectScanDocument(selected.id);
                setSelected(null);
              }}
              disabled={saving}
            >
              <XCircle size={16} />
              Reject
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              onClick={async () => {
                await approveScanDocument(selected, draft);
                setSelected(null);
              }}
              disabled={saving}
            >
              <CheckCircle2 size={16} />
              Approve
            </button>
          </div>
        }
      >
        {draft ? (
          <div className="finance-form">
            <div className="finance-grid finance-grid-2">
              <label className="finance-field">
                <span className="ui-label">Kind</span>
                <select
                  className="ui-select"
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      kind: event.target.value,
                      categoryId: event.target.value === "transfer" ? "" : current.categoryId,
                    }))
                  }
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
              <label className="finance-field">
                <span className="ui-label">Amount (THB)</span>
                <input
                  className="ui-input"
                  inputMode="decimal"
                  value={toInputAmount(draft.amountSatang)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      amountSatang: parseMoneyToSatang(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <div className="finance-grid finance-grid-2">
              <label className="finance-field">
                <span className="ui-label">Date</span>
                <input
                  className="ui-input"
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                />
              </label>
              <label className="finance-field">
                <span className="ui-label">Merchant</span>
                <input
                  className="ui-input"
                  value={draft.merchant}
                  onChange={(event) => setDraft((current) => ({ ...current, merchant: event.target.value }))}
                />
              </label>
            </div>

            <label className="finance-field">
              <span className="ui-label">Note</span>
              <textarea
                className="ui-input finance-textarea"
                value={draft.note}
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              />
            </label>

            {draft.kind === "transfer" ? (
              <div className="finance-grid finance-grid-2">
                <label className="finance-field">
                  <span className="ui-label">From account</span>
                  <select
                    className="ui-select"
                    value={draft.fromAccountId}
                    onChange={(event) => setDraft((current) => ({ ...current, fromAccountId: event.target.value }))}
                  >
                    <option value="">Select account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="finance-field">
                  <span className="ui-label">To account</span>
                  <select
                    className="ui-select"
                    value={draft.toAccountId}
                    onChange={(event) => setDraft((current) => ({ ...current, toAccountId: event.target.value }))}
                  >
                    <option value="">Select account</option>
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
                  <span className="ui-label">Account</span>
                  <select
                    className="ui-select"
                    value={draft.accountId}
                    onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value }))}
                  >
                    <option value="">Select account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="finance-field">
                  <span className="ui-label">Category</span>
                  <select
                    className="ui-select"
                    value={draft.categoryId}
                    disabled={draft.kind === "transfer"}
                    onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
                  >
                    <option value="">{draft.kind === "transfer" ? "Transfer has no category" : "Select category"}</option>
                    {kindCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="finance-line-items">
              <div className="finance-line-items-head">
                <div>
                  <div className="finance-panel-title">Line items</div>
                  <p className="finance-panel-copy">Split if needed.</p>
                </div>
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
                  Add line
                </button>
              </div>

              {lineItemsFromDraft(draft).length ? (
                lineItemsFromDraft(draft).map((item, index) => (
                  <div key={`${selected.id}-${index}`} className="finance-line-item-card">
                    <div className="finance-grid finance-grid-2">
                      <label className="finance-field">
                        <span className="ui-label">Name</span>
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
                        <span className="ui-label">Amount (THB)</span>
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
                    {draft.kind !== "transfer" ? (
                      <label className="finance-field">
                        <span className="ui-label">Category</span>
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
                          <option value="">Use parent category</option>
                          {kindCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="finance-line-items-empty">
                  No split lines yet.
                </div>
              )}
            </div>

            <div className="finance-review-summary">
              <div>
                <span className="ui-label">Current total</span>
                <div className="finance-row-title">{formatCurrency(draft.amountSatang)}</div>
              </div>
              {lineItemsFromDraft(draft).length ? (
                <div>
                  <span className="ui-label">Lines sum</span>
                  <div className="finance-row-title">
                    {formatCurrency(
                      lineItemsFromDraft(draft).reduce((sum, item) => sum + Number(item.amountSatang || 0), 0),
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>
    </ScreenShell>
  );
}
