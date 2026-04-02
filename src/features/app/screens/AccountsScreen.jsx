import { useMemo, useState } from "react";
import { Check, CreditCard, HandCoins, Landmark, Trash2, Wallet } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, ScreenShell, Sheet } from "../ui.jsx";
import { formatCurrency } from "../../../utils/format.js";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../../utils/money.js";
import {
  buildAccountAdjustmentSummary,
  buildAccountBalanceMap,
  getEditableAccountBalanceSatang,
  isLiabilityAccountType,
  normalizeAccountBalanceForType,
} from "../accountBalanceState.js";
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
  { id: "loan", label: "สินเชื่อ", icon: HandCoins },
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

function toAccountMoneyInput(accountType, satang, allowEmpty = false) {
  return toMoneyInput(getEditableAccountBalanceSatang(accountType, satang), allowEmpty);
}

function parseAccountBalanceInput(accountType, rawValue) {
  return normalizeAccountBalanceForType(accountType, parseMoneyToSatang(rawValue));
}

function getAccountMeta(account, preset) {
  const parts = [];
  const presetLabel = getPresetLabel(preset, account?.type);
  if (presetLabel && String(presetLabel).trim() !== String(account?.name || "").trim()) parts.push(presetLabel);
  if (account?.digits_masked) parts.push(account.digits_masked);
  return parts.filter(Boolean).join(" / ");
}

