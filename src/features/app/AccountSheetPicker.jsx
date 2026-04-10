import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { getPresetBadgeText, getPresetLabel, resolvePresetForAccount } from "./accountPresetUtils.js";
import { Sheet } from "./ui.jsx";

const ACCOUNT_TYPE_LABELS = Object.freeze({
  bank: "บัญชีธนาคาร",
  cash: "เงินสด",
  credit: "บัตรเครดิต",
  loan: "สินเชื่อ",
  ewallet: "วอลเล็ท",
  investment: "ลงทุน",
});

function normalizeText(value) {
  return String(value || "").trim();
}

function getDigitsLabel(account) {
  const masked = normalizeText(account?.digits_masked || account?.digitsMasked);
  if (masked) return masked;

  const last4 = normalizeText(account?.last4);
  if (last4) return `•••• ${last4}`;

  const last6 = normalizeText(account?.last6);
  if (last6) return `•• ${last6}`;

  return "";
}

function buildAccountMeta(account, preset) {
  const parts = [];
  const typeLabel = ACCOUNT_TYPE_LABELS[normalizeText(account?.type).toLowerCase()] || "";
  const presetLabel = getPresetLabel(preset, account?.type);
  const digitsLabel = getDigitsLabel(account);

  if (typeLabel) parts.push(typeLabel);
  if (presetLabel && presetLabel !== normalizeText(account?.name)) parts.push(presetLabel);
  if (digitsLabel) parts.push(digitsLabel);

  return parts.filter(Boolean).join(" · ");
}

function buildSearchText(account, meta, preset) {
  return [
    account?.name,
    account?.institution_label,
    account?.digits_masked,
    account?.last4,
    account?.last6,
    meta,
    getPresetLabel(preset, account?.type),
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function scheduleNextFrame(callback) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => callback());
    return;
  }

  if (typeof window !== "undefined") {
    window.setTimeout(() => callback(), 0);
    return;
  }

  queueMicrotask(callback);
}

