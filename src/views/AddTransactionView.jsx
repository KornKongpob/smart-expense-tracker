// src/views/AddTransactionView.jsx

import React, { useMemo, useState } from 'react';
import { X, Trash2, Calendar, FileText, Camera, Loader, Eye, Edit2, Plus, Check } from 'lucide-react';

import { useAppStore } from '../store/store';
import { formatCurrency } from '../utils/format';
import { fileToBase64, callGeminiScan } from '../services/gemini';
import { ACCOUNT_ICONS } from '../constants/presets';

export default function AddTransactionView({ showAlert, showConfirm }) {
  const { state, navigate, upsertTransaction, deleteTransaction, getEditingTransaction } = useAppStore();

  const initialData = getEditingTransaction?.();
  const isEditMode = !!initialData;

  const accounts = state.accounts || [];
  const categories = state.categories || { expense: [], income: [] };

  const [type, setType] = useState(initialData?.type || 'expense');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [category, setCategory] = useState(initialData?.category || '');
  const [accountId, setAccountId] = useState(initialData?.accountId || accounts?.[0]?.id || '');
  const [date, setDate] = useState(
    initialData?.date ? String(initialData.date).split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [note, setNote] = useState(initialData?.note || '');

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [ocrStatus, setOcrStatus] = useState('');

  const handleClose = () => {
    // ปิด/ยกเลิก -> กลับหน้า dashboard
    navigate?.('dashboard');
  };

  const handleSave = () => {
    if (!amount || isNaN(parseFloat(amount))) return showAlert?.('กรุณาระบุจำนวนเงินที่ถูกต้อง');
    if (!category) return showAlert?.('กรุณาเลือกหมวดหมู่');
    if (!accountId) return showAlert?.('กรุณาเลือกบัญชี');

    upsertTransaction?.({
      id: initialData?.id,
      amount: parseFloat(amount),
      type,
      category,
      accountId,
      date,
      note,
    });
  };

  const handleDelete = () => {
    if (!initialData?.id) return;

    showConfirm?.('ลบรายการ', 'ต้องการลบรายการนี้ใช่ไหม?', () => {
      deleteTransaction?.(initialData.id);
    }, true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setOcrStatus('Processing...');

    try {
      const { base64, mimeType, preview } = await fileToBase64(file);
      setScanPreview(preview);

      const result = await callGeminiScan(base64, mimeType);

      if (result?.amount) setAmount(String(result.amount));
      if (result?.date) setDate(result.date);
      if (result?.merchant) setNote(result.merchant);

      if (result?.category) {
        const foundCat = categories.expense?.find(
          (c) => c.id === result.category || String(result.category).toLowerCase().includes(String(c.id).toLowerCase())
        );
        if (foundCat) setCategory(foundCat.id);
      }
    } catch (err) {
      console.error(err);
      showAlert?.('ไม่สามารถอ่านรูปภาพได้');
    } finally {
      setIsScanning(false);
      setOcrStatus('');
      // reset input เพื่อให้เลือกไฟล์เดิมซ้ำได้
      if (e?.target) e.target.value = '';
    }
  };

  const selectedAccountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name || '',
    [accounts, accountId]
  );

  return (
    // ✅ FIX: ใช้ min-h-dvh + เผื่อที่ด้านล่างสำหรับปุ่ม fixed
    <div className="pt-6 px-4 bg-gray-50 min-h-dvh pb-[calc(110px+env(safe-area-inset-bottom))]">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-500 shadow-sm"
          type="button"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold text-gray-800">{isEditMode ? 'แก้ไขรายการ' : 'บันทึกรายการใหม่'}</h2>

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
          onClick={() => setType('expense')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            type === 'expense' ? 'bg-red-50 text-red-500 shadow-sm' : 'text-gray-400 hover:bg-gray-50'
          }`}
          type="button"
        >
          รายจ่าย
        </button>
        <button
          onClick={() => setType('income')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            type === 'income' ? 'bg-green-50 text-green-500 shadow-sm' : 'text-gray-400 hover:bg-gray-50'
          }`}
          type="button"
        >
          รายรับ
        </button>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm mb-6 text-center border border-gray-100 relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1 ${type === 'expense' ? 'bg-red-500' : 'bg-green-500'}`} />
        <label className="text-gray-400 text-xs font-bold mb-2 block uppercase tracking-wide">จำนวนเงิน</label>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className={`text-5xl font-bold w-full text-center outline-none bg-transparent placeholder-gray-200 ${
            type === 'expense' ? 'text-red-500' : 'text-green-500'
          }`}
          autoFocus={!isEditMode}
        />
        {amount && !isNaN(parseFloat(amount)) && (
          <div className="mt-2 text-xs text-gray-400">{selectedAccountName ? `บัญชี: ${selectedAccountName}` : ''}</div>
        )}
      </div>

      {/* Accounts */}
      <div className="mb-6">
        <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase ml-1">บัญชีที่ใช้</h3>
        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
          {accounts.map((acc) => {
            const iconObj = ACCOUNT_ICONS.find((i) => i.id === acc.type) || ACCOUNT_ICONS[0];
            const isSelected = accountId === acc.id;

            return (
              <button
                key={acc.id}
                onClick={() => setAccountId(acc.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-max ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200'
                    : 'bg-white text-gray-600 border-gray-100 shadow-sm'
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

      {/* Scan button: Only when NEW (not edit) */}
      {!isEditMode && !scanPreview && (
        <div className="mb-6">
          <label
            className={`block w-full bg-white border-2 border-dashed ${
              isScanning ? 'border-indigo-400 bg-indigo-50' : 'border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50'
            } rounded-2xl p-4 transition-all cursor-pointer group`}
          >
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              {isScanning ? (
                <Loader className="animate-spin text-indigo-600" size={24} />
              ) : (
                <Camera className="text-indigo-500 group-hover:scale-110 transition-transform" size={24} />
              )}
              <span className="text-indigo-600 font-bold text-sm">{isScanning ? ocrStatus : 'สแกนสลิปด้วย AI'}</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isScanning} />
          </label>
        </div>
      )}

      {/* Categories */}
      <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase ml-1">หมวดหมู่</h3>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(categories?.[type] || []).map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
              category === cat.id
                ? 'bg-white shadow-md ring-2 ring-indigo-500 scale-105'
                : 'bg-white/60 hover:bg-white border border-transparent hover:border-gray-100'
            }`}
            type="button"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2"
              style={{ backgroundColor: `${cat.color}20` }}
            >
              {cat.icon}
            </div>
            <span className="text-[10px] font-bold text-gray-600 truncate w-full text-center">{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Date & Note */}
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
            placeholder="บันทึกช่วยจำ (ถ้ามี)"
            className="flex-1 outline-none text-gray-700 bg-transparent font-medium"
          />
        </div>
      </div>

      {/* ✅ FIX: ปุ่มล่าง “อยู่ในกรอบ” ไม่ยืดเต็มจอ */}
      <button
        onClick={handleSave}
        className="fixed left-1/2 -translate-x-1/2 bottom-[calc(16px+env(safe-area-inset-bottom))] w-[min(calc(100vw-32px),420px)] bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-black"
        type="button"
      >
        {isEditMode ? <Edit2 size={18} /> : <Plus size={18} />}
        {isEditMode ? 'บันทึกการแก้ไข' : 'ยืนยันรายการ'}
      </button>
    </div>
  );
}
