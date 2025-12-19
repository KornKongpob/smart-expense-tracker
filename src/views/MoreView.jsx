// src/views/MoreView.jsx
import React, { useRef } from "react";
import { Settings, Upload, Download, Trash2, ChevronRight } from "lucide-react";
import { useAppStore } from "../store/store";
import { downloadBackupJSON } from "../services/storage";

export default function MoreView({ showAlert, showConfirm }) {
  const { navigate, exportBackup, importBackup, resetAll } = useAppStore();
  const fileRef = useRef(null);

  const onExport = () => {
    const data = exportBackup();
    downloadBackupJSON(data, `smart-expense-backup-${new Date().toISOString().slice(0, 10)}.json`);
    showAlert?.("ส่งออกข้อมูลเรียบร้อย");
  };

  const onPickImport = () => fileRef.current?.click();

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const txt = await file.text();
      const json = JSON.parse(txt);
      if (!json || typeof json !== "object") throw new Error("invalid_json");

      importBackup({
        transactions: Array.isArray(json.transactions) ? json.transactions : [],
        accounts: Array.isArray(json.accounts) ? json.accounts : [],
        categories: json.categories && typeof json.categories === "object" ? json.categories : { expense: [], income: [] },
      });

      showAlert?.("นำเข้าข้อมูลเรียบร้อย");
      navigate("dashboard");
    } catch (err) {
      console.error(err);
      showAlert?.("ไฟล์ Backup ไม่ถูกต้อง");
    }
  };

  const onReset = () => {
    showConfirm?.(
      "ล้างข้อมูลทั้งหมด",
      "ยืนยันล้างข้อมูล? ข้อมูลทั้งหมดจะหายและกู้คืนไม่ได้ (ยกเว้นมีไฟล์ backup)",
      () => resetAll(),
      true
    );
  };

  return (
    <div className="pb-28 pt-6 px-4 min-h-dvh bg-gray-50">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-6">ตั้งค่าอื่นๆ</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <button
          onClick={() => navigate("categories")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <Settings size={20} />
            </div>
            <span className="text-gray-700 font-semibold">จัดการหมวดหมู่</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={onExport}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Download size={20} />
            </div>
            <span className="text-gray-700 font-semibold">ส่งออกข้อมูล (Backup JSON)</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={onPickImport}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Upload size={20} />
            </div>
            <span className="text-gray-700 font-semibold">นำเข้าข้อมูล (Import Backup)</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={onReset}
          className="w-full flex items-center justify-between p-4 hover:bg-red-50 group"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-100">
              <Trash2 size={20} />
            </div>
            <span className="text-red-500 font-semibold">ล้างข้อมูลทั้งหมด</span>
          </div>
          <ChevronRight size={20} className="text-gray-400 group-hover:text-red-300" />
        </button>
      </div>

      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />

      <div className="text-center text-gray-400 text-xs mt-8">Smart Expense Tracker</div>
    </div>
  );
}