export default function AccountsScreen() {
  const { accounts, accountBalanceSnapshot, saveAccount, deleteAccount, adjustAccountBalance, saving, isOnline } = useExpenseApp();
  const [draft, setDraft] = useState(createDraft());
  const [editorOpen, setEditorOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [openingBalanceInput, setOpeningBalanceInput] = useState(toMoneyInput(0));
  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [desiredBalanceInput, setDesiredBalanceInput] = useState("");
  const [adjustMode, setAdjustMode] = useState("transaction");
  const [adjustDate, setAdjustDate] = useState(new Date().toISOString().slice(0, 10));

  const balanceMap = useMemo(() => {
    return buildAccountBalanceMap(accountBalanceSnapshot);
  }, [accountBalanceSnapshot]);

  const selectedPreset = useMemo(() => {
    return coerceInstitutionPreset(draft.presetId || draft.institutionLabel, draft.type);
  }, [draft.institutionLabel, draft.presetId, draft.type]);

  const presetOptions = useMemo(() => getPresetOptionsForCreateFlow(draft.type), [draft.type]);
  const isDraftLiability = isLiabilityAccountType(draft.type);
  const currentBalanceSatang = draft.id
    ? balanceMap.get(Number(draft.id)) ?? Number(draft.openingBalanceSatang || 0)
    : Number(draft.openingBalanceSatang || 0);
  const adjustmentSummary = useMemo(
    () =>
      buildAccountAdjustmentSummary({
        currentBalanceSatang,
        desiredBalanceSatang: parseAccountBalanceInput(draft.type, desiredBalanceInput || "0"),
      }),
    [currentBalanceSatang, desiredBalanceInput, draft.type],
  );

  const syncMoneyInputs = (nextDraft) => {
    setOpeningBalanceInput(toAccountMoneyInput(nextDraft.type, nextDraft.openingBalanceSatang));
    setCreditLimitInput(toMoneyInput(Math.abs(nextDraft.creditLimitSatang), true));
  };

  const syncAdjustmentInputs = (nextDraft) => {
    const currentBalance = nextDraft?.id
      ? balanceMap.get(Number(nextDraft.id)) ?? Number(nextDraft.openingBalanceSatang || 0)
      : Number(nextDraft?.openingBalanceSatang || 0);
    setDesiredBalanceInput(toAccountMoneyInput(nextDraft?.type, currentBalance));
    setAdjustMode("transaction");
    setAdjustDate(new Date().toISOString().slice(0, 10));
  };

  const openEditor = (account = null) => {
    const nextDraft = createDraft(account);
    setDraft(nextDraft);
    syncMoneyInputs(nextDraft);
    syncAdjustmentInputs(nextDraft);
    setShowMore(false);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    const nextDraft = createDraft();
    setDraft(nextDraft);
    syncMoneyInputs(nextDraft);
    syncAdjustmentInputs(nextDraft);
    setShowMore(false);
    setEditorOpen(false);
  };

  const applyTypePreset = (type) => {
    const nextDraft = applyPresetToAccountDraft(draft, getDefaultPresetIdForAccountType(type), type);
    setDraft(nextDraft);
    syncMoneyInputs(nextDraft);
    syncAdjustmentInputs(nextDraft);
  };

  const applyInstitutionPreset = (presetLike) => {
    const nextDraft = applyPresetToAccountDraft(draft, presetLike, draft.type);
    setDraft(nextDraft);
    syncMoneyInputs(nextDraft);
    syncAdjustmentInputs(nextDraft);
  };

  const submitAdjustment = async () => {
    if (!draft.id) return;

    const result = await adjustAccountBalance({
      accountId: draft.id,
      desiredBalanceSatang: parseAccountBalanceInput(draft.type, desiredBalanceInput || "0"),
      mode: adjustMode,
      date: adjustMode === "transaction" ? adjustDate : undefined,
    });

    if (result && !result.noop) {
      closeEditor();
    }
  };

  const submit = async () => {
    if (!String(draft.name || "").trim()) return;

    await saveAccount({
      ...draft,
      name: String(draft.name || "").trim(),
      institutionLabel: String(draft.institutionLabel || "").trim(),
      icon: draft.icon || getDefaultAccountIcon(draft.type),
      openingBalanceSatang: parseAccountBalanceInput(draft.type, openingBalanceInput),
      creditLimitSatang: draft.type === "credit" ? Math.abs(parseMoneyToSatang(creditLimitInput || "0")) : 0,
      statementDay: draft.type === "credit" ? draft.statementDay : "",
      dueDay: draft.type === "credit" ? draft.dueDay : "",
      digits: String(draft.digits || "").trim(),
    });

    closeEditor();
  };

  const handleDeleteAccount = async () => {
    if (!draft.id) return;
    if (!window.confirm("ลบบัญชีนี้ใช่ไหม รายการเดิมจะยังอยู่ แต่จะไม่ผูกกับบัญชีนี้อีก")) return;
    const deleted = await deleteAccount(draft.id);
    if (deleted) closeEditor();
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
              const isLiability = isLiabilityAccountType(account.type);

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
                      {isLiability ? <div className="finance-account-liability-label">ยอดหนี้</div> : null}
                      <div
                        className={[
                          "finance-row-amount",
                          isLiability && Number(balance || 0) < 0 ? "finance-account-liability-amount" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        {formatCurrency(balance)}
                      </div>
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
          <section
            className={[
              "finance-account-preview",
              isDraftLiability ? "finance-account-preview-liability" : "",
            ].filter(Boolean).join(" ")}
            style={{ "--account-color": draft.color || selectedPreset?.brandColor || "#0b84ff" }}
          >
            <div className="finance-account-preview-kicker">
              {draft.id
                ? isDraftLiability
                  ? "ยอดหนี้ปัจจุบัน"
                  : "ยอดปัจจุบัน"
                : isDraftLiability
                ? "หนี้ตั้งต้น"
                : "ยอดตั้งต้น"}
            </div>
            <div className="finance-account-preview-title">
              {formatCurrency(draft.id ? currentBalanceSatang : draft.openingBalanceSatang)}
            </div>
            <div className="finance-account-preview-meta">
              {isDraftLiability
                ? "กรอกยอดหนี้ตามจริงได้เลย ระบบจะเก็บบัญชีบัตรเครดิตและสินเชื่อเป็นยอดติดลบให้อัตโนมัติ"
                : draft.id
                ? "ถ้าต้องการให้ยอดบัญชีตรงกับยอดจริง ให้ใช้ส่วนปรับยอดด้านล่าง"
                : "ยอดนี้จะเป็นฐานเริ่มต้นสำหรับการคำนวณยอดคงเหลือในครั้งต่อไป"}
            </div>
          </section>
          <section className="finance-form-section finance-form-section-compact">
            <div className="finance-section-label">ประเภท</div>
            <div className="finance-type-grid finance-type-grid-accounts">
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
                  inputMode={isDraftLiability ? "text" : "decimal"}
                  value={openingBalanceInput}
                  onChange={(event) => {
                    const nextValue = sanitizeMoneyInput(event.target.value);
                    setOpeningBalanceInput(nextValue);
                    setDraft((current) => ({
                      ...current,
                      openingBalanceSatang: parseAccountBalanceInput(current.type, nextValue),
                    }));
                  }}
                  placeholder={isDraftLiability ? "2336.75" : "0.00"}
                  data-testid="account-opening-balance"
                />
                {isDraftLiability ? (
                  <span className="finance-field-helper">
                    กรอกยอดหนี้ตามปกติได้เลย ระบบจะบันทึกบัญชีนี้เป็นยอดติดลบ
                  </span>
                ) : null}
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
                      const nextValue = sanitizeMoneyInput(event.target.value);
                      setCreditLimitInput(nextValue);
                      setDraft((current) => ({
                        ...current,
                        creditLimitSatang: Math.abs(parseMoneyToSatang(nextValue)),
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

          {draft.id ? (
            <section className="finance-form-section finance-account-adjust-section">
              <div className="finance-section-label">ปรับยอดบัญชี</div>
              <div className="ui-card finance-account-adjust-card">
                <div className="finance-account-adjust-head">
                  <div>
                    <div className="finance-panel-title">ทำให้ยอดตรงกับยอดจริง</div>
                    <div className="finance-panel-copy">
                      {isDraftLiability ? "ยอดหนี้ตอนนี้ " : "ยอดตอนนี้ "}
                      {formatCurrency(currentBalanceSatang)}
                    </div>
                  </div>
                  <div className="finance-account-adjust-delta">
                    {adjustmentSummary.noop ? (
                      <span className="finance-account-adjust-delta-label">ยังไม่ต้องเปลี่ยน</span>
                    ) : (
                      <>
                        <span className="finance-account-adjust-delta-label">
                          {adjustmentSummary.kind === "income" ? "จะบันทึกเป็นรายรับ" : "จะบันทึกเป็นรายจ่าย"}
                        </span>
                        <strong>{formatCurrency(adjustmentSummary.amountSatang)}</strong>
                      </>
                    )}
                  </div>
                </div>

                <div className="finance-grid finance-grid-2">
                  <label className="finance-field">
                    <span className="ui-label">{isDraftLiability ? "ยอดหนี้ที่ต้องการ" : "ยอดที่ต้องการ"}</span>
                    <input
                      className="ui-input"
                      inputMode={isDraftLiability ? "text" : "decimal"}
                      value={desiredBalanceInput}
                      onChange={(event) => setDesiredBalanceInput(sanitizeMoneyInput(event.target.value))}
                      placeholder={isDraftLiability ? "2336.75" : "0.00"}
                      data-testid="account-adjust-desired-balance"
                    />
                  </label>

                  <label className="finance-field">
                    <span className="ui-label">วิธีปรับยอด</span>
                    <select
                      className="ui-select"
                      value={adjustMode}
                      onChange={(event) => setAdjustMode(event.target.value === "silent" ? "silent" : "transaction")}
                      data-testid="account-adjust-mode"
                    >
                      <option value="transaction">บันทึกเป็นรายรับ / รายจ่าย</option>
                      <option value="silent">ปรับยอดอย่างเดียว</option>
                    </select>
                  </label>
                </div>

                {adjustMode === "transaction" ? (
                  <label className="finance-field">
                    <span className="ui-label">วันที่ของรายการ</span>
                    <input
                      className="ui-input"
                      type="date"
                      value={adjustDate}
                      onChange={(event) => setAdjustDate(event.target.value)}
                      data-testid="account-adjust-date"
                    />
                  </label>
                ) : (
                  <div className="finance-account-adjust-copy">
                    {isDraftLiability
                      ? "กรอกยอดหนี้ตามจริงได้เลย โหมดปรับยอดอย่างเดียวจะอัปเดตฐานยอดบัญชีโดยไม่สร้างรายการ"
                      : "โหมดปรับยอดอย่างเดียวจะอัปเดตฐานยอดบัญชีโดยไม่สร้างรายการ"}
                  </div>
                )}

                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  disabled={saving || !isOnline || !String(desiredBalanceInput || "").trim()}
                  onClick={submitAdjustment}
                  data-testid="account-adjust-submit"
                >
                  ปรับยอดบัญชี
                </button>
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

          {draft.id ? (
            <button
              type="button"
              className="ui-btn ui-btn-danger finance-account-delete-btn"
              disabled={saving}
              onClick={handleDeleteAccount}
            >
              <Trash2 size={16} />
              ลบบัญชี
            </button>
          ) : null}
        </div>
      </Sheet>
    </ScreenShell>
  );
}
