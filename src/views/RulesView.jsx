// src/views/RulesView.jsx
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Edit2, ArrowUp, ArrowDown, X, Check, ToggleLeft, ToggleRight, Wand2 } from "lucide-react";
import { useAppStore } from "../store/store";
import { formatCurrency } from "../utils/format";
import { parseMoneyToSatang, sanitizeMoneyInput, formatMoneyInputFromSatang } from "../utils/money";
import { validateAutomationRule } from "../utils/rulesEngine";

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: "", label: "(ไม่ตั้งค่า)" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "credit_payment", label: "Credit Payment" },
];

export default function RulesView({ showAlert, showConfirm }) {
  const { state, navigate, upsertRule, updateRule, deleteRule, moveRule } = useAppStore();

  const rules = useMemo(() => {
    const list = Array.isArray(state?.rules) ? state.rules : [];
    return list.slice().sort((a, b) => (Number(a?.priority) || 0) - (Number(b?.priority) || 0));
  }, [state?.rules]);

  const enabledCount = useMemo(() => rules.filter((r) => r?.enabled !== false).length, [rules]);

  const accounts = useMemo(() => state?.accounts || [], [state?.accounts]);
  const categories = useMemo(() => state?.categories || { expense: [], income: [] }, [state?.categories]);

  const categoryOptions = useMemo(() => {
    const exp = (categories.expense || []).map((c) => ({ id: c.id, label: `Expense • ${c.name}` }));
    const inc = (categories.income || []).map((c) => ({ id: c.id, label: `Income • ${c.name}` }));
    // include special
    const special = [{ id: "transfer", label: "Special • transfer" }, { id: "adjust_balance", label: "Special • adjust_balance" }];
    return [...special, ...exp, ...inc];
  }, [categories]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    <div className="pb-28 pt-6 px-4">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate("more")}
          className="w-10 h-10 rounded-full glass-icon-btn text-gray-700 flex items-center justify-center"
          aria-label="back"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="text-center flex-1">
          <div className="text-xl font-extrabold text-gray-900">Automation Rules</div>
          <div className="text-xs text-gray-700/70 mt-0.5">
            เปิดใช้งาน {enabledCount} จาก {rules.length} กฎ
          </div>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="w-10 h-10 rounded-full bg-gray-900/90 text-white flex items-center justify-center active:scale-95"
          aria-label="add"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {rules.length ? (
          rules.map((r, idx) => (
            <div key={r.id} className={`p-4 ${idx === rules.length - 1 ? "" : "border-b glass-divider"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-extrabold text-gray-900 truncate">{r.name || "Automation Rule"}</div>
                    {r.enabled !== false ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-800 font-extrabold">ON</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-700 font-extrabold">OFF</span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/12 text-indigo-800 font-extrabold">#{r.priority}</span>
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
                      className="w-9 h-9 rounded-xl glass-icon-btn text-gray-700 flex items-center justify-center active:scale-95"
                      aria-label="move up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRule(r.id, "down")}
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
                      className="w-9 h-9 rounded-xl glass-icon-btn text-gray-700 flex items-center justify-center active:scale-95"
                      aria-label="toggle"
                    >
                      {r.enabled !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      className="w-9 h-9 rounded-xl glass-icon-btn text-gray-700 flex items-center justify-center active:scale-95"
                      aria-label="edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
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
            <div className="text-gray-900 font-extrabold">ยังไม่มี Automation Rules</div>
            <div className="text-xs text-gray-700/70 mt-1">กด + เพื่อสร้าง Rule เพื่อ auto-fill fields หลังสแกน</div>
          </div>
        )}
      </div>

      {open ? (
        <ModalShell title={editingId ? "Edit Rule" : "New Rule"} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-extrabold text-gray-900 mb-1">Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                <div className="text-sm font-extrabold text-gray-900">Enabled</div>
                <div className="text-xs text-gray-700/70">ปิดได้โดยไม่ต้องลบ</div>
              </div>
              <div className="text-gray-800">{enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</div>
            </button>

            <div className="glass-card rounded-2xl p-4">
  <div className="flex items-center justify-between gap-2 mb-3">
    <div className="text-sm font-extrabold text-gray-900">สร้างแบบเร็ว</div>
    <div className="text-[11px] font-bold text-gray-800/60">กดเพื่อเติมค่าเริ่มต้น แล้วแก้ต่อได้</div>
  </div>
  <div className="flex flex-wrap gap-2">
    <button type="button" onClick={() => applyTemplate("expense")} className="px-3 py-2 rounded-xl bg-white/20 border border-white/30 font-extrabold text-gray-900 active:scale-95">
      Expense ตาม keyword
    </button>
    <button type="button" onClick={() => applyTemplate("transfer")} className="px-3 py-2 rounded-xl bg-white/20 border border-white/30 font-extrabold text-gray-900 active:scale-95">
      Transfer ระหว่างบัญชี
    </button>
    <button type="button" onClick={() => applyTemplate("credit_payment")} className="px-3 py-2 rounded-xl bg-white/20 border border-white/30 font-extrabold text-gray-900 active:scale-95">
      จ่ายบัตรเครดิต
    </button>
  </div>
</div>

<div className="glass-card rounded-2xl p-4">
  <div className="flex items-center justify-between gap-2 mb-3">
    <div className="text-sm font-extrabold text-gray-900">เงื่อนไข (AND)</div>
    <button
      type="button"
      onClick={() => setShowAdvanced((v) => !v)}
      className="px-3 py-1.5 rounded-xl bg-white/20 border border-white/30 font-extrabold text-gray-900 active:scale-95"
    >
      {showAdvanced ? "ซ่อนขั้นสูง" : "แสดงขั้นสูง"}
    </button>
  </div>


              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-extrabold text-gray-900 mb-1">ข้อความมีคำว่า (keyword)</div>
                  <input value={keywordContains} onChange={(e) => setKeywordContains(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: 7-11 / GRAB / LINE MAN" />
                  <div className="text-[11px] text-gray-700/60 mt-1">ใส่คำที่มักเจอบนสลิป/ใบเสร็จ (ไม่ต้องใส่ตัวพิมพ์ใหญ่-เล็กให้เป๊ะ)</div>
                </div>
                {showAdvanced ? (
                <div>
                  <div className="text-xs font-extrabold text-gray-900 mb-1">Regex (ขั้นสูง)</div>
                  <input value={regex} onChange={(e) => setRegex(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder='เช่น: /kbank|kasikorn/i' />
                  <div className="text-[11px] text-gray-700/60 mt-1">รองรับ /pattern/flags หรือใส่เป็น pattern ตรงๆ (default i)</div>
                </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900 mb-1">จำนวนเงินขั้นต่ำ</div>
                    <input value={amountMin} onChange={(e) => setAmountMin(sanitizeMoneyInput(e.target.value, { maxDecimals: 2 }))} className="w-full px-3 py-2 rounded-xl glass-input" inputMode="decimal" placeholder="เช่น: 100.00" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-gray-900 mb-1">จำนวนเงินขั้นสูง</div>
                    <input value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" inputMode="decimal" placeholder="เช่น: 500" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-extrabold text-gray-900 mb-1">ชื่อธนาคารมีคำว่า</div>
                  <input value={bankContains} onChange={(e) => setBankContains(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: SCB" />
                </div>

                <div>
                  <div className="text-xs font-extrabold text-gray-900 mb-1">อ้างอิง/Ref มีคำว่า</div>
                  <input value={refContains} onChange={(e) => setRefContains(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: QR" />
                </div>
                {showAdvanced ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900 mb-1">เลขท้ายบัญชีต้นทาง (endsWith)</div>
                    <input value={fromDigitsEndsWith} onChange={(e) => setFromDigitsEndsWith(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: 1234,5678" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-gray-900 mb-1">เลขท้ายบัญชีปลายทาง (endsWith)</div>
                    <input value={toDigitsEndsWith} onChange={(e) => setToDigitsEndsWith(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input" placeholder="เช่น: 4321" />
                  </div>
                </div>
                ) : null}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <div className="text-sm font-extrabold text-gray-900 mb-3">Actions</div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-extrabold text-gray-900 mb-1">ตั้งประเภท (Type)</div>
                  <select value={setType} onChange={(e) => setSetType(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input">
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs font-extrabold text-gray-900 mb-1">หมวดหมู่ (Category)</div>
                  <select value={setCategoryId} onChange={(e) => setSetCategoryId(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input">
                    <option value="">(ไม่ตั้งค่า)</option>
                    {categoryOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {setType !== "transfer" && setType !== "credit_payment" ? (
                <div>
                  <div className="text-xs font-extrabold text-gray-900 mb-1">บัญชี (Account)</div>
                  <select value={setAccountId} onChange={(e) => setSetAccountId(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input">
                    <option value="">(ไม่ตั้งค่า)</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                ) : null}
                {(setType === "transfer" || setType === "credit_payment" || showAdvanced) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-gray-900 mb-1">จากบัญชี (From)</div>
                    <select value={setFromAccountId} onChange={(e) => setSetFromAccountId(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input">
                      <option value="">(ไม่ตั้งค่า)</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-gray-900 mb-1">ไปบัญชี (To)</div>
                    <select value={setToAccountId} onChange={(e) => setSetToAccountId(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input">
                      <option value="">(ไม่ตั้งค่า)</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-white/20 border border-white/30 font-extrabold text-gray-800 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                className="flex-1 py-3 rounded-2xl bg-gray-900/90 text-white font-extrabold active:scale-95"
              >
                Save
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
