import { useMemo, useState } from "react";
import { CreditCard, Landmark, Wallet } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import { formatCurrency } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";
import { getInstitutionChipLabel } from "../../../constants/institutions.js";
import {
  applyPresetToAccountDraft,
  coerceInstitutionPreset,
  getDefaultAccountIcon,
  getDefaultPresetIdForAccountType,
  getPresetOptionsForAccountType,
  resolvePresetForAccount,
} from "../accountPresetUtils.js";

const ACCOUNT_TYPE_OPTIONS = [
  { id: "cash", label: "เงินสด", detail: "Cash or wallet", icon: Wallet },
  { id: "bank", label: "ธนาคาร", detail: "Bank account", icon: Landmark },
  { id: "credit", label: "บัตรเครดิต", detail: "Credit card", icon: CreditCard },
];

function createDraft(account = null) {
  const base = {
    id: account?.id || null,
    name: account?.name || "",
    type: account?.type || "bank",
    institutionLabel: account?.institution_label || "",
    openingBalanceSatang: Number(account?.opening_balance_satang || 0),
    creditLimitSatang: Number(account?.credit_limit_satang || 0),
    statementDay: account?.statement_day ? String(account.statement_day) : "",
    dueDay: account?.due_day ? String(account.due_day) : "",
    digits: "",
    color: account?.color || "#0f766e",
    icon: account?.icon || getDefaultAccountIcon(account?.type || "bank"),
    presetId: "",
  };

  if (account) {
    const preset = resolvePresetForAccount(account);
    return {
      ...base,
      presetId: preset?.id || getDefaultPresetIdForAccountType(base.type),
      color: account?.color || preset?.brandColor || base.color,
      icon: account?.icon || getDefaultAccountIcon(base.type),
    };
  }

  return applyPresetToAccountDraft(base, getDefaultPresetIdForAccountType(base.type), base.type);
}

function toMoneyInput(satang, allowEmpty = false) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

function getTypeLabel(type) {
  if (type === "credit") return "Card";
  if (type === "cash") return "Cash";
  return "Bank";
}

function getPresetDisplayName(preset, type) {
  if (!preset) return getTypeLabel(type);
  if (preset.id === "cash_wallet") return "Cash wallet";
  if (preset.id === "generic_bank") return "Other bank";
  if (preset.id === "generic_credit") return "Other card";
  return String(preset.displayName || preset.shortName || getTypeLabel(type)).trim();
}

function getPresetBadgeText(preset) {
  const chip = String(getInstitutionChipLabel(preset) || preset?.displayName || "").trim();
  if (!chip) return "Acct";
  if (chip.length <= 4 && chip === chip.toUpperCase()) return chip;
  const compact = chip.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  return compact || chip.slice(0, 2).toUpperCase();
}

function getAccountChipText(account, preset) {
  if (preset) {
    return getPresetBadgeText(preset);
  }
  const fallback = String(account?.icon || getDefaultAccountIcon(account?.type)).trim();
  if (!fallback) return "Acct";
  return fallback.length <= 4 ? fallback : fallback.slice(0, 1).toUpperCase();
}

function getAccountMeta(account, preset) {
  const parts = [];
  if (account?.institution_label || preset?.displayName) {
    parts.push(account.institution_label || preset.displayName);
  }
  parts.push(getTypeLabel(account?.type));
  if (account?.digits_masked) parts.push(account.digits_masked);
  return parts.filter(Boolean).join(" / ");
}

