import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Layers,
  Sparkles,
} from "lucide-react";

import ModalShell from "./ModalShell";
import AccountPicker from "./AccountPicker";
import AccountChipsPicker from "./AccountChipsPicker";
import CategoryPicker from "./CategoryPicker";
import QuickSuggestions from "./QuickSuggestions";

import SplitDetailsEditor from "./SplitDetailsEditor";

import { isCreditAccount } from "../utils/accountMatch";
import { formatCurrency, toISODate } from "../utils/format";
import { parseMoneyToSatang, formatMoneyInputFromSatang, sanitizeMoneyInput } from "../utils/money";
import { isAdjustmentLike } from "../utils/receiptAdjustments";
import { deriveMerchantAutofillPatch } from "../utils/merchantDictionary";

const isTombstoneCategory = (c) => !!(c?.deletedAt || c?.isDeleted);

function isImageSrc(v) {
  const s = String(v || "").trim();
  return s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://");
}

function getAccountVisual(acc) {
  if (!acc) return { kind: "emoji", value: "💳" };
  const img = acc.image && isImageSrc(acc.image) ? acc.image : null;
  if (img) return { kind: "img", src: img };

  const icon = String(acc.icon || "").trim();
  if (isImageSrc(icon)) return { kind: "img", src: icon };
  return { kind: "emoji", value: icon || "💳" };
}

function StepPill({ active, done, index, label, icon, onClick }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-2 rounded-full text-xs font-extrabold border transition-all active:scale-95 flex items-center gap-2 ${
        active
          ? "bg-gray-900/90 text-white border-white/15"
          : done
          ? "bg-white/25 text-gray-900/80 border-white/15"
          : "bg-white/10 text-gray-900/65 border-white/10"
      }`}
      aria-current={active ? "step" : undefined}
    >
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black ${
          active ? "bg-white/20" : done ? "bg-emerald-500/20 text-emerald-900" : "bg-white/15"
        }`}
      >
        {done ? <Check size={12} /> : index + 1}
      </span>
      {Icon ? <Icon size={14} /> : null}
      <span className="truncate max-w-[7.5rem]">{label}</span>
    </button>
  );
}

/**
 * TransactionReviewModal (shared)
 * - Used by AddTransaction (Scan review) & Inbox (edit pending items)
 *
 * Notes:
 * - This modal is "controlled": it receives `q` and calls back via `onUpdateItem/onUpdateGroup`.
 * - For Inbox editing, you can pass a local draft + provide `onDone` to commit.
 */
