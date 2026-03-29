import { useEffect, useRef, useState } from "react";
import { FileUp, Plus, SendHorizonal, WifiOff } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, ScreenShell, StatusPill } from "../ui.jsx";
import { parseMoneyToSatang } from "../../../utils/money.js";

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
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDraft((current) =>
      current.accountId || !accounts.length
        ? current
        : { ...current, accountId: String(accounts[0].id), fromAccountId: String(accounts[0].id) },
    );
  }, [accounts]);

  const kindCategories = draft.kind === "income" ? categories.income : draft.kind === "transfer" ? [] : categories.expense;

  return (
    <ScreenShell
      eyebrow="Add"
      title="Add fast."
      subtitle="Scan a slip or enter it manually."
      actions={
        !isOnline ? (
          <StatusPill tone="warning">
            <WifiOff size={14} />
            Offline queue active
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
          Scan receipt or slip
        </button>
        <button
          type="button"
          className={["view-segmented-btn", mode === "manual" ? "is-active" : ""].join(" ")}
          onClick={() => setMode("manual")}
        >
          Manual entry
        </button>
      </div>

      {mode === "scan" ? (
        <section className="finance-grid finance-grid-main">
          <article className="ui-card finance-panel finance-dropzone-panel">
            <div className="finance-dropzone">
              <div className="finance-dropzone-icon">
                <FileUp size={24} />
              </div>
              <div className="finance-panel-title">Upload a receipt, PDF, or bank slip.</div>
              <p className="finance-panel-copy">Everything lands in Inbox first.</p>
              <div className="finance-dropzone-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  Choose file
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
            </div>
          </article>

          <article className="ui-card finance-panel">
            <div className="finance-panel-head">
              <div>
                <div className="finance-panel-title">Offline queue</div>
                <p className="finance-panel-copy">Queued items retry when you are back online.</p>
              </div>
            </div>

            {queue.manual.length || queue.scans.length ? (
              <div className="finance-list">
                <div className="finance-row">
                  <div className="finance-row-main">
                    <div>
                      <div className="finance-row-title">{queue.scans.length} scan uploads waiting</div>
                      <div className="finance-row-meta">Saved locally.</div>
                    </div>
                  </div>
                </div>
                <div className="finance-row">
                  <div className="finance-row-main">
                    <div>
                      <div className="finance-row-title">{queue.manual.length} manual drafts queued</div>
                      <div className="finance-row-meta">Will post automatically.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyPanel title="Queue is empty" copy="Offline items will appear here." />
            )}
          </article>
        </section>
      ) : (
        <article className="ui-card finance-panel">
          <div className="finance-form">
            <div className="finance-grid finance-grid-3">
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
                  placeholder="0.00"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      amountSatang: parseMoneyToSatang(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="finance-field">
                <span className="ui-label">Date</span>
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
                    <option value="">Select category</option>
                    {kindCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="finance-grid finance-grid-2">
              <label className="finance-field">
                <span className="ui-label">Merchant</span>
                <input
                  className="ui-input"
                  value={draft.merchant}
                  onChange={(event) => setDraft((current) => ({ ...current, merchant: event.target.value }))}
                  placeholder="Cafe, electricity bill, salary..."
                />
              </label>
              <label className="finance-field">
                <span className="ui-label">Reference</span>
                <input
                  className="ui-input"
                  value={draft.reference}
                  onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </div>

            <label className="finance-field">
              <span className="ui-label">Note</span>
              <textarea
                className="ui-input finance-textarea"
                value={draft.note}
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="Anything useful for future you"
              />
            </label>

            <div className="finance-inline-actions">
              <button
                type="button"
                className="ui-btn ui-btn-secondary"
                onClick={() => setDraft(defaultDraft(accounts))}
              >
                <Plus size={16} />
                Reset
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={saving}
                onClick={async () => {
                  await createManualTransaction(draft);
                  setDraft(defaultDraft(accounts));
                }}
              >
                <SendHorizonal size={16} />
                Save entry
              </button>
            </div>
          </div>
        </article>
      )}
    </ScreenShell>
  );
}
