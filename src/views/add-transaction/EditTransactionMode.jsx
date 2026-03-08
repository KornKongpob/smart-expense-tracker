import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  Layers,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import AmountField from "../../components/AmountField";
import AccountPicker from "../../components/AccountPicker";
import AccountChipsPicker from "../../components/AccountChipsPicker";
import TagsInput from "../../components/TagsInput";
import { isCreditAccount } from "../../utils/accountMatch";
import { cn } from "../../utils/cn";
import { formatCurrency } from "../../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../../utils/money";
import CategoryCardPicker from "./CategoryCardPicker";

function SectionTab({ active, icon, label, onClick, badge }) {
  const IconComponent = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-extrabold transition-all active:scale-95",
        active
          ? "bg-gray-900/90 text-white border-white/15 shadow-sm"
          : "bg-white/45 text-gray-900/70 border-white/30 hover:bg-white/70"
      )}
    >
      <IconComponent size={16} />
      <span>{label}</span>
      {badge ? (
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full text-[10px] font-black",
            active ? "bg-white/15 text-white" : "bg-gray-900/8 text-gray-900/70"
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function SectionCard({ title, subtitle, icon, actions, children }) {
  const IconComponent = icon;

  return (
    <section className="ui-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-white/70 border border-slate-900/10 flex items-center justify-center shrink-0">
            <IconComponent size={18} className="text-gray-900" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-gray-900 tracking-tight">{title}</div>
            {subtitle ? <div className="mt-0.5 text-[12px] font-bold text-gray-800/60">{subtitle}</div> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryBadge({ children, tone = "default" }) {
  const toneClass =
    tone === "indigo"
      ? "bg-indigo-600/10 text-indigo-800 border-indigo-600/15"
      : tone === "emerald"
      ? "bg-emerald-600/10 text-emerald-800 border-emerald-600/15"
      : tone === "amber"
      ? "bg-amber-500/12 text-amber-900 border-amber-500/20"
      : "bg-white/55 text-gray-900 border-white/30";

  return (
    <span className={cn("inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-extrabold", toneClass)}>
      {children}
    </span>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <div className="rounded-2xl bg-white/45 border border-white/25 p-3 min-w-0">
      <div className="text-[11px] font-bold text-gray-900/55 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm font-extrabold text-gray-900 truncate">{value || "-"}</div>
    </div>
  );
}

function isPopulatedSplitLine(line) {
  if (!line) return false;
  return (
    parseMoneyToSatang(line.amountDigits || "") > 0 ||
    String(line.categoryId || "").trim().length > 0 ||
    String(line.lineNote || "").trim().length > 0 ||
    String(line.txId || "").trim().length > 0
  );
}

function getTypeMeta(type) {
  if (type === "income") return { label: "รายรับ", tone: "emerald" };
  if (type === "transfer") return { label: "โอนเงิน", tone: "default" };
  if (type === "credit_payment") return { label: "ชำระบัตร", tone: "indigo" };
  return { label: "รายจ่าย", tone: "amber" };
}

export default function EditTransactionMode(props) {
  const {
    initialData,
    type,
    onSelectType,
    amountDigits,
    setAmountDigits,
    amountNumber,
    splitTotalDigits,
    splitTotalNumber,
    isSplitMode,
    toggleSplitMode,
    budgetHint,
    date,
    setDate,
    note,
    setNote,
    accountId,
    setAccountId,
    accounts,
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    nonCreditAccounts,
    creditAccounts,
    selectedToAcc,
    creditDebt,
    applyPayFull,
    categoryId,
    setCategoryId,
    expenseCatsAll,
    incomeCatsAll,
    categoryPickerOptions,
    splitLines,
    splitLabel,
    setSplitLabel,
    updateSplitLine,
    addSplitLine,
    removeSplitLine,
    refValue,
    setRef,
    tags,
    setTags,
    allTagsFromHistory,
    initialAttachmentId,
    attachmentUrl,
    attachmentMimeType,
    isSaving,
    onSave,
    onDelete,
  } = props;

  const [activeSection, setActiveSection] = useState(isSplitMode ? "items" : "details");
  const [expandedSplitIndex, setExpandedSplitIndex] = useState(0);

  const typeMeta = getTypeMeta(type);
  const currentAccount = useMemo(
    () => (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === String(accountId || "")) || null,
    [accounts, accountId]
  );
  const fromAccount = useMemo(
    () => (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === String(fromAccountId || "")) || null,
    [accounts, fromAccountId]
  );
  const toAccount = useMemo(
    () => (Array.isArray(accounts) ? accounts : []).find((a) => String(a?.id || "") === String(toAccountId || "")) || null,
    [accounts, toAccountId]
  );

  const categorySource = type === "income" ? incomeCatsAll : expenseCatsAll;
  const categoryById = useMemo(() => {
    const map = new Map();
    for (const cat of Array.isArray(categorySource) ? categorySource : []) {
      const id = String(cat?.id || "").trim();
      if (id) map.set(id, cat);
    }
    return map;
  }, [categorySource]);

  const currentCategory = useMemo(() => {
    const id = String(categoryId || "").trim();
    return id ? categoryById.get(id) || null : null;
  }, [categoryById, categoryId]);

  const populatedSplitLines = useMemo(
    () => (Array.isArray(splitLines) ? splitLines.filter(isPopulatedSplitLine) : []),
    [splitLines]
  );
  const incompleteSplitCount = useMemo(() => {
    return populatedSplitLines.filter((line) => {
      const amount = parseMoneyToSatang(line.amountDigits || "");
      return !String(line.categoryId || "").trim() || amount <= 0;
    }).length;
  }, [populatedSplitLines]);

  const sections = useMemo(() => {
    const list = [
      { id: "details", label: "หลัก", icon: Sparkles },
      { id: "accounts", label: "บัญชี", icon: CreditCard },
    ];
    if (type !== "transfer" && type !== "credit_payment") {
      list.push({
        id: "items",
        label: isSplitMode ? "หลายรายการ" : "หมวด",
        icon: Layers,
        badge: isSplitMode ? String(Math.max(populatedSplitLines.length, 2)) : "",
      });
    }
    list.push({ id: "advanced", label: "เพิ่มเติม", icon: FileText });
    return list;
  }, [type, isSplitMode, populatedSplitLines.length]);

  useEffect(() => {
    const ids = sections.map((section) => section.id);
    if (!ids.includes(activeSection)) {
      setActiveSection(ids[0] || "details");
    }
  }, [sections, activeSection]);

  useEffect(() => {
    if (isSplitMode) {
      setActiveSection("items");
    }
  }, [isSplitMode]);

  useEffect(() => {
    if (expandedSplitIndex >= splitLines.length) {
      setExpandedSplitIndex(Math.max(0, splitLines.length - 1));
    }
  }, [expandedSplitIndex, splitLines.length]);

  const headerTitle = useMemo(() => {
    const raw = String(note || initialData?.merchant || "").trim();
    if (raw) return raw;
    if (isSplitMode) return splitLabel || "หลายรายการในกลุ่มเดียวกัน";
    return "ยังไม่ได้ใส่รายละเอียด";
  }, [note, initialData?.merchant, isSplitMode, splitLabel]);

  const accountSummary = useMemo(() => {
    if (type === "transfer" || type === "credit_payment") {
      if (!fromAccount && !toAccount) return "เลือกบัญชีต้นทางและปลายทาง";
      return `${fromAccount?.name || "ต้นทาง"} -> ${toAccount?.name || "ปลายทาง"}`;
    }
    return currentAccount?.name || "ยังไม่ได้เลือกบัญชี";
  }, [type, fromAccount, toAccount, currentAccount]);

  const categorySummary = useMemo(() => {
    if (type === "transfer" || type === "credit_payment") return "ไม่ต้องเลือกหมวด";
    if (isSplitMode) return `${Math.max(populatedSplitLines.length, 2)} รายการย่อย`;
    if (currentCategory?.name) return currentCategory.name;
    return "ยังไม่ได้เลือกหมวด";
  }, [type, isSplitMode, populatedSplitLines.length, currentCategory]);

  const saveDisabled = useMemo(() => {
    if (isSaving) return true;
    if (type === "transfer" || type === "credit_payment") {
      return !amountNumber || !fromAccountId || !toAccountId || String(fromAccountId) === String(toAccountId);
    }
    if (isSplitMode) {
      return !accountId || populatedSplitLines.length < 2 || incompleteSplitCount > 0;
    }
    return !amountNumber || !accountId || !String(categoryId || "").trim();
  }, [
    isSaving,
    type,
    amountNumber,
    fromAccountId,
    toAccountId,
    isSplitMode,
    accountId,
    populatedSplitLines.length,
    incompleteSplitCount,
    categoryId,
  ]);

  const footerHint = useMemo(() => {
    if (type === "transfer" || type === "credit_payment") {
      if (!amountNumber) return "ระบุจำนวนเงินก่อนบันทึก";
      if (!fromAccountId || !toAccountId) return "เลือกบัญชีต้นทางและปลายทางให้ครบ";
      if (String(fromAccountId) === String(toAccountId)) return "บัญชีต้นทางและปลายทางต้องไม่ซ้ำกัน";
      return "พร้อมบันทึกการแก้ไข";
    }
    if (isSplitMode) {
      if (populatedSplitLines.length < 2) return "Split ต้องมีอย่างน้อย 2 รายการย่อย";
      if (incompleteSplitCount > 0) return `ยังมี ${incompleteSplitCount} รายการย่อยที่ข้อมูลไม่ครบ`;
      return `รวม ${populatedSplitLines.length} รายการย่อย • ${formatCurrency(splitTotalNumber)}`;
    }
    if (!amountNumber) return "ระบุจำนวนเงินก่อนบันทึก";
    if (!String(categoryId || "").trim()) return "เลือกหมวดหมู่ก่อนบันทึก";
    return budgetHint || "พร้อมบันทึกการแก้ไข";
  }, [
    type,
    amountNumber,
    fromAccountId,
    toAccountId,
    isSplitMode,
    populatedSplitLines.length,
    incompleteSplitCount,
    splitTotalNumber,
    categoryId,
    budgetHint,
  ]);

  return (
    <>
      <div className="space-y-4 mb-32">
        <section className="glass-card rounded-[28px] p-4 md:p-5">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <SummaryBadge tone={typeMeta.tone}>{typeMeta.label}</SummaryBadge>
                {isSplitMode ? <SummaryBadge tone="indigo">หลายรายการ</SummaryBadge> : null}
                {initialAttachmentId ? <SummaryBadge>มีไฟล์แนบ</SummaryBadge> : null}
              </div>

              <div className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-gray-900 tabular-nums">
                {formatCurrency(isSplitMode ? splitTotalNumber : amountNumber || 0)}
              </div>

              <div className="mt-2 text-sm font-bold text-gray-900/60">
                {date || "-"} • {accountSummary}
              </div>
              <div className="mt-1 text-sm font-bold text-gray-900/55">{categorySummary}</div>
              <div className="mt-3 text-base font-extrabold text-gray-900 wrap-anywhere">{headerTitle}</div>
            </div>

            {initialAttachmentId ? (
              <a
                href={attachmentUrl || "#"}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 w-20 h-20 rounded-3xl overflow-hidden border border-white/25 bg-white/50 flex items-center justify-center"
                title="เปิดไฟล์แนบ"
              >
                {attachmentUrl ? (
                  String(attachmentMimeType || "").toLowerCase() === "application/pdf" ? (
                    <div className="inline-flex flex-col items-center gap-1 text-gray-900/75">
                      <FileText size={18} />
                      <span className="text-[10px] font-black">PDF</span>
                    </div>
                  ) : (
                    <img src={attachmentUrl} alt="attachment preview" className="w-full h-full object-cover" />
                  )
                ) : (
                  <FileText size={18} className="text-gray-900/70" />
                )}
              </a>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            <SummaryMetric label="วันที่" value={date || "-"} />
            <SummaryMetric label="บัญชี" value={accountSummary} />
            <SummaryMetric label={isSplitMode ? "รายการย่อย" : "หมวด"} value={categorySummary} />
            <SummaryMetric
              label={isSplitMode ? "รวมสุทธิ" : "สถานะ"}
              value={isSplitMode ? formatCurrency(splitTotalNumber) : footerHint}
            />
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {sections.map((section) => (
            <SectionTab
              key={section.id}
              active={activeSection === section.id}
              icon={section.icon}
              label={section.label}
              badge={section.badge}
              onClick={() => setActiveSection(section.id)}
            />
          ))}
        </div>

        {activeSection === "details" ? (
          <SectionCard
            title="รายละเอียดหลัก"
            subtitle="ประเภท, ยอดเงิน, วันที่ และคำอธิบายของรายการ"
            icon={Sparkles}
          >
            <div className="space-y-4">
              <div className="bg-black/5 border border-black/5 p-1.5 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-1">
                {[
                  { id: "expense", label: "รายจ่าย" },
                  { id: "income", label: "รายรับ" },
                  { id: "transfer", label: "โอนเงิน" },
                  { id: "credit_payment", label: "ชำระบัตร" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectType?.(item.id)}
                    className={cn(
                      "py-3 rounded-xl text-sm font-extrabold transition-all active:scale-[0.99]",
                      type === item.id ? "bg-gray-900/90 text-white shadow-sm" : "text-gray-800/60 hover:bg-white/40"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <AmountField
                value={isSplitMode ? splitTotalDigits : amountDigits}
                onChange={(value) => {
                  if (isSplitMode) return;
                  setAmountDigits?.(value);
                }}
                variant={type === "credit_payment" ? "transfer" : type}
                label={isSplitMode ? "ยอดรวมของทั้งกลุ่ม" : "จำนวนเงิน"}
                helper={isSplitMode ? "ยอดรวมคำนวณจากรายการย่อยด้านล่าง" : budgetHint}
                disabled={isSplitMode}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="ui-label mb-1">วันที่</div>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 border border-indigo-600/15 flex items-center justify-center shrink-0">
                      <Calendar size={16} className="text-indigo-700" />
                    </div>
                    <input type="date" value={date} onChange={(e) => setDate?.(e.target.value)} className="ui-input flex-1" />
                  </div>
                </div>

                <div>
                  <div className="ui-label mb-1">{isSplitMode ? "ชื่อกลุ่ม / โน้ต" : "ร้าน / โน้ต"}</div>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-600/15 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-amber-700" />
                    </div>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote?.(e.target.value)}
                      placeholder={
                        type === "credit_payment"
                          ? "ธนาคาร/บัตร/รายละเอียด"
                          : isSplitMode
                          ? "ชื่อกลุ่ม หรือรายละเอียดรวม"
                          : "ชื่อร้าน หรือรายละเอียด"
                      }
                      className="ui-input flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {activeSection === "accounts" ? (
          <SectionCard
            title={type === "transfer" ? "บัญชีโอน" : type === "credit_payment" ? "บัญชีชำระบัตร" : "บัญชีที่ใช้"}
            subtitle={
              type === "transfer"
                ? "เลือกบัญชีต้นทางและปลายทางของรายการโอน"
                : type === "credit_payment"
                ? "เลือกบัญชีที่จ่ายและบัตรเครดิตปลายทาง"
                : "เลือกบัญชีที่ใช้กับรายการนี้"
            }
            icon={CreditCard}
          >
            {type === "transfer" || type === "credit_payment" ? (
              <div className="space-y-4">
                {type === "credit_payment" ? (
                  <div className="rounded-2xl bg-indigo-600/10 border border-indigo-600/15 p-4">
                    <div className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                      <CreditCard size={16} className="text-indigo-700" />
                      ชำระบัตรเครดิต
                    </div>
                    <div className="mt-1 text-[12px] text-gray-900/60">
                      ระบบจะบันทึกเป็นการย้ายเงินจากบัญชีจ่ายไปลดหนี้บัตร เพื่อไม่ให้นับซ้ำกับรายการรูดบัตร
                    </div>
                    {selectedToAcc && isCreditAccount(selectedToAcc) ? (
                      <div className="mt-3 text-sm font-extrabold text-gray-900">
                        ยอดค้างชำระ: <span className="tabular-nums">{formatCurrency(creditDebt)}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="ui-label mb-1">บัญชีต้นทาง</div>
                    <AccountPicker
                      accounts={type === "credit_payment" && nonCreditAccounts.length ? nonCreditAccounts : accounts}
                      value={fromAccountId}
                      onChange={setFromAccountId}
                      title="เลือกบัญชีต้นทาง"
                      placeholder="เลือกบัญชีต้นทาง"
                    />
                  </div>

                  <div>
                    <div className="ui-label mb-1">{type === "credit_payment" ? "บัตรเครดิต" : "บัญชีปลายทาง"}</div>
                    <AccountPicker
                      accounts={type === "credit_payment" ? creditAccounts : accounts}
                      value={toAccountId}
                      onChange={setToAccountId}
                      title={type === "credit_payment" ? "เลือกบัตรเครดิต" : "เลือกบัญชีปลายทาง"}
                      placeholder={type === "credit_payment" ? "เลือกบัตรเครดิต" : "เลือกบัญชีปลายทาง"}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/45 border border-white/25 p-3">
                  <div className="text-[12px] font-bold text-gray-900/60 min-w-0">
                    {String(fromAccountId || "").trim() && String(toAccountId || "").trim() && String(fromAccountId) === String(toAccountId) ? (
                      <span className="inline-flex items-center gap-1 text-amber-900">
                        <AlertTriangle size={14} /> บัญชีต้นทางและปลายทางต้องไม่เป็นบัญชีเดียวกัน
                      </span>
                    ) : type === "credit_payment" && selectedToAcc && isCreditAccount(selectedToAcc) ? (
                      `ยอดค้างชำระปัจจุบันของ ${selectedToAcc.name}: ${formatCurrency(creditDebt)}`
                    ) : (
                      "กำหนดบัญชีให้ตรงกับการเคลื่อนไหวจริงก่อนบันทึก"
                    )}
                  </div>

                  {type === "credit_payment" ? (
                    <button
                      type="button"
                      onClick={applyPayFull}
                      className="ui-btn ui-btn-secondary shrink-0"
                      disabled={!selectedToAcc || !isCreditAccount(selectedToAcc) || creditDebt <= 0}
                    >
                      จ่ายเต็มยอดค้าง
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <AccountChipsPicker
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                showTitle={false}
                showSelectedText
                mobileSingleRow
              />
            )}
          </SectionCard>
        ) : null}

        {activeSection === "items" && type !== "transfer" && type !== "credit_payment" ? (
          <SectionCard
            title={isSplitMode ? "หลายรายการในบิลเดียว" : "หมวดหมู่"}
            subtitle={
              isSplitMode
                ? "แก้ยอดและหมวดหมู่รายบรรทัด แล้วบันทึกทั้งกลุ่มพร้อมกัน"
                : "เลือกหมวดหลัก หรือเปิด Split เพื่อแยกเป็นหลายรายการย่อย"
            }
            icon={Layers}
            actions={
              <button
                type="button"
                onClick={toggleSplitMode}
                className={cn(
                  "px-4 py-2 rounded-2xl text-xs font-extrabold border active:scale-95 transition-all",
                  isSplitMode
                    ? "bg-emerald-600/90 text-white border-emerald-500/20 shadow-sm"
                    : "bg-white/70 text-gray-900 border-slate-900/10 hover:bg-white"
                )}
              >
                {isSplitMode ? "SPLIT ON" : "SPLIT OFF"}
              </button>
            }
          >
            {isSplitMode ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-white/45 border border-white/25 p-3">
                  <div className="ui-label mb-1">ชื่อกลุ่ม (ถ้ามี)</div>
                  <input
                    value={splitLabel}
                    onChange={(e) => setSplitLabel?.(e.target.value)}
                    className="ui-input"
                    placeholder='เช่น "Lotus receipt"'
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <SummaryMetric label="รายการพร้อมบันทึก" value={`${Math.max(populatedSplitLines.length - incompleteSplitCount, 0)}/${Math.max(populatedSplitLines.length, 2)}`} />
                  <SummaryMetric label="ยอดรวม" value={formatCurrency(splitTotalNumber)} />
                  <SummaryMetric label="สถานะ" value={incompleteSplitCount ? `ขาดข้อมูล ${incompleteSplitCount} บรรทัด` : "ครบถ้วน"} />
                </div>

                <div className="space-y-2">
                  {splitLines.map((line, index) => {
                    const amount = parseMoneyToSatang(line.amountDigits || "");
                    const category = categoryById.get(String(line.categoryId || "").trim()) || null;
                    const hasData = isPopulatedSplitLine(line);
                    const isValid = !hasData || (!!String(line.categoryId || "").trim() && amount > 0);
                    const isExpanded = expandedSplitIndex === index;
                    const lineTitle =
                      String(line.lineNote || "").trim() ||
                      String(category?.name || "").trim() ||
                      `รายการที่ ${index + 1}`;

                    return (
                      <div
                        key={`${line.txId || "line"}-${index}`}
                        className={cn(
                          "rounded-3xl border overflow-hidden",
                          isExpanded ? "border-gray-900/15 bg-white/65 shadow-[0_18px_44px_rgba(0,0,0,0.08)]" : "border-slate-900/10 bg-white/45"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedSplitIndex((prev) => (prev === index ? -1 : index))}
                          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left active:scale-[0.995]"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-white/70 border border-white/30 text-gray-900">
                                รายการ {index + 1}
                              </span>
                              {!isValid && hasData ? (
                                <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-amber-500/12 border border-amber-500/20 text-amber-900">
                                  ข้อมูลไม่ครบ
                                </span>
                              ) : null}
                              {isValid && hasData ? (
                                <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-emerald-600/10 border border-emerald-600/15 text-emerald-800">
                                  พร้อม
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-sm font-extrabold text-gray-900 truncate">{lineTitle}</div>
                            <div className="mt-1 text-[12px] text-gray-900/60 truncate">
                              {category?.name || "ยังไม่เลือกหมวด"} • {amount > 0 ? formatCurrency(amount) : "ยังไม่ระบุยอด"}
                            </div>
                          </div>
                          <ChevronRight
                            size={18}
                            className={cn("shrink-0 text-gray-900/45 transition-transform", isExpanded && "rotate-90")}
                          />
                        </button>

                        {isExpanded ? (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-900/8 space-y-3">
                            <div>
                              <div className="ui-label mb-1">หมวด</div>
                              <CategoryCardPicker
                                categories={categorySource}
                                value={line.categoryId || ""}
                                onChange={(id) => updateSplitLine(index, { categoryId: id })}
                                compact
                              />
                            </div>

                            <div>
                              <div className="ui-label mb-1">ยอด</div>
                              <input
                                value={line.amountDigits || ""}
                                onChange={(e) => updateSplitLine(index, { amountDigits: sanitizeMoneyInput(e.target.value) })}
                                inputMode="decimal"
                                className="ui-input"
                                placeholder="0.00"
                              />
                            </div>

                            <div>
                              <div className="ui-label mb-1">รายละเอียด</div>
                              <input
                                value={line.lineNote || ""}
                                onChange={(e) => updateSplitLine(index, { lineNote: e.target.value })}
                                className="ui-input"
                                placeholder="รายละเอียดเฉพาะบรรทัด (ถ้ามี)"
                              />
                            </div>

                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => removeSplitLine(index)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-red-500/10 border border-red-500/15 text-red-700 text-sm font-extrabold active:scale-95"
                              >
                                <Trash2 size={14} />
                                ลบบรรทัดนี้
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <button type="button" onClick={addSplitLine} className="ui-btn ui-btn-secondary w-full sm:w-auto">
                  <Plus size={14} />
                  เพิ่มรายการย่อย
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <CategoryCardPicker
                  categories={categoryPickerOptions}
                  value={categoryId}
                  onChange={setCategoryId}
                  title="เลือกหมวดหมู่"
                  helper="แสดงเป็นการ์ดเหมือนหน้า Quick Scan: เลือกหมวดหลักก่อน แล้วค่อยเลือกหมวดย่อย"
                />
              </div>
            )}
          </SectionCard>
        ) : null}

        {activeSection === "advanced" ? (
          <SectionCard title="ข้อมูลเพิ่มเติม" subtitle="ไฟล์แนบ, อ้างอิง, แท็ก และการจัดการรายการ" icon={FileText}>
            <div className="space-y-4">
              {initialAttachmentId ? (
                <div className="rounded-2xl bg-white/55 border border-slate-900/10 p-3">
                  <div className="ui-label mb-2">ไฟล์แนบ</div>
                  {attachmentUrl ? (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block rounded-2xl overflow-hidden border border-slate-900/10 bg-white/50"
                    >
                      {String(attachmentMimeType || "").toLowerCase() === "application/pdf" ? (
                        <div className="w-full min-h-[180px] max-h-72 flex items-center justify-center">
                          <div className="inline-flex items-center gap-2 text-sm font-extrabold text-gray-900/80">
                            <FileText size={18} />
                            เปิดไฟล์ PDF
                          </div>
                        </div>
                      ) : (
                        <img src={attachmentUrl} alt="attachment" className="w-full max-h-72 object-cover" />
                      )}
                    </a>
                  ) : (
                    <div className="text-sm text-gray-900/60">กำลังโหลดไฟล์…</div>
                  )}
                </div>
              ) : null}

              <div>
                <div className="ui-label mb-1">อ้างอิง</div>
                <input
                  type="text"
                  value={refValue}
                  onChange={(e) => setRef?.(e.target.value)}
                  placeholder="Ref / TRX / เลขที่รายการ"
                  className="ui-input"
                />
              </div>

              <div>
                <div className="ui-label mb-2">แท็ก / ป้ายกำกับ</div>
                <TagsInput
                  value={tags}
                  onChange={setTags}
                  allTags={allTagsFromHistory}
                  placeholder="เช่น เที่ยวญี่ปุ่น, โปรเจค A"
                />
              </div>

              <div className="rounded-2xl bg-red-500/8 border border-red-500/15 p-3">
                <div className="text-sm font-extrabold text-red-900">Danger zone</div>
                <div className="mt-1 text-[12px] text-red-900/70">
                  ลบรายการนี้ถ้าไม่ต้องการเก็บไว้ในระบบอีกต่อไป
                </div>
                <button type="button" onClick={onDelete} className="ui-btn ui-btn-danger mt-3 w-full sm:w-auto">
                  <Trash2 size={16} />
                  ลบรายการ
                </button>
              </div>
            </div>
          </SectionCard>
        ) : null}
      </div>

      <div className="fixed left-4 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom)+var(--keyboard-inset,0px))] z-40">
        <div className="ui-card-strong p-2 rounded-3xl shadow-[0_28px_70px_-50px_rgba(0,0,0,0.65)]">
          <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
            <div className="min-w-0 text-[12px] font-bold text-gray-900/65">{footerHint}</div>
            {saveDisabled ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-1 rounded-full bg-amber-500/12 border border-amber-500/20 text-amber-900 shrink-0">
                <AlertTriangle size={12} />
                ตรวจสอบก่อนบันทึก
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-1 rounded-full bg-emerald-600/10 border border-emerald-600/15 text-emerald-800 shrink-0">
                <Check size={12} />
                พร้อมบันทึก
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            className={cn("ui-btn ui-btn-primary w-full py-4 rounded-2xl", saveDisabled && "opacity-60")}
          >
            <Check size={18} />
            {isSaving ? "กำลังบันทึก…" : isSplitMode ? "บันทึกทั้งกลุ่ม" : "บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </>
  );
}
