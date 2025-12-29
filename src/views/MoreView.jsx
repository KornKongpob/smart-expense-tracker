// src/views/MoreView.jsx
import { useMemo, useRef } from "react";
import { Settings, Upload, Trash2, ChevronRight, Bell, Repeat, PlayCircle, Inbox, Wand2, Store } from "lucide-react";
import { useAppStore } from "../store/store";
import { downloadBackupJSON } from "../services/storage";
import { toISODate } from "../utils/format";
import { parseDateSafe } from "../store/selectors";

export default function MoreView({ showAlert, showConfirm }) {
  const { state, navigate, exportBackup, importBackup, resetAll, runRecurringNow } = useAppStore();
  const fileRef = useRef(null);

  const merchantCount = Array.isArray(state?.merchants) ? state.merchants.length : 0;

  const inboxList = useMemo(() => {
    if (Array.isArray(state?.inbox)) return state.inbox;
    if (Array.isArray(state?.scanInbox)) return state.scanInbox;
    return [];
  }, [state?.inbox, state?.scanInbox]);

  const inboxPendingCount = useMemo(() => {
    return (inboxList || []).filter((it) => String(it?.status || 'pending').toLowerCase() !== 'approved').length;
  }, [inboxList]);

  const inboxApprovedCount = useMemo(() => {
    return (inboxList || []).filter((it) => String(it?.status || '').toLowerCase() === 'approved').length;
  }, [inboxList]);


  const inboxDupCount = useMemo(() => {
    return (inboxList || []).filter((it) => !!it?.duplicate && String(it?.status || 'pending').toLowerCase() !== 'approved').length;
  }, [inboxList]);
  // ✅ small status helper: how many recurring rules exist / enabled
  const recurringStats = useMemo(() => {
    const list = state?.recurring || [];
    const enabled = list.filter((r) => r?.enabled !== false).length;
    return { total: list.length, enabled };
  }, [state?.recurring]);

  // ✅ automation rules status
  const rulesStats = useMemo(() => {
    const list = Array.isArray(state?.rules) ? state.rules : [];
    const enabled = list.filter((r) => r?.enabled !== false).length;
    return { total: list.length, enabled };
  }, [state?.rules]);

  const onExport = () => {
    const data = exportBackup();
    downloadBackupJSON(data, "smart-expense-backup.json");
    showAlert?.("ส่งออกไฟล์ backup แล้ว");
  };

  const onPickImport = () => {
    fileRef.current?.click();
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow reselect same file
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

  // ✅ Run now with a nice hint about "today"
  const onRunRecurring = () => {
    const today = toISODate(new Date());
    const n = runRecurringNow?.() ?? 0;
    showAlert?.(`สร้างรายการ Recurring เพิ่มแล้ว ${n} รายการ (ถึงวันที่ ${today})`);
  };

  // Optional: quick sanity check message for recurring lastGenerated
  const recurringHealth = useMemo(() => {
    const list = state?.recurring || [];
    if (!list.length) return "";

    const todayISO = toISODate(new Date());
    const today = parseDateSafe(todayISO).getTime();

    // Count rules that look "in the past" and might generate something
    let dueish = 0;
    for (const r of list) {
      if (r?.enabled === false) continue;

      const last = r?.lastGenerated ? parseDateSafe(r.lastGenerated).getTime() : 0;
      const start = r?.startDate ? parseDateSafe(r.startDate).getTime() : 0;

      // if never generated and started in past, or lastGenerated in past, mark as potentially due
      if ((!r?.lastGenerated && start && start <= today) || (r?.lastGenerated && last <= today)) dueish += 1;
    }

    if (!dueish) return "ยังไม่พบรายการที่น่าจะถึงรอบในวันนี้";
    return `มี ${dueish} กฎที่อาจถึงรอบ (กด Run เพื่อสร้างทันที)`;
  }, [state?.recurring]);

  const Row = ({ icon, title, subtitle, badge, onClick, danger, noBorder }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-4 hover:bg-white/10 ${noBorder ? "" : "border-b glass-divider"}`}
      type="button"
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            danger ? "bg-red-500/10 text-red-600" : "glass-chip text-gray-700"
          }`}
        >
          {icon}
        </div>
        <div className="text-left">
          <div className={`font-extrabold ${danger ? "text-red-700" : "text-gray-900"}`}>{title}</div>
          {subtitle ? <div className="text-xs text-gray-600 mt-0.5">{subtitle}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge ? (
          <div className="min-w-[28px] h-7 px-2 rounded-full bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">
            {badge}
          </div>
        ) : null}
        <ChevronRight size={20} className={danger ? "text-red-300" : "text-gray-500"} />
      </div>
    </button>
  );

  return (
    <div className="pb-28 pt-6 px-4">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-2">ตั้งค่าอื่นๆ</h1>

      {/* ✅ small recurring status chip */}
      <div className="text-xs text-gray-700/70 mb-6">
        Recurring: <span className="font-extrabold text-gray-900">{recurringStats.enabled}</span> เปิดใช้งาน จาก{" "}
        <span className="font-extrabold text-gray-900">{recurringStats.total}</span> รายการ
        {recurringHealth ? <div className="mt-1 text-[11px] text-gray-700/60">{recurringHealth}</div> : null}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden mb-4">
        <Row
          icon={<Inbox size={20} />}
          title="Inbox"
          subtitle={
            inboxPendingCount || inboxApprovedCount
              ? `${inboxPendingCount} Pending${inboxApprovedCount ? ` • ${inboxApprovedCount} Approved` : ''}${inboxDupCount ? ` • possible duplicate ${inboxDupCount}` : ''}`
              : 'ยังไม่มีรายการใน Inbox'
          }
          badge={inboxPendingCount}
          onClick={() => navigate("inbox")}
        />

        <Row
          icon={<Wand2 size={20} />}
          title="Automation Rules"
          subtitle={rulesStats.total ? `${rulesStats.enabled} Enabled • ${rulesStats.total} Total` : "ตั้งกฎเพื่อ auto-fill หลังสแกน"}
          onClick={() => navigate("rules")}
        />

        <Row
          icon={<Store size={20} />}
          title="Merchant Library"
          subtitle={merchantCount ? `${merchantCount} merchants` : "จำร้าน → หมวด/บัญชี แบบฉลาด"}
          onClick={() => navigate("merchants")}
        />

        <Row icon={<Settings size={20} />} title="จัดการหมวดหมู่" onClick={() => navigate("categories")} />
        <Row icon={<Bell size={20} />} title="Budget Alert" onClick={() => navigate("budgets")} />

        <Row
          icon={<Repeat size={20} />}
          title="Recurring Expense"
          subtitle="ตั้งรายการรายจ่าย/รายรับอัตโนมัติ"
          onClick={() => navigate("recurring")}
        />

        <Row
          icon={<PlayCircle size={20} />}
          title="Run Recurring Now"
          subtitle="สร้างรายการที่ถึงรอบทันที"
          onClick={onRunRecurring}
        />

        <Row icon={<Upload size={20} />} title="นำเข้าข้อมูล (Import Backup JSON)" onClick={onPickImport} />

        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />

        <Row icon={<Upload size={20} />} title="ส่งออกข้อมูล (Backup JSON)" onClick={onExport} />

        <Row icon={<Trash2 size={20} />} title="ล้างข้อมูลทั้งหมด" danger onClick={onReset} noBorder />
      </div>

      <div className="text-center text-gray-500 text-xs mt-8">Smart Expense Tracker</div>
    </div>
  );
}
