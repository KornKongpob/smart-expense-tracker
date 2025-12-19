import { Settings, Upload, Trash2, ChevronRight, Wallet, Repeat } from "lucide-react";
import { useAppStore } from "../store/store";
import { downloadBackupJSON } from "../services/storage";

export default function MoreView({ showAlert, showConfirm }) {
  const { state, actions } = useAppStore();

  const onExport = () => {
    const data = actions.exportBackup();
    downloadBackupJSON(data, `smart-expense-backup-${new Date().toISOString().slice(0,10)}.json`);
    showAlert?.("ดาวน์โหลดไฟล์ backup แล้ว");
  };

  const onReset = () => {
    showConfirm?.("ล้างข้อมูลทั้งหมด", "ยืนยันลบข้อมูลทั้งหมดในเครื่องนี้?", () => actions.resetAll(), true);
  };

  return (
    <div className="pb-28 pt-6 px-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ตั้งค่าอื่นๆ</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <button
          onClick={() => actions.navigate("categories")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <Settings size={20} />
            </div>
            <span className="text-gray-700 font-medium">จัดการหมวดหมู่</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={() => actions.navigate("budgets")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center text-yellow-700">
              <Wallet size={20} />
            </div>
            <span className="text-gray-700 font-medium">Budgets (งบรายเดือน)</span>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>

        <button
          onClick={() => actions.navigate("recurring")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 border-b border-gray-100"
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-700">
              <Repeat size={20} />
            </div>
            <span className="text-gray-700 font-medium">Recurring (รายการประจำ)</span>
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
              <Upload size={20} />
            </div>
            <span className="text-gray-700 font-medium">ส่งออกข้อมูล (Backup JSON)</span>
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
            <span className="text-red-500 font-medium">ล้างข้อมูลทั้งหมด</span>
          </div>
          <ChevronRight size={20} className="text-gray-400 group-hover:text-red-300" />
        </button>
      </div>

      <div className="text-center text-gray-400 text-xs mt-8">
        Smart Expense Tracker (Enhanced)
      </div>
    </div>
  );
}