export default function AccountsScreen() {
  const { accounts, dashboardSnapshot, saveAccount, saving } = useExpenseApp();
  const [draft, setDraft] = useState(createDraft());
  const [editorOpen, setEditorOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [openingBalanceInput, setOpeningBalanceInput] = useState(toMoneyInput(0));
  const [creditLimitInput, setCreditLimitInput] = useState("");

  const balanceMap = useMemo(() => {
    const next = new Map();
    for (const row of Array.isArray(dashboardSnapshot?.accounts) ? dashboardSnapshot.accounts : []) {
      next.set(Number(row.id), Number(row.balance_satang || 0));
    }
    return next;
  }, [dashboardSnapshot]);

  const selectedPreset = useMemo(() => {
    return coerceInstitutionPreset(draft.presetId || draft.institutionLabel, draft.type);
  }, [draft.institutionLabel, draft.presetId, draft.type]);

  const presetOptions = useMemo(() => getPresetOptionsForAccountType(draft.type), [draft.type]);

  const syncMoneyInputs = (nextDraft) => {
    setOpeningBalanceInput(toMoneyInput(nextDraft.openingBalanceSatang));
    setCreditLimitInput(toMoneyInput(nextDraft.creditLimitSatang, true));
  };

  const openEditor = (account = null) => {
    const nextDraft = createDraft(account);
    setDraft(nextDraft);
    syncMoneyInputs(nextDraft);
    setShowMore(Boolean(account?.digits_masked));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    const nextDraft = createDraft();
    setDraft(nextDraft);
    syncMoneyInputs(nextDraft);
    setShowMore(false);
    setEditorOpen(false);
  };

  const applyTypePreset = (type) => {
    const nextDraft = applyPresetToAccountDraft(draft, getDefaultPresetIdForAccountType(type), type);
    setDraft(nextDraft);
    setCreditLimitInput(toMoneyInput(nextDraft.creditLimitSatang, true));
  };

  const applyInstitutionPreset = (presetLike) => {
    const nextDraft = applyPresetToAccountDraft(draft, presetLike, draft.type);
    setDraft(nextDraft);
    setCreditLimitInput(toMoneyInput(nextDraft.creditLimitSatang, true));
  };

  const submit = async () => {
    if (!String(draft.name || "").trim()) return;

    await saveAccount({
      ...draft,
      name: String(draft.name || "").trim(),
      institutionLabel: String(draft.institutionLabel || "").trim(),
      icon: draft.icon || getDefaultAccountIcon(draft.type),
      openingBalanceSatang: parseMoneyToSatang(openingBalanceInput),
      creditLimitSatang: draft.type === "credit" ? parseMoneyToSatang(creditLimitInput || "0") : 0,
      statementDay: draft.type === "credit" ? draft.statementDay : "",
      dueDay: draft.type === "credit" ? draft.dueDay : "",
      digits: String(draft.digits || "").trim(),
    });

    closeEditor();
  };

  return (
    <ScreenShell
      eyebrow="Accounts"
      title="Accounts"
      subtitle="Choose a preset first, then fill only what matters."
      actions={
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={() => openEditor()}
          data-testid="new-account"
        >
          New account
        </button>
      }
    >
      <section className="ui-card finance-panel finance-accounts-panel">
        {accounts.length ? (
          <div className="finance-list finance-account-list">
            {accounts.map((account) => {
              const preset = resolvePresetForAccount(account);
              const balance = balanceMap.get(Number(account.id)) ?? Number(account.opening_balance_satang || 0);
              const color = account.color || preset?.brandColor || "#0f766e";

              return (
                <button
                  key={account.id}
                  type="button"
                  className="finance-list-button finance-account-button"
                  onClick={() => openEditor(account)}
                  data-testid={`account-row-${account.id}`}
                >
                  <div className="finance-row finance-account-row">
                    <div className="finance-row-main">
                      <span
                        className="finance-category-icon finance-account-chip"
                        style={{ backgroundColor: `${color}18`, color }}
                      >
                        {getAccountChipText(account, preset)}
                      </span>
                      <div className="finance-account-copy">
                        <div className="finance-row-title">{account.name}</div>
                        <div className="finance-row-meta">{getAccountMeta(account, preset)}</div>
                      </div>
                    </div>
                    <div className="finance-row-side finance-account-side">
                      <div className="finance-row-amount">{formatCurrency(balance)}</div>
                      {account.type === "credit" && Number(account.credit_limit_satang || 0) > 0 ? (
                        <div className="finance-account-limit">
                          Limit {formatCurrency(account.credit_limit_satang)}
                        </div>
                      ) : (
                        <div className="finance-account-limit finance-account-limit-muted">
                          {getPresetDisplayName(preset, account.type)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyPanel
            title="No accounts yet"
            copy="Start with cash, a bank account, or a credit card."
            action={
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => openEditor()}>
                Add your first account
              </button>
            }
          />
        )}
      </section>

      <Sheet
        open={editorOpen}
        onClose={closeEditor}
        title={draft.id ? "Edit account" : "Create account"}
        subtitle="Preset first. Details only when you need them."
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeEditor}>
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving || !String(draft.name || "").trim()}
              onClick={submit}
              data-testid="save-account"
            >
              {draft.id ? "Save changes" : "Save account"}
            </button>
          </div>
        }
      >
        <div className="finance-form finance-account-form">
          <section className="finance-form-section">
            <div className="finance-panel-title">1. Choose type</div>
            <div className="finance-type-grid">
              {ACCOUNT_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = draft.type === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={["finance-type-chip", active ? "is-active" : ""].join(" ")}
                    onClick={() => applyTypePreset(option.id)}
                    data-testid={`account-type-${option.id}`}
                  >
                    <span className="finance-type-chip-icon">
                      <Icon size={16} />
                    </span>
                    <span>
                      <span className="finance-type-chip-label">{option.label}</span>
                      <span className="finance-type-chip-detail">{option.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="finance-form-section">
            <div className="finance-panel-title">2. Pick a preset</div>
            <div className="finance-panel-copy">Thai banks and common cards are ready to use.</div>
            <div className="finance-preset-grid">
              {presetOptions.map((preset) => {
                const active = String(draft.presetId || "") === String(preset.id || "");
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={["finance-preset-card", active ? "is-active" : ""].join(" ")}
                    onClick={() => applyInstitutionPreset(preset)}
                    data-testid={`institution-${preset.id}`}
                  >
                    <span
                      className="finance-preset-badge"
                      style={{ backgroundColor: `${preset.brandColor}18`, color: preset.brandColor }}
                    >
                      {getPresetBadgeText(preset)}
                    </span>
                    <span className="finance-preset-copy">
                      <span className="finance-preset-name">{getPresetDisplayName(preset, draft.type)}</span>
                      <span className="finance-preset-meta">{(preset.accountTypes || []).join(" / ")}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="finance-form-section finance-form-section-compact">
            <div className="finance-account-preview" style={{ "--account-color": draft.color }}>
              <div className="finance-account-preview-kicker">{getTypeLabel(draft.type)}</div>
              <div className="finance-account-preview-title">{draft.name || getPresetDisplayName(selectedPreset, draft.type)}</div>
              <div className="finance-account-preview-meta">
                {draft.institutionLabel || getPresetDisplayName(selectedPreset, draft.type)}
              </div>
            </div>
          </section>

          <section className="finance-form-section">
            <div className="finance-panel-title">3. Basics</div>
            <div className="finance-grid finance-grid-2">
              <label className="finance-field">
                <span className="ui-label">Account name</span>
                <input
                  className="ui-input"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder={getPresetDisplayName(selectedPreset, draft.type)}
                  data-testid="account-name"
                />
              </label>

              <label className="finance-field">
                <span className="ui-label">Opening balance (THB)</span>
                <input
                  className="ui-input"
                  inputMode="decimal"
                  value={openingBalanceInput}
                  onChange={(event) => {
                    setOpeningBalanceInput(event.target.value);
                    setDraft((current) => ({
                      ...current,
                      openingBalanceSatang: parseMoneyToSatang(event.target.value),
                    }));
                  }}
                  placeholder="0.00"
                  data-testid="account-opening-balance"
                />
              </label>
            </div>

            {draft.type === "credit" ? (
              <div className="finance-grid finance-grid-3">
                <label className="finance-field">
                  <span className="ui-label">Credit limit (THB)</span>
                  <input
                    className="ui-input"
                    inputMode="decimal"
                    value={creditLimitInput}
                    onChange={(event) => {
                      setCreditLimitInput(event.target.value);
                      setDraft((current) => ({
                        ...current,
                        creditLimitSatang: parseMoneyToSatang(event.target.value),
                      }));
                    }}
                    placeholder="0.00"
                    data-testid="account-credit-limit"
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">Statement day</span>
                  <input
                    className="ui-input"
                    type="number"
                    min="1"
                    max="31"
                    value={draft.statementDay}
                    onChange={(event) => setDraft((current) => ({ ...current, statementDay: event.target.value }))}
                    data-testid="account-statement-day"
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">Due day</span>
                  <input
                    className="ui-input"
                    type="number"
                    min="1"
                    max="31"
                    value={draft.dueDay}
                    onChange={(event) => setDraft((current) => ({ ...current, dueDay: event.target.value }))}
                    data-testid="account-due-day"
                  />
                </label>
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
              <span>More details</span>
              <span className="finance-details-caret">{showMore ? "Hide" : "Show"}</span>
            </summary>
            {showMore ? (
              <div className="finance-details-body">
                <div className="finance-grid finance-grid-2">
                  <label className="finance-field">
                    <span className="ui-label">Institution label</span>
                    <input
                      className="ui-input"
                      value={draft.institutionLabel}
                      onChange={(event) => setDraft((current) => ({ ...current, institutionLabel: event.target.value }))}
                      placeholder="KBank, SCB, Visa"
                    />
                  </label>

                  <label className="finance-field">
                    <span className="ui-label">Matching digits</span>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={draft.digits}
                      onChange={(event) => setDraft((current) => ({ ...current, digits: event.target.value }))}
                      placeholder={draft.id ? "Leave blank to keep current" : "Last 4-6 digits"}
                      data-testid="account-digits"
                    />
                  </label>
                </div>
                <div className="finance-panel-copy">
                  Digits are sent through the secure server route and stored masked or encrypted.
                </div>
              </div>
            ) : null}
          </details>

          {draft.type === "credit" ? (
            <StatusPill tone="default">
              {draft.statementDay || "--"}/{draft.dueDay || "--"} billing cycle
            </StatusPill>
          ) : null}
        </div>
      </Sheet>
    </ScreenShell>
  );
}