export default function TransactionReviewModal({
  isOpen,
  q,
  title = "ตรวจสอบก่อนบันทึก",
  onClose,
  onDone,
  doneLabel = "เสร็จแล้ว",
  onUpdateItem,
  onUpdateGroup,
  onTypeChange,
  accounts,
  nonCreditAccounts,
  expenseCatsAll,
  incomeCatsAll,
  recentCatsByType,
  recentAccountsByType,
  catIndexByType,
  merchants,
}) {
  const qid = String(q?.id || "");
  const txType = String(q?.txType || q?.type || "").toLowerCase();

  const nonAdjGroupCount = useMemo(
    () => (Array.isArray(q?.groups) ? q.groups.filter((g) => !isAdjustmentLike(g)).length : 0),
    [q?.groups]
  );
  const hasGroups = txType === "expense" && nonAdjGroupCount >= 2;
  const hasReceiptLines = txType === "expense" && Array.isArray(q?.groups) && q.groups.length > 0;

  const [step, setStep] = useState(0);

  const onUpdateItemRef = useRef(onUpdateItem);
  useEffect(() => {
    onUpdateItemRef.current = onUpdateItem;
  }, [onUpdateItem]);

  // When opening: default to Split step for multi-item receipts
  useEffect(() => {
    if (!isOpen) return;
    if (hasGroups) setStep(2);
    else setStep(0);
  }, [isOpen, hasGroups]);

  // Guard installment when account changes
  useEffect(() => {
    if (!isOpen) return;
    if (txType !== "expense") {
      if (q?.isInstallment) onUpdateItemRef.current?.(qid, { isInstallment: false });
      return;
    }
    const acc = (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === String(q?.accountId || ""));
    if (!isCreditAccount(acc) && q?.isInstallment) {
      onUpdateItemRef.current?.(qid, { isInstallment: false });
    }
  }, [isOpen, txType, q?.accountId, q?.isInstallment, accounts, qid]);

  const steps = useMemo(() => {
    return [
      { key: "ess", label: "Essentials", icon: Layers },
      { key: "acc", label: "Account", icon: CreditCard },
      { key: "cat", label: hasGroups ? "Split" : "Category", icon: Sparkles },
      { key: "note", label: "Notes", icon: FileText },
      { key: "done", label: "Done", icon: Check },
    ];
  }, [hasGroups]);

  const canGoBack = step > 0;
  const canGoNext = step < steps.length - 1;

  const primaryCats = txType === "income" ? incomeCatsAll : expenseCatsAll;
  const recentCats = txType === "income" || txType === "expense" ? recentCatsByType?.[txType] || [] : [];

  const doneFn = onDone || onClose;

  const stepContent = useMemo(() => {
    if (!isOpen) return null;
    const merchantsList = Array.isArray(merchants) ? merchants : [];

    // ------------- STEP: Essentials -------------
    if (step === 0) {
      return (
        <div className="space-y-3">
          {/* Preview */}
          {q?.previewUrl ? (
            <div className="glass-panel border border-white/20 rounded-2xl p-3">
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/15 bg-white/10 shrink-0">
                  {q?.fileKind === "pdf" ? (
                    <div className="w-full h-full flex items-center justify-center text-gray-900/70">
                      <FileText size={18} />
                    </div>
                  ) : (
                    <img src={q.previewUrl} alt="preview" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-gray-900/80">ไฟล์</div>
                  <div className="text-sm font-black text-gray-900 truncate">{q?.fileName || "(ไม่มีชื่อไฟล์)"}</div>
                  <div className="mt-1 text-[11px] text-gray-900/55 truncate">แตะปุ่ม “ดูไฟล์” เพื่อเปิดแท็บใหม่</div>
                  <a
                    href={q.previewUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex mt-2 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-white/20 border border-white/15 text-gray-900/80 active:scale-95"
                  >
                    ดูไฟล์
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          <div className="glass-panel border border-white/20 rounded-2xl p-3">
            <div className="mb-3">
              <div className="text-xs font-bold text-gray-900/70 flex items-center gap-2">
                <Layers size={14} /> Essentials
              </div>
              <div className="text-[11px] text-gray-900/55">ยืนยันประเภท, ยอด และวันที่</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-gray-900/70 mb-2">ประเภทของรายการ</div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: "expense", label: "Expense" },
                    { id: "income", label: "Income" },
                    { id: "transfer", label: "Transfer" },
                    { id: "credit_payment", label: "ชำระบัตร" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onTypeChange?.(qid, t.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${
                        txType === t.id
                          ? "bg-gray-900/90 text-white shadow-sm"
                          : "bg-white/20 text-gray-900/70 border border-white/15"
                      }`}
                      title="เปลี่ยนประเภทได้ หาก AI เลือกผิด"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-bold text-gray-900/70 mb-1">ยอด</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={q?.amount != null ? formatMoneyInputFromSatang(Math.abs(Number(q.amount) || 0)) : ""}
                    onChange={(e) => {
                      const cleaned = sanitizeMoneyInput(e.target.value);
                      onUpdateItemRef.current?.(qid, {
                        amount: parseMoneyToSatang(cleaned),
                        splitByCategory: false,
                        amountEdited: true,
                      });
                    }}
                    className="w-full outline-none text-lg font-extrabold text-gray-900 bg-transparent"
                    placeholder="0.00"
                  />
                  <div className="text-[11px] text-gray-800/55 mt-1">* แก้ยอดตรงนี้จะปิดโหมดแยกหมวด</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900/70 mb-1">วันที่</div>
                  <input
                    type="date"
                    value={q?.date || toISODate(new Date())}
                    onChange={(e) => onUpdateItemRef.current?.(qid, { date: e.target.value })}
                    className="w-full outline-none text-sm font-extrabold text-gray-900 bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ------------- STEP: Account -------------
    if (step === 1) {
      return (
        <div className="glass-panel border border-white/20 rounded-2xl p-3">
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-900/70 flex items-center gap-2">
              <CreditCard size={14} /> Account
            </div>
            <div className="text-[11px] text-gray-900/55">เลือกบัญชีให้ถูกต้องตามประเภทรายการ</div>
          </div>

          {txType === "transfer" || txType === "credit_payment" ? (
            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
                  <ArrowRightLeft size={14} /> บัญชีต้นทาง
                </div>
                <AccountPicker
                  accounts={
                    txType === "credit_payment"
                      ? Array.isArray(nonCreditAccounts) && nonCreditAccounts.length
                        ? nonCreditAccounts
                        : accounts
                      : accounts
                  }
                  value={q?.fromAccountId}
                  onChange={(v) => onUpdateItemRef.current?.(qid, { fromAccountId: v })}
                  placeholder="เลือกบัญชี"
                />
              </div>

              <div>
                <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
                  <ArrowRightLeft size={14} /> บัญชีปลายทาง
                </div>
                <AccountPicker
                  accounts={accounts}
                  value={q?.toAccountId}
                  onChange={(v) => onUpdateItemRef.current?.(qid, { toAccountId: v })}
                  placeholder="เลือกบัญชี"
                />
              </div>

              {q?.fromAccountId && q?.toAccountId && String(q.fromAccountId) === String(q.toAccountId) ? (
                <div className="text-[11px] text-amber-900/80">⚠️ เลือกบัญชีต้นทางและปลายทางเป็นบัญชีเดียวกัน</div>
              ) : null}
            </div>
          ) : (
            <div>
              <div className="text-xs font-bold text-gray-900/70 mb-2">บัญชีที่ใช้</div>

              <QuickSuggestions
                title="Quick accounts"
                selectedId={q?.accountId || ""}
                items={(() => {
                  const items = [];
                  const t = txType;
                  if (t !== "expense" && t !== "income") return [];

                  // 1) Merchant rule suggestion
                  try {
                    const md = deriveMerchantAutofillPatch(
                      {
                        merchant: q?.merchant || q?.note || "",
                        txType: t,
                        categoryId: "",
                        accountId: "",
                      },
                      merchantsList
                    );
                    const mdAccId = String(md?.accountId || "").trim();
                    if (mdAccId) {
                      const acc = (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === mdAccId) || null;
                      if (acc) {
                        items.push({
                          id: mdAccId,
                          label: String(acc?.name || "").trim() || "บัญชี",
                          badge: "ร้านนี้",
                          icon: getAccountVisual(acc),
                        });
                      }
                    }
                  } catch {
                    // ignore
                  }

                  // 2) Suggested from history (scan)
                  const histId = String(q?.suggestedAccountId || "").trim();
                  if (histId && !items.some((x) => String(x?.id || "") === histId)) {
                    const acc = (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === histId) || null;
                    if (acc) {
                      items.push({
                        id: histId,
                        label: String(acc?.name || "").trim() || "บัญชี",
                        badge: "แนะนำ",
                        icon: getAccountVisual(acc),
                      });
                    }
                  }

                  // 3) Recents
                  const rec = (recentAccountsByType?.[t] || []).slice(0, 8);
                  for (const acc of rec) {
                    const id = String(acc?.id || "").trim();
                    if (!id) continue;
                    if (items.some((x) => String(x?.id || "") === id)) continue;
                    items.push({
                      id,
                      label: String(acc?.name || "").trim() || "บัญชี",
                      badge: "ล่าสุด",
                      icon: getAccountVisual(acc),
                    });
                    if (items.length >= 6) break;
                  }

                  const cur = String(q?.accountId || "").trim();
                  return items.filter((x) => String(x?.id || "") !== cur).slice(0, 6);
                })()}
                onSelect={(id) => {
                  const v = String(id || "").trim();
                  if (!v) return;
                  const acc = (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === v) || null;
                  const patch = { accountId: v };
                  if (!isCreditAccount(acc)) patch.isInstallment = false;
                  onUpdateItemRef.current?.(qid, patch);
                }}
                className="mb-3"
              />

              <AccountChipsPicker
                accounts={accounts}
                value={q?.accountId}
                onChange={(v) => {
                  const acc =
                    (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === String(v || "")) || null;
                  const patch = { accountId: v };
                  if (!isCreditAccount(acc)) patch.isInstallment = false;
                  onUpdateItemRef.current?.(qid, patch);
                }}
                showTitle={false}
                showSelectedText
                density="compact"
                mobileSingleRow
              />
            </div>
          )}
        </div>
      );
    }

    // ------------- STEP: Category / Split -------------
    if (step === 2) {
      if (txType !== "expense" && txType !== "income") {
        return (
          <div className="glass-panel border border-white/20 rounded-2xl p-3">
            <div className="text-xs font-bold text-gray-900/70 flex items-center gap-2">
              <Sparkles size={14} /> Category
            </div>
            <div className="mt-2 text-[12px] text-gray-900/60">ประเภทนี้ไม่ต้องเลือกหมวดหมู่</div>
          </div>
        );
      }

      // Multi-item receipt (expense)
      if (hasGroups) {
        // Enforce splitByCategory for multi-item (handled automatically in the store/flow, but we show UI for it here)
        return (
          <div className="space-y-3">
            <div className="glass-panel border border-white/20 rounded-2xl p-3">
              <div className="text-xs font-bold text-gray-900/70 flex items-center gap-2">
                <Sparkles size={14} /> Multi-item Receipt
              </div>
              <div className="text-[11px] text-gray-900/55 mt-1">
                ใบเสร็จนี้มีหลายรายการ ระบบจะให้เลือกหมวดหมู่แยกตามรายบรรทัด (Split details)
              </div>
            </div>

            <SplitDetailsEditor
              qid={qid}
              groups={q?.groups || []}
              categories={expenseCatsAll}
              parentCategoryId=""
              onChangeParentCategory={null}
              onChangeGroup={(idx, patch) => onUpdateGroup?.(qid, idx, patch)}
              onChangeGroups={(nextGroups) => onUpdateItemRef.current?.(qid, { groups: nextGroups })}
              targetTotalSatang={q?.amount}
            />
          </div>
        );
      }

      // Single-item (or income) => normal category picker + suggestions
      const t = txType;
      const byId = catIndexByType?.[t]?.byId || new Map();

      return (
        <div className="glass-panel border border-white/20 rounded-2xl p-3">
          <div className="mb-3">
            <div className="text-xs font-bold text-gray-900/70 flex items-center gap-2">
              <Sparkles size={14} /> Category
            </div>
            <div className="text-[11px] text-gray-900/55">ใช้คำแนะนำเร็ว แล้วค่อยยืนยันหมวดหลัก</div>
          </div>

          <QuickSuggestions
            title="Quick suggestions"
            selectedId={q?.categoryId || ""}
            items={(() => {
              const items = [];

              // 1) Merchant rule suggestion
              try {
                const md = deriveMerchantAutofillPatch(
                  {
                    merchant: q?.merchant || q?.note || "",
                    txType: t,
                    categoryId: "",
                    accountId: "",
                  },
                  merchantsList
                );
                const mdCatId = String(md?.categoryId || "").trim();
                const mdCat = mdCatId ? byId.get(mdCatId) : null;
                if (mdCat && mdCatId) {
                  const pid = String(mdCat?.parentId || "").trim();
                  const parent = pid ? byId.get(pid) : null;
                  items.push({
                    id: mdCatId,
                    label: String(mdCat?.name || "").trim() || "หมวด",
                    badge: parent ? String(parent?.name || "").trim() : "ร้านนี้",
                    icon: { kind: "emoji", value: mdCat?.icon || "🏷️" },
                  });
                }
              } catch {
                // ignore
              }

              // 2) Suggested from history (scan)
              const histId = String(q?.suggestedCategoryId || "").trim();
              if (histId && !items.some((x) => String(x?.id || "") === histId)) {
                const c = byId.get(histId);
                if (c && !isTombstoneCategory(c)) {
                  const pid = String(c?.parentId || "").trim();
                  const parent = pid ? byId.get(pid) : null;
                  items.push({
                    id: histId,
                    label: String(c?.name || "").trim() || "หมวด",
                    badge: parent ? String(parent?.name || "").trim() : "แนะนำ",
                    icon: { kind: "emoji", value: c?.icon || "🏷️" },
                  });
                }
              }

              // 3) Recents
              const rec = (recentCatsByType?.[t] || []).slice(0, 10);
              for (const c of rec) {
                const id = String(c?.id || "").trim();
                if (!id) continue;
                if (items.some((x) => String(x?.id || "") === id)) continue;
                if (isTombstoneCategory(c)) continue;

                const pid = String(c?.parentId || "").trim();
                const parent = pid ? byId.get(pid) : null;

                items.push({
                  id,
                  label: String(c?.name || "").trim() || "หมวด",
                  badge: parent ? String(parent?.name || "").trim() : "ล่าสุด",
                  icon: { kind: "emoji", value: c?.icon || "🏷️" },
                });
                if (items.length >= 7) break;
              }

              const cur = String(q?.categoryId || "").trim();
              return items.filter((x) => String(x?.id || "") !== cur).slice(0, 7);
            })()}
            onSelect={(id) => {
              const v = String(id || "").trim();
              if (!v) return;
              onUpdateItemRef.current?.(qid, { categoryId: v, categoryConfirmedByUser: true });
            }}
            className="mb-3"
          />

          <div className="text-xs font-bold text-gray-900/70 mb-2">เลือกหมวดหลัก</div>
          <CategoryPicker
            categories={primaryCats}
            value={q?.categoryId || ""}
            onChange={(id) => onUpdateItemRef.current?.(qid, { categoryId: id, categoryConfirmedByUser: true })}
            showTitle={false}
            twoStep
            recent={recentCats}
            maxListHeightClass="max-h-[45dvh]"
          />
        </div>
      );
    }

    // ------------- STEP: Notes -------------
    if (step === 3) {
      const acc =
        (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === String(q?.accountId || "")) || null;
      const installmentEligible = txType === "expense" && !q?.splitByCategory && isCreditAccount(acc);

      return (
        <div className="space-y-3">
          <div className="glass-panel border border-white/20 rounded-2xl p-3">
            <div className="mb-3">
              <div className="text-xs font-bold text-gray-900/70 flex items-center gap-2">
                <FileText size={14} /> Notes & Options
              </div>
              <div className="text-[11px] text-gray-900/55">เพิ่มโน้ต/อ้างอิง และตัวเลือกเพิ่มเติม</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-gray-900/70 mb-1">ชื่อร้าน / Merchant</div>
                <input
                  type="text"
                  value={q?.merchant || ""}
                  onChange={(e) => onUpdateItemRef.current?.(qid, { merchant: e.target.value })}
                  className="w-full ui-input"
                  placeholder="เช่น 7-11, Starbucks"
                />
              </div>

              <div>
                <div className="text-xs font-bold text-gray-900/70 mb-1">โน้ต</div>
                <textarea
                  rows={3}
                  value={q?.note || ""}
                  onChange={(e) => onUpdateItemRef.current?.(qid, { note: e.target.value })}
                  className="w-full ui-input"
                  placeholder="เช่น รายละเอียดเพิ่มเติม"
                />
              </div>

              <div>
                <div className="text-xs font-bold text-gray-900/70 mb-1">Ref / เลขอ้างอิง</div>
                <input
                  type="text"
                  value={q?.referenceId || q?.ref || ""}
                  onChange={(e) => onUpdateItemRef.current?.(qid, { ref: e.target.value, referenceId: e.target.value })}
                  className="w-full ui-input"
                  placeholder="(ถ้ามี)"
                />
              </div>

              {installmentEligible ? (
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-gray-900/75">ผ่อนชำระ (Installment)</div>
                      <div className="text-[11px] text-gray-900/55">ใช้ได้เฉพาะ Expense + บัญชีบัตร + ไม่ split</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateItemRef.current?.(qid, { isInstallment: !q?.isInstallment })}
                      className={`w-14 h-8 rounded-full transition-all relative border ${
                        q?.isInstallment ? "bg-gray-900/90 border-white/20" : "bg-white/20 border-white/20"
                      }`}
                      aria-label="toggle installment"
                    >
                      <span
                        className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                          q?.isInstallment ? "left-7" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  {q?.isInstallment ? (
                    <div className="mt-3">
                      <div className="text-[11px] font-extrabold text-gray-900/70 mb-1">จำนวนงวด</div>
                      <select
                        value={String(q?.installmentMonths || 3)}
                        onChange={(e) => onUpdateItemRef.current?.(qid, { installmentMonths: Number(e.target.value) || 3 })}
                        className="ui-select w-full"
                      >
                        {[3, 4, 5, 6, 8, 10, 12].map((m) => (
                          <option key={m} value={m}>
                            {m} เดือน
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Receipt breakdown (only when saving as 1 tx) */}
          {txType === "expense" && !q?.splitByCategory && hasReceiptLines ? (
            <div className="glass-panel border border-white/20 rounded-2xl p-3">
              <div className="text-xs font-bold text-gray-900/70 mb-2">ใบเสร็จ (รายละเอียด)</div>
              <div className="space-y-2">
                {(q.groups || [])
                  .filter((g) => Number(g?.amount || 0) > 0)
                  .map((g, idx) => {
                    const isAdj = isAdjustmentLike(g);
                    const effect = String(g?.adjustmentEffect || "").toLowerCase().trim();
                    const sign = isAdj ? (effect === "subtract" ? "-" : "+") : "";
                    const cat = (expenseCatsAll || []).find((c) => String(c?.id || "") === String(g?.categoryId || "")) || null;
                    const title = String(g?.note || "").trim() || cat?.name || "—";
                    const subtitle =
                      cat && title !== cat.name ? cat.name : isAdj ? (effect === "subtract" ? "ส่วนลด" : "ค่าธรรมเนียม") : "";
                    return (
                      <div key={idx} className="rounded-2xl bg-white/10 border border-white/15 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-gray-900/80 truncate">{title}</div>
                            {subtitle ? <div className="text-[11px] text-gray-900/55 truncate">{subtitle}</div> : null}
                          </div>
                          <div className="shrink-0 text-[12px] font-black text-gray-900">
                            {sign}
                            {formatCurrency(Math.abs(Number(g.amount) || 0))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    // ------------- STEP: Done -------------
    if (step === 4) {
      const t = txType;
      const acc =
        (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === String(q?.accountId || "")) || null;

      const cat =
        (t === "expense"
          ? (expenseCatsAll || []).find((c) => String(c?.id || "") === String(q?.categoryId || ""))
          : t === "income"
          ? (incomeCatsAll || []).find((c) => String(c?.id || "") === String(q?.categoryId || ""))
          : null) || null;

      return (
        <div className="glass-panel border border-white/20 rounded-2xl p-3">
          <div className="text-xs font-bold text-gray-900/70 mb-2 flex items-center gap-2">
            <Check size={14} /> Summary
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-gray-900/60">ประเภท</div>
              <div className="font-extrabold text-gray-900">{t || "—"}</div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-gray-900/60">ยอด</div>
              <div className="font-extrabold text-gray-900">{formatCurrency(Math.abs(Number(q?.amount) || 0))}</div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-gray-900/60">วันที่</div>
              <div className="font-extrabold text-gray-900">{q?.date || "—"}</div>
            </div>

            {t === "transfer" || t === "credit_payment" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-gray-900/60">From</div>
                  <div className="font-extrabold text-gray-900 truncate max-w-[14rem]">
                    {accounts?.find((a) => String(a?.id || "") === String(q?.fromAccountId || ""))?.name || "—"}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-gray-900/60">To</div>
                  <div className="font-extrabold text-gray-900 truncate max-w-[14rem]">
                    {accounts?.find((a) => String(a?.id || "") === String(q?.toAccountId || ""))?.name || "—"}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-900/60">บัญชี</div>
                <div className="font-extrabold text-gray-900 truncate max-w-[14rem]">{acc?.name || "—"}</div>
              </div>
            )}

            {t === "expense" || t === "income" ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-900/60">หมวดหลัก</div>
                <div className="font-extrabold text-gray-900 truncate max-w-[14rem]">
                  {cat ? `${cat.icon || "🏷️"} ${cat.name}` : "—"}
                </div>
              </div>
            ) : null}

            {q?.merchant ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-900/60">ร้าน</div>
                <div className="font-extrabold text-gray-900 truncate max-w-[14rem]">{q.merchant}</div>
              </div>
            ) : null}

            {q?.duplicate ? (
              <div className="mt-2 text-[11px] text-amber-900/70">⚠️ รายการนี้ถูกมองว่าอาจซ้ำ (เช็ค badge ในคิว)</div>
            ) : null}

            <div className="mt-3 text-[11px] text-gray-900/55">
              กด “{doneLabel}” เพื่อปิดหน้าต่างนี้
            </div>
          </div>
        </div>
      );
    }

    return null;
  }, [
    step,
    q,
    qid,
    txType,
    hasGroups,
    nonAdjGroupCount,
    accounts,
    onTypeChange,
    onUpdateItem,
    onUpdateGroup,
    expenseCatsAll,
    incomeCatsAll,
    primaryCats,
    recentCats,
    recentCatsByType,
    recentAccountsByType,
    catIndexByType,
    merchants,
    doneLabel,
  ]);

  if (!isOpen || !q) return null;

  const dupKind = q?.duplicateInfo?.kind || (q?.duplicate ? "fuzzy" : "");
  const dupBadgeText =
    dupKind === "ref" ? "Duplicate (Ref)" : dupKind === "file" ? "Duplicate (File)" : "Possible duplicate";

  return (
    <ModalShell title={title} onClose={onClose} isOpen={isOpen} maxWidth="sm:max-w-lg" maxHeight="max-h-[92dvh]">
      {/* Duplicate toggle */}
      {q?.duplicate ? (
        <div className="glass-panel border border-amber-500/20 rounded-2xl p-3 mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-amber-800 flex items-center gap-2">
              <AlertTriangle size={16} /> {dupBadgeText}
            </div>
            <div className="text-[12px] text-amber-800/80">
              ระบบจะกันรายการนี้ไว้ก่อนเพื่อป้องกันซ้ำ (คุณสามารถเปิดเพื่อบันทึกซ้ำได้)
            </div>

            {q?.duplicateInfo ? (
              <div className="mt-2 text-[11px] text-amber-900/70">
                <div>
                  {q.duplicateInfo.kind === "ref"
                    ? "สาเหตุ: Ref ตรงกัน"
                    : q.duplicateInfo.kind === "file"
                    ? "สาเหตุ: ไฟล์ซ้ำ (เหมือนเดิม)"
                    : `ความเหมือน ~${Math.round((q.duplicateInfo.score || 0) * 100)}%`}
                </div>
                {Array.isArray(q?.duplicateInfo?.reasons) && q.duplicateInfo.reasons.length ? (
                  <div className="mt-1 truncate">• {q.duplicateInfo.reasons.join(" • ")}</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onUpdateItem?.(qid, { includeDuplicate: !q?.includeDuplicate })}
            className={`w-14 h-8 rounded-full transition-all relative border ${
              q?.includeDuplicate ? "bg-gray-900/90 border-white/20" : "bg-white/20 border-white/20"
            }`}
            aria-label="toggle include duplicate"
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                q?.includeDuplicate ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>
      ) : null}

      {/* Stepper header */}
      <div className="mb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {steps.map((s, idx) => (
            <StepPill
              key={s.key}
              active={idx === step}
              done={idx < step}
              index={idx}
              label={s.label}
              icon={s.icon}
              onClick={() => setStep(idx)}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-6">{stepContent}</div>

      {/* Sticky footer */}
      <div className="shrink-0 -mx-6 px-6 pt-3 bg-white/5 backdrop-blur-3xl border-t border-gray-200/20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canGoBack}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={`flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 border ${
              canGoBack ? "bg-white border-gray-200 text-gray-800" : "bg-white/50 border-gray-100 text-gray-400"
            }`}
          >
            <ChevronLeft size={16} /> ย้อนกลับ
          </button>

          <button
            type="button"
            onClick={() => {
              if (canGoNext) {
                setStep((s) => Math.min(steps.length - 1, s + 1));
              } else {
                // Validation for multi-item receipt before Done
                if (hasGroups) {
                  const missingIdx = (q?.groups || []).findIndex(g => !String(g?.categoryId || "").trim());
                  if (missingIdx !== -1) {
                    alert("กรุณาเลือกหมวดหมู่ให้ครบทุกบรรทัดในหน้า Split ก่อนบันทึก");
                    setStep(2); // Jump back to Split step
                    return;
                  }
                }
                doneFn?.();
              }
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 active:scale-95"
          >
            {canGoNext ? (
              <>
                ถัดไป <ChevronRight size={16} />
              </>
            ) : (
              doneLabel
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
