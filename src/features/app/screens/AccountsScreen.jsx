import { useMemo, useState } from "react";
import { Check, CreditCard, Landmark, Wallet } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, ScreenShell, Sheet } from "../ui.jsx";
import { formatCurrency } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";
import {
  applyPresetToAccountDraft,
  coerceInstitutionPreset,
  getDefaultAccountIcon,
  getDefaultPresetIdForAccountType,
  getPresetBadgeText,
  getPresetLabel,
  getPresetOptionsForCreateFlow,
  resolvePresetForAccount,
} from "../accountPresetUtils.js";

const ACCOUNT_TYPE_OPTIONS = [
  { id: "bank", label: "บัญชีธนาคาร", icon: Landmark },
  { id: "credit", label: "บัตรเครดิต", icon: CreditCard },
  { id: "cash", label: "เงินสด", icon: Wallet },
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
    color: account?.color || "#0b84ff",
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

function getAccountMeta(account, preset) {
  const parts = [];
  const presetLabel = getPresetLabel(preset, account?.type);
  if (presetLabel && String(presetLabel).trim() !== String(account?.name || "").trim()) parts.push(presetLabel);
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

  const presetOptions = useMemo(() => getPresetOptionsForCreateFlow(draft.type), [draft.type]);

  const syncMoneyInputs = (nextDraft) => {
    setOpeningBalanceInput(toMoneyInput(nextDraft.openingBalanceSatang));
    setCreditLimitInput(toMoneyInput(nextDraft.creditLimitSatang, true));
  };

  const openEditor = (account = null) => {
    const nextDraft = createDraft(account);
    setDraft(nextDraft);
    syncMoneyInputs(nextDraft);
    setShowMore(false);
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
      title="บัญชี"
      actions={
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={() => openEditor()}
          data-testid="new-account"
        >
          สร้างบัญชี
        </button>
      }
    >
      <section className="ui-card finance-panel finance-accounts-panel">
        {accounts.length ? (
          <div className="finance-list finance-account-list">
            {accounts.map((account) => {
              const preset = resolvePresetForAccount(account);
              const balance = balanceMap.get(Number(account.id)) ?? Number(account.opening_balance_satang || 0);
              const color = account.color || preset?.brandColor || "#0b84ff";

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
                        style={{ backgroundColor: `${color}14`, color }}
                      >
                        {getPresetBadgeText(preset, account.type)}
                      </span>
                      <div className="finance-account-copy">
                        <div className="finance-row-title">{account.name}</div>
                        <div className="finance-row-meta">{getAccountMeta(account, preset)}</div>
                      </div>
                    </div>
                    <div className="finance-row-side finance-account-side">
                      <div className="finance-row-amount">{formatCurrency(balance)}</div>
                      {account.type === "credit" && Number(account.credit_limit_satang || 0) > 0 ? (
                        <div className="finance-account-limit">วงเงิน {formatCurrency(account.credit_limit_satang)}</div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyPanel
            title="ยังไม่มีบัญชี"
            copy="แตะสร้างบัญชีเพื่อเริ่ม"
          />
        )}
      </section>

      <Sheet
        open={editorOpen}
        onClose={closeEditor}
        title={draft.id ? "แก้ไขบัญชี" : "บัญชีใหม่"}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeEditor}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving || !String(draft.name || "").trim()}
              onClick={submit}
              data-testid="save-account"
            >
              {draft.id ? "บันทึก" : "สร้างบัญชี"}
            </button>
          </div>
        }
      >
        <div className="finance-form finance-account-form">
          <section className="finance-form-section finance-form-section-compact">
            <div className="finance-section-label">ประเภท</div>
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
                    <span className="finance-type-chip-label">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="finance-form-section finance-form-section-compact">
            <div className="finance-section-label">
              {draft.type === "credit" ? "เลือกบัตร" : draft.type === "cash" ? "เลือกกระเป๋า" : "เลือกธนาคาร"}
            </div>
            <div className="finance-preset-grid finance-preset-grid-compact">
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
                      style={{ backgroundColor: `${preset.brandColor}14`, color: preset.brandColor }}
                    >
                      {getPresetBadgeText(preset, draft.type)}
                    </span>
                    <span className="finance-preset-copy">
                      <span className="finance-preset-name">{getPresetLabel(preset, draft.type)}</span>
                    </span>
                    {active ? (
                      <span className="finance-preset-check">
                        <Check size={14} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="finance-form-section">
            <div className="finance-grid finance-grid-2">
              <label className="finance-field">
                <span className="ui-label">ชื่อบัญชี</span>
                <input
                  className="ui-input"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder={getPresetLabel(selectedPreset, draft.type)}
                  data-testid="account-name"
                />
              </label>

              <label className="finance-field">
                <span className="ui-label">ยอดตั้งต้น</span>
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
                  <span className="ui-label">วงเงิน</span>
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
                  <span className="ui-label">วันตัดรอบ</span>
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
                  <span className="ui-label">วันครบกำหนด</span>
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
              <span>รายละเอียดเพิ่มเติม</span>
              <span className="finance-details-caret">{showMore ? "ซ่อน" : "แสดง"}</span>
            </summary>
            {showMore ? (
              <div className="finance-details-body">
                <div className="finance-grid finance-grid-2">
                  <label className="finance-field">
                    <span className="ui-label">ชื่อธนาคาร/บัตร</span>
                    <input
                      className="ui-input"
                      value={draft.institutionLabel}
                      onChange={(event) => setDraft((current) => ({ ...current, institutionLabel: event.target.value }))}
                      placeholder="ใช้ชื่อเฉพาะของคุณได้"
                    />
                  </label>

                  <label className="finance-field">
                    <span className="ui-label">เลขช่วยจำ</span>
                    <input
                      className="ui-input"
                      inputMode="numeric"
                      value={draft.digits}
                      onChange={(event) => setDraft((current) => ({ ...current, digits: event.target.value }))}
                      placeholder="เช่น 1234"
                      data-testid="account-digits"
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </details>
        </div>
      </Sheet>
    </ScreenShell>
  );
}
