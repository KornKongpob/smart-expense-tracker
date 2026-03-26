// src/views/RulesView.jsx
import { useMemo, useState } from "react";
import CategorySelect from "../components/CategorySelect";
import AccountPicker from "../components/AccountPicker";
import { ArrowLeft, Plus, Trash2, Edit2, ArrowUp, ArrowDown, X, Check, ToggleLeft, ToggleRight, Wand2 } from "lucide-react";
import AppHeader from "../components/AppHeader";
import ModalShell from "../components/ModalShell";
import { useAppStore } from "../store/store.jsx";
import { formatCurrency } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput, formatMoneyInputFromSatang } from "../utils/money";
import { validateAutomationRule } from "../utils/rulesEngine";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";


const TYPE_OPTIONS = [
  { value: "", label: "(ไม่ตั้งค่า)" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "credit_payment", label: "Credit Payment" },
];

export default function RulesView({ showAlert, showConfirm }) {
  const { state, navigate, upsertRule, updateRule, deleteRule, moveRule } = useAppStore();

  // Memoize based on full state object to satisfy React Compiler rule
  // (avoid preserve-manual-memoization warnings).
  const rules = useMemo(() => {
    const list = Array.isArray(state?.rules) ? state.rules : [];
    return list.slice().sort((a, b) => (Number(a?.priority) || 0) - (Number(b?.priority) || 0));
  }, [state]);

  const enabledCount = useMemo(() => rules.filter((r) => r?.enabled !== false).length, [rules]);

  const accounts = useMemo(() => state?.accounts || [], [state?.accounts]);
  const categories = useMemo(() => state?.categories || { expense: [], income: [] }, [state?.categories]);

  // (categoryOptions removed) — this was unused, and triggered no-unused-vars.

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Prevent background scroll while modal is open
  useLockBodyScroll(open);

  // form
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [keywordContains, setKeywordContains] = useState("");
  const [regex, setRegex] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [bankContains, setBankContains] = useState("");
  const [refContains, setRefContains] = useState("");
  const [fromDigitsEndsWith, setFromDigitsEndsWith] = useState("");
  const [toDigitsEndsWith, setToDigitsEndsWith] = useState("");

  const [setType, setSetType] = useState("");
  const [setCategoryId, setSetCategoryId] = useState("");
  const [setAccountId, setSetAccountId] = useState("");
  const [setFromAccountId, setSetFromAccountId] = useState("");
  const [setToAccountId, setSetToAccountId] = useState("");

  const resetForm = () => {
    setShowAdvanced(false);
    setEditingId("");
    setName("");
    setEnabled(true);
    setKeywordContains("");
    setRegex("");
    setAmountMin("");
    setAmountMax("");
    setBankContains("");
    setRefContains("");
    setFromDigitsEndsWith("");
    setToDigitsEndsWith("");
    setSetType("");
    setSetCategoryId("");
    setSetAccountId("");
    setSetFromAccountId("");
    setSetToAccountId("");
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (r) => {
    const rule = r || {};
    setEditingId(rule.id);
    setName(rule.name || "");
    setEnabled(rule.enabled !== false);
    setKeywordContains(rule.conditions?.keywordContains || "");
    setRegex(rule.conditions?.regex || "");
    setAmountMin(rule.conditions?.amountMin != null ? formatMoneyInputFromSatang(rule.conditions.amountMin, { emptyIfZero: true }) : "");
    setAmountMax(rule.conditions?.amountMax != null ? formatMoneyInputFromSatang(rule.conditions.amountMax, { emptyIfZero: true }) : "");
    setBankContains(rule.conditions?.bankContains || "");
    setRefContains(rule.conditions?.refContains || "");
    setFromDigitsEndsWith(rule.conditions?.fromDigitsEndsWith || "");
    setToDigitsEndsWith(rule.conditions?.toDigitsEndsWith || "");
    setSetType(rule.actions?.setType || "");
    setSetCategoryId(rule.actions?.setCategoryId || "");
    setSetAccountId(rule.actions?.setAccountId || "");
    setSetFromAccountId(rule.actions?.setFromAccountId || "");
    setSetToAccountId(rule.actions?.setToAccountId || "");
    setOpen(true);
  };

const applyTemplate = (tpl) => {
  // Quick-start templates (fill sensible defaults, user can edit)
  const t = String(tpl || "");
  if (t === "expense") {
    setName("Expense: keyword");
    setEnabled(true);
    setKeywordContains("7-11");
    setRegex("");
    setAmountMin("");
    setAmountMax("");
    setBankContains("");
    setRefContains("");
    setFromDigitsEndsWith("");
    setToDigitsEndsWith("");

    setSetType("expense");
    setSetCategoryId("");
    setSetAccountId("");
    setSetFromAccountId("");
    setSetToAccountId("");

    setShowAdvanced(false);
    return;
  }

  if (t === "transfer") {
    setName("Transfer: between my accounts");
    setEnabled(true);
    setKeywordContains("");
    setRegex("");
    setAmountMin("");
    setAmountMax("");
    setBankContains("");
    setRefContains("");
    // ใส่เลขท้ายเป็นตัวอย่างให้เห็นรูปแบบ (แก้เป็นของคุณได้)
    setFromDigitsEndsWith("1234");
    setToDigitsEndsWith("5678");

    setSetType("transfer");
    setSetCategoryId("transfer");
    setSetAccountId("");
    setSetFromAccountId("");
    setSetToAccountId("");

    setShowAdvanced(true);
    return;
  }

  if (t === "credit_payment") {
    setName("Pay credit card");
    setEnabled(true);
    setKeywordContains("PAYMENT");
    setRegex("");
    setAmountMin("");
    setAmountMax("");
    setBankContains("");
    setRefContains("");
    setFromDigitsEndsWith("");
    setToDigitsEndsWith("");

    setSetType("credit_payment");
    setSetCategoryId("transfer");
    setSetAccountId("");
    setSetFromAccountId("");
    setSetToAccountId("");

    setShowAdvanced(false);
    return;
  }
};


  const onSave = () => {
    const payload = {
      id: editingId || undefined,
      name: String(name || "").trim() || "Automation Rule",
      enabled,
      conditions: {
        keywordContains: keywordContains.trim(),
        regex: regex.trim(),
        amountMin: amountMin.trim() === "" ? null : parseMoneyToSatang(amountMin),
        amountMax: amountMax.trim() === "" ? null : parseMoneyToSatang(amountMax),
        bankContains: bankContains.trim(),
        refContains: refContains.trim(),
        fromDigitsEndsWith: fromDigitsEndsWith.trim(),
        toDigitsEndsWith: toDigitsEndsWith.trim(),
      },
      actions: {
        setType: setType || "",
        setCategoryId: setCategoryId || "",
        setAccountId: setAccountId || "",
        setFromAccountId: setFromAccountId || "",
        setToAccountId: setToAccountId || "",
      },
    };

    const v = validateAutomationRule(payload);
    if (!v.ok) return showAlert?.(v.error || "Rule invalid");

    // small UX warnings (not blocking)
    const hasActions = Object.values(payload.actions || {}).some((x) => String(x || "").trim());
    if (!hasActions) {
      return showAlert?.("Rule นี้ยังไม่มี Action (จะไม่ทำอะไรเมื่อ match)");
    }

    upsertRule(payload);
    setOpen(false);
    showAlert?.("บันทึก Rule แล้ว");
  };

  const onDelete = (id) => {
    showConfirm?.("ลบ Rule", "ยืนยันลบ Rule นี้?", () => {
      deleteRule(id);
      showAlert?.("ลบ Rule แล้ว");
    }, true);
  };

  const toggleEnabled = (r) => {
    updateRule(r.id, { enabled: !(r.enabled !== false) });
  };

  const summarizeConditions = (r) => {
    const c = r?.conditions || {};
    const parts = [];
    if (c.keywordContains) parts.push(`keyword contains "${c.keywordContains}"`);
    if (c.regex) parts.push(`regex ${c.regex}`);
    if (c.bankContains) parts.push(`bank contains "${c.bankContains}"`);
    if (c.refContains) parts.push(`ref contains "${c.refContains}"`);
    if (c.amountMin != null || c.amountMax != null) {
      const a = `${c.amountMin != null ? formatCurrency(c.amountMin) : '-'}…${c.amountMax != null ? formatCurrency(c.amountMax) : '-'}`;
      parts.push(`amount ${a}`);
    }
    if (c.fromDigitsEndsWith) parts.push(`from endsWith ${c.fromDigitsEndsWith}`);
    if (c.toDigitsEndsWith) parts.push(`to endsWith ${c.toDigitsEndsWith}`);
    return parts.length ? parts.join(" • ") : "(match all)";
  };

  const summarizeActions = (r) => {
    const a = r?.actions || {};
    const parts = [];
    if (a.setType) parts.push(`setType=${a.setType}`);
    if (a.setCategoryId) parts.push(`setCategory=${a.setCategoryId}`);
    if (a.setAccountId) parts.push(`setAccount=${a.setAccountId}`);
    if (a.setFromAccountId) parts.push(`from=${a.setFromAccountId}`);
    if (a.setToAccountId) parts.push(`to=${a.setToAccountId}`);
    return parts.length ? parts.join(" • ") : "(no actions)";
  };

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="กฎอัตโนมัติ"
        subtitle={`เปิดใช้งาน ${enabledCount} จาก ${rules.length} กฎ`}
        onBack={() => navigate("more")}
        right={
          <button type="button" onClick={openNew} data-testid="rules-add" className="ui-icon-btn text-gray-900 active:scale-95" aria-label="เพิ่มกฎ">
            <Plus size={18} />
          </button>
        }
      />

      <main className="ui-page pt-4 pb-6 view-flow">

      {/* Summary */}
      <div className="text-[13px] text-slate-500">เปิดใช้ {enabledCount} จาก {rules.length} กฎ</div>

      <div className="ui-card overflow-hidden">
        {rules.length ? (
          rules.map((r, idx) => (
            <div key={r.id} className={`p-4 ${idx === rules.length - 1 ? "" : "border-b glass-divider"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-gray-900 truncate">{r.name || "Automation Rule"}</div>
                    {r.enabled !== false ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-800 font-semibold">ON</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-700 font-semibold">OFF</span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/12 text-indigo-800 font-semibold">#{r.priority}</span>
                  </div>

                  <div className="text-xs text-gray-700/70 mt-1 break-words">
                    <div className="flex items-center gap-2">
                      <Wand2 size={14} className="text-gray-500" />
                      <span className="font-semibold">If:</span> {summarizeConditions(r)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Check size={14} className="text-gray-500" />
                      <span className="font-semibold">Then:</span> {summarizeActions(r)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveRule(r.id, "up")}
                      data-testid={`rules-move-up-${r.id}`}
                      className="w-9 h-9 rounded-xl glass-icon-btn text-gray-700 flex items-center justify-center active:scale-95"
                      aria-label="move up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRule(r.id, "down")}
                      data-testid={`rules-move-down-${r.id}`}
                      className="w-9 h-9 rounded-xl glass-icon-btn text-gray-700 flex items-center justify-center active:scale-95"
                      aria-label="move down"
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleEnabled(r)}
                      data-testid={`rules-toggle-${r.id}`}
                      className="w-9 h-9 rounded-xl glass-icon-btn text-gray-700 flex items-center justify-center active:scale-95"
                      aria-label="toggle"
                    >
                      {r.enabled !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      data-testid={`rules-edit-${r.id}`}
                      className="w-9 h-9 rounded-xl glass-icon-btn text-gray-700 flex items-center justify-center active:scale-95"
                      aria-label="edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      data-testid={`rules-delete-${r.id}`}
                      className="w-9 h-9 rounded-xl bg-red-600/10 text-red-700 border border-red-500/20 flex items-center justify-center active:scale-95"
                      aria-label="delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-6 text-center">
            <div className="text-gray-900 font-semibold">ยังไม่มี Automation Rules</div>
            <div className="text-xs text-gray-700/70 mt-1">กด + เพื่อสร้าง Rule เพื่อ auto-fill fields หลังสแกน</div>
          </div>
        )}
      </div>

      {open ? (
        <ModalShell title={editingId ? "Edit Rule" : "New Rule"} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-900 mb-1">Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="rules-name-input"
                placeholder="เช่น: KBank → Food expense"
                className="w-full px-3 py-2 rounded-xl glass-input"
              />
            </div>

            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl glass-chip"
            >
              <div>
                <div className="text-sm font-semibold text-gray-900">Enabled</div>
                <div className="text-xs text-gray-700/70">ปิดได้โดยไม่ต้องลบ</div>
              </div>
              <div className="text-gray-800">{enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</div>
            </button>

            <div className="glass-card rounded-2xl p-4">
  <div className="flex items-center justify-between gap-2 mb-3">
    <div className="text-sm font-semibold text-gray-900">สร้างแบบเร็ว</div>
    <div className="text-[11px] font-bold text-gray-800/60">กดเพื่อเติมค่าเริ่มต้น แล้วแก้ต่อได้</div>
  </div>
  <div className="flex flex-wrap gap-2">
    <button type="button" onClick={() => applyTemplate("expense")} className="px-3 py-2 rounded-xl bg-white/20 border border-white/30 font-semibold text-gray-900 active:scale-95">
      Expense ตาม keyword
    </button>
    <button type="button" onClick={() => applyTemplate("transfer")} className="px-3 py-2 rounded-xl bg-white/20 border border-white/30 font-semibold text-gray-900 active:scale-95">
      Transfer ระหว่างบัญชี
    </button>
    <button type="button" onClick={() => applyTemplate("credit_payment")} className="px-3 py-2 rounded-xl bg-white/20 border border-white/30 font-semibold text-gray-900 active:scale-95">
      จ่ายบัตรเครดิต
    </button>
  </div>
</div>

<div className="glass-card rounded-2xl p-4">
  <div className="flex items-center justify-between gap-2 mb-3">
    <div className="text-sm font-semibold text-gray-900">เงื่อนไข (AND)</div>
    <button
      type="button"
      onClick={() => setShowAdvanced((v) => !v)}
      className="px-3 py-1.5 rounded-xl bg-white/20 border border-white/30 font-semibold text-gray-900 active:scale-95"
    >
      {showAdvanced ? "ซ่อนขั้นสูง" : "แสดงขั้นสูง"}
    </button>
  </div>


              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-900 mb-1">ข้อความมีคำว่า (keyword)</div>
                  <input value={keywordContains} onChange={(e) => setKeywordContains(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: 7-11 / GRAB / LINE MAN" />
                  <div className="text-[11px] text-gray-700/60 mt-1">ใส่คำที่มักเจอบนสลิป/ใบเสร็จ (ไม่ต้องใส่ตัวพิมพ์ใหญ่-เล็กให้เป๊ะ)</div>
                </div>
                {showAdvanced ? (
                <div>
                  <div className="text-xs font-semibold text-gray-900 mb-1">Regex (ขั้นสูง)</div>
                  <input value={regex} onChange={(e) => setRegex(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder='เช่น: /kbank|kasikorn/i' />
                  <div className="text-[11px] text-gray-700/60 mt-1">รองรับ /pattern/flags หรือใส่เป็น pattern ตรงๆ (default i)</div>
                </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-900 mb-1">จำนวนเงินขั้นต่ำ</div>
                    <input value={amountMin} onChange={(e) => setAmountMin(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))} className="w-full px-3 py-2 rounded-xl glass-input" inputMode="decimal" placeholder="เช่น: 100.00" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900 mb-1">จำนวนเงินขั้นสูง</div>
                    <input value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" inputMode="decimal" placeholder="เช่น: 500" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-900 mb-1">ชื่อธนาคารมีคำว่า</div>
                  <input value={bankContains} onChange={(e) => setBankContains(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: SCB" />
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-900 mb-1">อ้างอิง/Ref มีคำว่า</div>
                  <input value={refContains} onChange={(e) => setRefContains(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: QR" />
                </div>
                {showAdvanced ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-900 mb-1">เลขท้ายบัญชีต้นทาง (endsWith)</div>
                    <input value={fromDigitsEndsWith} onChange={(e) => setFromDigitsEndsWith(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: 1234,5678" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900 mb-1">เลขท้ายบัญชีปลายทาง (endsWith)</div>
                    <input value={toDigitsEndsWith} onChange={(e) => setToDigitsEndsWith(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: 4321" />
                  </div>
                </div>
                ) : null}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Actions</div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-900 mb-1">ตั้งประเภท (Type)</div>
                  <select value={setType} onChange={(e) => { const v = e.target.value; setSetType(v); setSetCategoryId(""); }} className="w-full px-3 py-2 rounded-xl glass-input">
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-900 mb-1">หมวดหมู่ (Category)</div>
                  {setType === "expense" || setType === "income" ? (
                    <CategorySelect
                      categories={(setType === "income" ? (categories.income || []) : (categories.expense || []))}
                      value={setCategoryId}
                      onChange={(e) => setSetCategoryId(e.target.value)}
                      allowEmpty
                      emptyLabel="(ไม่ตั้งค่า)"
                      className="w-full px-3 py-2 rounded-xl glass-input"
                    />
                  ) : (
                    <select value={setCategoryId} disabled className="w-full px-3 py-2 rounded-xl glass-input opacity-70">
                      <option value="">(เลือก Type ก่อน)</option>
                    </select>
                  )}
                </div>
                {setType !== "transfer" && setType !== "credit_payment" ? (
                <div>
                  <div className="text-xs font-semibold text-gray-900 mb-1">บัญชี (Account)</div>
                  <AccountPicker
                    accounts={accounts}
                    value={setAccountId}
                    onChange={setSetAccountId}
                    title="เลือกบัญชี"
                    placeholder="(ไม่ตั้งค่า)"
                    allowEmpty
                    emptyLabel="(ไม่ตั้งค่า)"
                  />
                </div>
                ) : null}
                {(setType === "transfer" || setType === "credit_payment" || showAdvanced) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-900 mb-1">จากบัญชี (From)</div>
                    <AccountPicker
                      accounts={accounts}
                      value={setFromAccountId}
                      onChange={setSetFromAccountId}
                      title="เลือกบัญชีต้นทาง"
                      placeholder="(ไม่ตั้งค่า)"
                      allowEmpty
                      emptyLabel="(ไม่ตั้งค่า)"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900 mb-1">ไปบัญชี (To)</div>
                    <AccountPicker
                      accounts={accounts}
                      value={setToAccountId}
                      onChange={setSetToAccountId}
                      title="เลือกบัญชีปลายทาง"
                      placeholder="(ไม่ตั้งค่า)"
                      allowEmpty
                      emptyLabel="(ไม่ตั้งค่า)"
                    />
                  </div>
                </div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-white/20 border border-white/30 font-semibold text-gray-800 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                data-testid="rules-save"
                className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-semibold active:scale-95"
              >
                Save
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      </main>
    </div>
  );
}
