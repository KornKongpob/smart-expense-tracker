// src/views/MoreView.jsx
import { useRef } from "react";
import { Settings, Upload, Trash2, ChevronRight, Bell, Repeat } from "lucide-react";
import { useAppStore } from "../store/store";
import { downloadBackupJSON } from "../services/storage";

export default function MoreView({ showAlert, showConfirm }) {
  const { navigate, exportBackup, importBackup, resetAll, runRecurringNow } = useAppStore();
  const fileRef = useRef(null);

  const onExport = () => {
    const data = exportBackup();
    downloadBackupJSON(data, "smart-expense-backup.json");
    showAlert?.("ส่งออกไฟล์ backup แล้ว");
  };

  const onPickImport = () => fileRef.current?.click();

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      showConfirm?.(
        "นำเข้าข้อมูล (Import)",
        "การนำเข้าจะทับข้อมูลเดิมทั้งหมดในเครื่องนี้ ต้องการดำเนินการต่อหรือไม่?",
        () => {
          importBackup(json);
          showAlert?.("นำเข้าข้อมูลสำเร็จ");
          navigate("dashboard");
        },
        true
      );
    } catch (err) {
      showAlert?.(`ไฟล์ไม่ถูกต้อง: ${String(err?.message || err)}`);
    }
  };

  const onReset = () => {
    showConfirm?.("ล้างข้อมูลทั้งหมด", "ยืนยันล้างข้อมูลทั้งหมด? (ย้อนกลับไม่ได้)", () => resetAll(), true);
  };

  const onRunRecurring = () => {
    const n = runRecurringNow?.() ?? 0;
    showAlert?.(`สร้างรายการ Recurring เพิ่มแล้ว ${n} รายการ`);
  };

  return (
    <div className="pb-28 pt-6 px-4">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-6">ตั้งค่าอื่นๆ</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <button
          onClick={() => navigate("categories")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Settings size={20} />
            </div>
            <span className="text-gray-800 font-extrabold">จัดการหมวดหมู่</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={() => navigate("budgets")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-700">
              <Bell size={20} />
            </div>
            <span className="text-gray-800 font-extrabold">Budget Alert</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={() => navigate("recurring")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700">
              <Repeat size={20} />
            </div>
            <span className="text-gray-800 font-extrabold">Recurring Expense</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={onRunRecurring}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700">
              <Repeat size={20} />
            </div>
            <span className="text-gray-800 font-extrabold">Run Recurring Now</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={onPickImport}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Upload size={20} />
            </div>
            <span className="text-gray-800 font-extrabold">นำเข้าข้อมูล (Import Backup JSON)</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />

        <button
          onClick={onExport}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border border-gray-100 border-x-0 border-b-0"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Upload size={20} />
            </div>
            <span className="text-gray-800 font-extrabold">ส่งออกข้อมูล (Backup JSON)</span>
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
            <span className="text-red-600 font-extrabold">ล้างข้อมูลทั้งหมด</span>
          </div>
          <ChevronRight size={20} className="text-gray-300 group-hover:text-red-300" />
        </button>
      </div>

      <div className="text-center text-gray-400 text-xs mt-8">Smart Expense Tracker</div>
    </div>
  );
}
