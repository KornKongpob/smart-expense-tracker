// src/views/AddTransactionView.jsx
import React, { useMemo, useRef, useState } from "react";
import { X, Trash2, Calendar, FileText, Camera, Loader, Eye, Edit2, Plus, Check, ArrowLeftRight } from "lucide-react";

import { useAppStore } from "../store/store";
import { formatCurrency } from "../utils/format";
import { ACCOUNT_ICONS } from "../constants/presets";
import { scanReceiptOpenAI } from "../services/scanOpenAI";

function sameDayISO(d) {
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())).toISOString().slice(0, 10);
}

export default function AddTransactionView({ showAlert, showConfirm }) {
  const {
    state,
    navigate,
    upsertTransaction,
    upsertTransfer,
    deleteTransaction,
    getEditingEntry,
  } = useAppStore();

  const editing = getEditingEntry();
  const isEditMode = !!editing;

  const accounts = state.accounts;
  const categories = state.categories;

  // ---------- mode ----------
  const initialMode = editing?.mode === "transfer" ? "transfer" : (editing?.type ?? "expense");
  const [mode, setMode] = useState(initialMode); // expense | income | transfer

  // ---------- common ----------
  const initialDate = editing?.date ? String(editing.date).split("T")[0] : sameDayISO(new Date());
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState(editing?.note ?? "");

  // ---------- transaction fields ----------
  const [amount, setAmount] = useState(
    typeof editing?.amount === "number" ? String(editing.amount) : (editing?.amount ? String(editing.amount) : "")
  );

  const [category, setCategory] = useState(
    editing?.mode === "transaction" ? (editing.category || "") : ""
  );

  const [accountId, setAccountId] = useState(
    editing?.mode === "transaction"
      ? (editing.accountId || accounts?.[0]?.id || "")
      : (accounts?.[0]?.id || "")
  );

  // ---------- transfer fields ----------
  const [fromAccountId, setFromAccountId] = useState(
    editing?.mode === "transfer" ? editing.fromAccountId : (accounts?.[0]?.id || "")
  );
  const [toAccountId, setToAccountId] = useState(
    editing?.mode === "transfer" ? editing.toAccountId : (accounts?.[1]?.id || accounts?.[0]?.id || "")
  );

  // ---------- scan ----------
  const inputRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [ocrStatus, setOcrStatus] = useState("");

  const isNew = !isEditMode;

  const selectedAccountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name || "",
    [accounts, accountId]
  );

  const isDirty = useMemo(() => {
    // เปรียบเทียบแบบง่าย ๆ (พอสำหรับ UX)
    const base = {
      mode: initialMode,
      date: initialDate,
      note: editing?.note ?? "",
      amount: (typeof editing?.amount === "number" ? String(editing.amount) : (editing?.amount ? String(editing.amount) : "")),
      category: editing?.mode === "transaction" ? (editing.category || "") : "",
      accountId: editing?.mode === "transaction" ? (editing.accountId || "") : "",
      fromAccountId: editing?.mode === "transfer" ? editing.fromAccountId : (accounts?.[0]?.id || ""),
      toAccountId: editing?.mode === "transfer" ? editing.toAccountId : (accounts?.[1]?.id || accounts?.[0]?.id || ""),
    };

    const now = { mode, date, note, amount, category, accountId, fromAccountId, toAccountId };

    return JSON.stringify(base) !== JSON.stringify(now);
  }, [mode, date, note, amount, category, accountId, fromAccountId, toAccountId, editing, initialMode, initialDate, accounts]);

  const close = () => {
    if (!isDirty) return navigate("dashboard");
    showConfirm?.("ยกเลิกการกรอก", "ต้องการออกโดยไม่บันทึกใช่ไหม?", () => navigate("dashboard"), false);
  };

  const handleDelete = () => {
    if (!editing) return;

    // transaction: editing.id | transfer: outId/inId มี แต่เราลบด้วย id ใดก็ได้ reducer จะลบทั้ง group
    const idToDelete = editing.mode === "transfer" ? (editing.outId || editing.inId) : editing.id;

    showConfirm?.("ลบรายการ", "ต้องการลบรายการนี้ใช่ไหม?", () => deleteTransaction(idToDelete), true);
  };

  const handleSave = () => {
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) return showAlert?.("กรุณาระบุจำนวนเงินให้ถูกต้อง");
    if (!date) return showAlert?.("กรุณาเลือกวันที่");

    if (mode === "transfer") {
      if (!fromAccountId || !toAccountId) return showAlert?.("กรุณาเลือกบัญชีให้ครบ");
      if (fromAccountId === toAccountId) return showAlert?.("บัญชีต้นทางและปลายทางต้องไม่เหมือนกัน");

      upsertTransfer({
        transferGroupId: editing?.mode === "transfer" ? editing.transferGroupId : undefined,
        outId: editing?.mode === "transfer" ? editing.outId : undefined,
        inId: editing?.mode === "transfer" ? editing.inId : undefined,
        amount: n,
        date,
        note,
        fromAccountId,
        toAccountId,
      });
      return;
    }

    if (!category) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");

    upsertTransaction({
      id: editing?.mode === "transaction" ? editing.id : undefined,
      amount: n,
      type: mode,
      category,
      accountId,
      date,
      note,
      isTransfer: false,
    });
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setOcrStatus("Uploading...");

    try {
      setScanPreview(URL.createObjectURL(file));
      setOcrStatus("Analyzing...");

      const result = await scanReceiptOpenAI(file, {
        onStatus: (s) => setOcrStatus(s),
      });

      if (result?.amount) setAmount(String(result.amount));
      if (result?.date) setDate(result.date);
      if (result?.merchant) setNote(result.merchant);

      if (result?.category) {
        const catList = categories.expense;
        const found = catList.find((c) => c.id === result.category) ||
          catList.find((c) => String(result.category).toLowerCase().includes(c.id));
        if (found) setCategory(found.id);
      }
    } catch (err) {
      console.error(err);
      showAlert?.("ไม่สามารถอ่านรูปได้ กรุณาลองรูปที่ชัดขึ้น");
    } finally {
      setIsScanning(false);
      setOcrStatus("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const headerTitle = mode === "transfer" ? "โอนเงิน" : (isEditMode ? "แก้ไขรายการ" : "บันทึกรายการใหม่");

  // ✅ ปุ่มล่างให้สมมาตรบนมือถือ: fixed + center + max width เท่ากรอบ
  const bottomBtnClass =
    "fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[430px]";

  return (
    <div className="pt-5 px-4 pb-32 min-h-dvh bg-gray-50">
      {/* header */}
      <div className="flex justify-between items-center mb-5">
        <button
          onClick={close}
          className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 shadow-sm"
          type="button"
        >
          <X size={20} />
        </button>

        <h2 className="text-base font-bold text-gray-800">{headerTitle}</h2>

        {isEditMode ? (
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shadow-sm"
            type="button"
          >
            <Trash2 size={20} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* mode tabs */}
      <div className="bg-white p-1 rounded-2xl flex mb-4 shadow-sm border border-gray-100">
        {[
          { id: "expense", label: "รายจ่าย" },
          { id: "income", label: "รายรับ" },
          { id: "transfer", label: "โอนเงิน" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setMode(t.id);
              // เมื่อสลับกลับเป็น transaction ใหม่ ให้ไม่ค้าง category ว่าง
              if (t.id !== "transfer" && !category && categories[t.id]?.[0]) setCategory(categories[t.id][0].id);
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              mode === t.id ? "bg-gray-900 text-white shadow" : "text-gray-400 hover:bg-gray-50"
            }`}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* scan preview */}
      {scanPreview && mode !== "transfer" && (
        <div className="mb-4 rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="relative">
            <img src={scanPreview} alt="Slip" className="w-full h-44 object-cover" />
            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
              <span className="text-white text-xs font-bold flex items-center gap-2">
                <Eye size={16} /> ตรวจสอบข้อมูล
              </span>
            </div>
          </div>
        </div>
      )}

      {/* amount */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 mb-4">
        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
          จำนวนเงิน
        </label>
        <div className="flex items-end gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
            className="w-full text-4xl font-extrabold tracking-tight outline-none bg-transparent text-gray-900"
            autoFocus={!isEditMode}
          />
          <span className="text-sm font-bold text-gray-400 pb-1">THB</span>
        </div>
        {amount && !Number.isNaN(Number(amount)) && mode !== "transfer" && (
          <div className="mt-2 text-xs text-gray-400">
            {selectedAccountName ? `บัญชี: ${selectedAccountName}` : ""}
          </div>
        )}
      </div>

      {/* accounts / transfer accounts */}
      {mode !== "transfer" ? (
        <div className="mb-4">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase ml-1 mb-2">บัญชีที่ใช้</h3>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
            {accounts.map((acc) => {
              const iconObj = ACCOUNT_ICONS.find((i) => i.id === acc.type) || ACCOUNT_ICONS[0];
              const isSelected = accountId === acc.id;

              return (
                <button
                  key={acc.id}
                  onClick={() => setAccountId(acc.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-max ${
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200"
                      : "bg-white text-gray-700 border-gray-200"
                  }`}
                  type="button"
                >
                  {React.cloneElement(iconObj.icon, { size: 18 })}
                  <span className="text-sm font-bold">{acc.name}</span>
                  {isSelected && <Check size={14} className="ml-1" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-1 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-800">จากบัญชี</h3>
              <ArrowLeftRight size={18} className="text-gray-300" />
            </div>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-800 outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-2">ไปบัญชี</h3>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-800 outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* scan button: only new + only expense/income */}
      {isNew && mode !== "transfer" && !scanPreview && (
        <div className="mb-4">
          <button
            onClick={openFilePicker}
            className={`w-full bg-white border-2 border-dashed rounded-2xl p-4 transition-all ${
              isScanning ? "border-indigo-400 bg-indigo-50" : "border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50"
            }`}
            type="button"
            disabled={isScanning}
          >
            <div className="flex flex-col items-center justify-center gap-2 py-1">
              {isScanning ? <Loader className="animate-spin text-indigo-600" size={24} /> : <Camera className="text-indigo-500" size={24} />}
              <span className="text-indigo-600 font-bold text-sm">{isScanning ? ocrStatus : "สแกนใบเสร็จด้วย AI"}</span>
              <span className="text-[11px] text-gray-400">แนะนำรูปชัด ๆ ไม่เอียง แสงพอดี</span>
            </div>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isScanning}
          />
        </div>
      )}

      {/* categories */}
      {mode !== "transfer" && (
        <>
          <h3 className="text-[11px] font-bold text-gray-400 uppercase ml-1 mb-2">หมวดหมู่</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {categories[mode].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                  category === cat.id
                    ? "bg-white shadow-md ring-2 ring-indigo-500 scale-[1.02]"
                    : "bg-white/70 hover:bg-white border border-transparent hover:border-gray-100"
                }`}
                type="button"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2" style={{ backgroundColor: `${cat.color}20` }}>
                  {cat.icon}
                </div>
                <span className="text-[10px] font-bold text-gray-600 truncate w-full text-center">{cat.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* date & note */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">
        <div className="flex items-center border-b border-gray-100 p-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
            <Calendar size={20} />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 outline-none text-gray-700 bg-transparent font-medium"
          />
        </div>

        <div className="flex items-center p-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mr-3">
            <FileText size={20} />
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "transfer" ? "โน้ตการโอน (ถ้ามี)" : "บันทึกช่วยจำ (ถ้ามี)"}
            className="flex-1 outline-none text-gray-700 bg-transparent font-medium"
          />
        </div>
      </div>

      {/* bottom save */}
      <button
        onClick={handleSave}
        className={`${bottomBtnClass} bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:bg-black`}
        type="button"
      >
        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
        {isEditMode ? "บันทึกการแก้ไข" : mode === "transfer" ? "ยืนยันการโอน" : "ยืนยันรายการ"}
        {amount && !Number.isNaN(Number(amount)) ? (
          <span className="ml-1 text-white/70 text-sm">({formatCurrency(Number(amount))})</span>
        ) : null}
      </button>
    </div>
  );
}
