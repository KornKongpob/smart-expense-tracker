// src/views/AddTransactionView.jsx

import React, { useMemo, useState } from "react";
import { X, Trash2, Calendar, FileText, Camera, Loader, Eye, Edit2, Plus, Check } from "lucide-react";

import { useAppStore } from "../store/store";
import { formatCurrency } from "../utils/format";
import { fileToBase64 } from "../services/gemini";
import { scanReceiptOpenAI } from "../services/scanOpenAI"; // ถ้าคุณมีไฟล์นี้อยู่แล้ว

export default function AddTransactionView({ showAlert, showConfirm }) {
  const { state, navigate, upsertTransaction, deleteTransaction, getEditingTransaction } = useAppStore();

  const initialData = getEditingTransaction();
  const isEditMode = !!initialData;

  const accounts = state.accounts;
  const categories = state.categories;

  const [type, setType] = useState(initialData?.type || "expense");
  const [amount, setAmount] = useState(initialData?.amount?.toString() || "");
  const [category, setCategory] = useState(initialData?.category || "");
  const [accountId, setAccountId] = useState(initialData?.accountId || accounts?.[0]?.id || "");
  const [date, setDate] = useState(
    initialData?.date ? String(initialData.date).split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [note, setNote] = useState(initialData?.note || "");

  const [isScanning, setIsScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [ocrStatus, setOcrStatus] = useState("");

  const handleSave = () => {
    if (!amount || isNaN(parseFloat(amount))) return showAlert?.("กรุณาระบุจำนวนเงินที่ถูกต้อง");
    if (!category) return showAlert?.("กรุณาเลือกหมวดหมู่");
    if (!accountId) return showAlert?.("กรุณาเลือกบัญชี");

    upsertTransaction({
      id: initialData?.id,
      amount: parseFloat(amount),
      type,
      category,
      accountId,
      date,
      note,
      isTransfer: initialData?.isTransfer || false,
    });
  };

  const handleDelete = () => {
    if (!initialData?.id) return;

    showConfirm?.("ลบรายการ", "ต้องการลบรายการนี้ใช่ไหม?", () => {
      deleteTransaction(initialData.id);
    }, true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setOcrStatus("กำลังอ่านรูป...");

    try {
      const { base64, mimeType, preview } = await fileToBase64(file);
      setScanPreview(preview);

      // ✅ เรียก OpenAI API ผ่าน service ของคุณ
      const result = await scanReceiptOpenAI({ base64, mimeType });

      if (result?.amount) setAmount(String(result.amount));
      if (result?.date) setDate(result.date);
      if (result?.merchant) setNote(result.merchant);

      if (result?.category) {
        const list = categories[type] || [];
        const found = list.find(
          (c) => c.id === result.category || String(result.category).toLowerCase().includes(c.id)
        );
        if (found) setCategory(found.id);
      }
    } catch (err) {
      console.error(err);
      showAlert?.("ไม่สามารถอ่านรูปภาพได้");
    } finally {
      setIsScanning(false);
      setOcrStatus("");
    }
  };

  const selectedAccountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name || "",
    [accounts, accountId]
  );

  return (
    <div className="pb-24 pt-6 px-4 bg-gray-50 min-h-dvh">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => navigate("dashboard")}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 shadow-sm"
          type="button"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold text-gray-800">{isEditMode ? "แก้ไขรายการ" : "บันทึกรายการใหม่"}</h2>

        {isEditMode ? (
          <button
            onClick={handleDelete}
            className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 shadow-sm"
            type="button"
          >
            <Trash2 size={20} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {scanPreview && (
        <div className="mb-6 relative group rounded-2xl overflow-hidden shadow-sm border border-gray-200">
          <img src={scanPreview} alt="Slip" className="w-full h-40 object-cover opacity-80" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-white text-xs font-bold flex items-center gap-2">
              <Eye size={16} /> ตรวจสอบข้อมูล
            </span>
          </div>
        </div>
      )}

      <div className="bg-white p-1.5 rounded-2xl flex mb-6 shadow-sm border border-gray-100">
        <button
          onClick={() => setType("expense")}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            type === "expense" ? "bg-gray-900 text-white shadow-sm" : "text-gray-400 hover:bg-gray-50"
          }`}
          type="button"
        >
          รายจ่าย
        </button>
        <button
          onClick={() => setType("income")}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            type === "income" ? "bg-gray-900 text-white shadow-sm" : "text-gray-400 hover:bg-gray-50"
          }`}
          type="button"
        >
          รายรับ
        </button>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm mb-6 text-center border border-gray-100 relative overflow-hidden">
        <label className="text-gray-400 text-xs font-bold mb-2 block uppercase tracking-wide">จำนวนเงิน</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="text-5xl font-extrabold w-full text-center outline-none bg-transparent placeholder-gray-200 text-gray-900"
          autoFocus={!isEditMode}
        />
        {amount && !isNaN(parseFloat(amount)) && (
          <div className="mt-2 text-xs text-gray-400">
            {selectedAccountName ? `บัญชี: ${selectedAccountName}` : ""}
          </div>
        )}
      </div>

      {/* Accounts (emoji icon) */}
      <div className="mb-6">
        <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase ml-1">บัญชีที่ใช้</h3>
        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
          {accounts.map((acc) => {
            const isSelected = accountId === acc.id;

            return (
              <button
                key={acc.id}
                onClick={() => setAccountId(acc.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-max ${
                  isSelected
                    ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                    : "bg-white text-gray-700 border-gray-100 shadow-sm"
                }`}
                type="button"
              >
                <span className="text-xl">{acc.icon || "💳"}</span>
                <span className="text-sm font-bold">{acc.name}</span>
                {isSelected && <Check size={14} className="ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scan button (new only) */}
      {!isEditMode && !scanPreview ? (
        <div className="mb-6">
          <label
            className={`block w-full bg-white border-2 border-dashed ${
              isScanning ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
            } rounded-2xl p-4 transition-all cursor-pointer`}
          >
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              {isScanning ? <Loader className="animate-spin text-gray-900" size={24} /> : <Camera className="text-gray-700" size={24} />}
              <span className="text-gray-900 font-bold text-sm">{isScanning ? ocrStatus : "สแกนสลิปด้วย AI"}</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isScanning} />
          </label>
        </div>
      ) : null}

      {/* Categories */}
      <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase ml-1">หมวดหมู่</h3>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(categories[type] || []).map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
              category === cat.id ? "bg-white shadow-md ring-2 ring-gray-900 scale-105" : "bg-white/60 hover:bg-white border border-transparent hover:border-gray-100"
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

      {/* Date & Note */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden mb-24 border border-gray-100">
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
            placeholder="บันทึกช่วยจำ (ถ้ามี)"
            className="flex-1 outline-none text-gray-700 bg-transparent font-medium"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        className="fixed bottom-6 left-4 right-4 bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2"
        type="button"
      >
        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
        {isEditMode ? "บันทึกการแก้ไข" : "ยืนยันรายการ"}
      </button>
    </div>
  );
}