export default function AccountSheetPicker({
  accounts,
  value,
  onChange,
  title = "เลือกบัญชี",
  placeholder = "เลือกบัญชี",
  disabled = false,
  allowEmpty = false,
  emptyLabel = "ไม่ผูกบัญชี",
  emptyDescription = "เลือกตัวเลือกนี้ถ้าไม่ต้องการผูกกับบัญชีใด",
  testId,
  emptyTestId,
  optionTestIdPrefix,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const suppressOpenUntilRef = useRef(0);

  const displayAccounts = useMemo(
    () =>
      (Array.isArray(accounts) ? accounts : [])
        .filter(Boolean)
        .map((account) => {
          const preset = resolvePresetForAccount(account);
          const accentColor = normalizeText(account?.color) || preset?.brandColor || "#0b84ff";
          const meta = buildAccountMeta(account, preset);

          return {
            ...account,
            accentColor,
            badgeText: getPresetBadgeText(preset, account?.type),
            meta,
            searchText: buildSearchText(account, meta, preset),
          };
        }),
    [accounts],
  );

  const selectedAccount = useMemo(
    () => displayAccounts.find((account) => String(account?.id || "") === String(value || "")) || null,
    [displayAccounts, value],
  );

  const shouldSearch = displayAccounts.length > 6;

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = normalizeText(deferredQuery).toLowerCase();
    if (!normalizedQuery) return displayAccounts;
    return displayAccounts.filter((account) => account.searchText.includes(normalizedQuery));
  }, [deferredQuery, displayAccounts]);

  const openPicker = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (disabled || open) return;
    if (Date.now() < suppressOpenUntilRef.current) return;
    setQuery("");
    setOpen(true);
  };

  const closePicker = () => {
    suppressOpenUntilRef.current = Date.now() + 320;
    setOpen(false);
    setQuery("");
  };

  const closePickerAfterCommit = () => {
    scheduleNextFrame(() => {
      closePicker();
    });
  };

  const selectValue = (nextValue, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (String(nextValue || "") === String(value || "")) {
      closePickerAfterCommit();
      return;
    }
    onChange?.(nextValue);
    closePickerAfterCommit();
  };

  return (
    <>
      <button
        type="button"
        className={["finance-picker-trigger", disabled ? "is-disabled" : ""].filter(Boolean).join(" ")}
        onClick={openPicker}
        onPointerDown={(event) => {
          if (Date.now() < suppressOpenUntilRef.current) event.preventDefault();
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={testId}
      >
        {selectedAccount ? (
          <span className="finance-picker-trigger-main">
            <span
              className="finance-picker-badge"
              style={{ backgroundColor: `${selectedAccount.accentColor}14`, color: selectedAccount.accentColor }}
            >
              {selectedAccount.badgeText}
            </span>
            <span className="finance-picker-trigger-copy">
              <span className="finance-picker-trigger-title">{selectedAccount.name}</span>
              <span className="finance-picker-trigger-meta">{selectedAccount.meta || placeholder}</span>
            </span>
          </span>
        ) : (
          <span className="finance-picker-trigger-main">
            <span className="finance-picker-badge finance-picker-badge-empty">เลือก</span>
            <span className="finance-picker-trigger-copy">
              <span className="finance-picker-trigger-title">{allowEmpty ? emptyLabel : placeholder}</span>
              <span className="finance-picker-trigger-meta">
                {allowEmpty ? "ยังไม่ได้เชื่อมกับบัญชี" : "แตะเพื่อเลือกบัญชี"}
              </span>
            </span>
          </span>
        )}
        <ChevronDown size={18} aria-hidden="true" className="finance-picker-chevron" />
      </button>

      <Sheet
        open={open}
        onClose={closePicker}
        title={title}
        subtitle={allowEmpty ? "แตะเลือกบัญชี หรือปล่อยว่างไว้หากไม่ต้องการผูกกับบัญชี" : "แตะการ์ดเพื่อเลือกบัญชี"}
      >
        <div className="finance-form finance-account-picker-sheet">
          {shouldSearch ? (
            <label className="finance-field finance-picker-search">
              <span className="ui-label">ค้นหาบัญชี</span>
              <div className="finance-picker-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  className="ui-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="พิมพ์ชื่อบัญชี ธนาคาร หรือเลขท้าย"
                />
              </div>
            </label>
          ) : null}

          <div className="finance-account-picker-list">
            {allowEmpty ? (
              <button
                type="button"
                className={[
                  "finance-account-picker-card",
                  "finance-account-picker-card-empty",
                  !selectedAccount ? "is-selected" : "",
                ].filter(Boolean).join(" ")}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => selectValue("", event)}
                data-testid={emptyTestId}
              >
                <span className="finance-picker-badge finance-picker-badge-empty">—</span>
                <span className="finance-account-picker-copy">
                  <span className="finance-account-picker-title">{emptyLabel}</span>
                  <span className="finance-account-picker-meta">{emptyDescription}</span>
                </span>
                {!selectedAccount ? (
                  <span className="finance-account-picker-check">
                    <Check size={16} />
                  </span>
                ) : null}
              </button>
            ) : null}

            {filteredAccounts.length ? (
              filteredAccounts.map((account) => {
                const active = String(account?.id || "") === String(value || "");
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={["finance-account-picker-card", active ? "is-selected" : ""].filter(Boolean).join(" ")}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => selectValue(String(account.id), event)}
                    data-testid={optionTestIdPrefix ? `${optionTestIdPrefix}-${account.id}` : undefined}
                  >
                    <span
                      className="finance-picker-badge"
                      style={{ backgroundColor: `${account.accentColor}14`, color: account.accentColor }}
                    >
                      {account.badgeText}
                    </span>
                    <span className="finance-account-picker-copy">
                      <span className="finance-account-picker-title">{account.name}</span>
                      <span className="finance-account-picker-meta">{account.meta || "บัญชีที่พร้อมใช้งาน"}</span>
                    </span>
                    {active ? (
                      <span className="finance-account-picker-check">
                        <Check size={16} />
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="finance-account-picker-empty">ไม่พบบัญชีที่ตรงกับคำค้นหา</div>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
