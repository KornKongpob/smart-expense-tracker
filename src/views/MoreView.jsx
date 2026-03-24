// src/views/MoreView.jsx
import { useMemo, useRef } from "react";
import { useState as useStateLocal } from "react";
import {
  Settings,
  Upload,
  Trash2,
  ChevronRight,
  Bell,
  Repeat,
  PlayCircle,
  Inbox,
  Wand2,
  Store,
  Moon,
  Sun,
} from "lucide-react";
import { useAppStore } from "../store/store.jsx";
import AppHeader from "../components/AppHeader";
import { downloadBackupJSON } from "../services/storage";
import { toISODate } from "../utils/format";
import { isRecurringDue } from "../utils/recurring";
import { validateBackupImport } from "../schemas/index.js";
import { transactionsToCsv, downloadCsv } from "../utils/exportCsv";

// Declared at module-scope to satisfy react-hooks/static-components
function MoreRow({ icon, title, subtitle, badge, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={["ui-row", danger ? "text-red-700" : "text-gray-900"].join(" ")}
      type="button"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={[
            "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border",
            danger
              ? "bg-red-500/10 border-red-500/15 text-red-700"
              : "bg-white/65 border-slate-900/10 text-gray-900",
          ].join(" ")}
        >
          {icon}
        </div>

        <div className="min-w-0 text-left">
          <div className="font-extrabold truncate">{title}</div>
          {subtitle ? <div className="text-xs font-bold text-gray-700/65 mt-0.5 truncate">{subtitle}</div> : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {typeof badge === "number" && badge > 0 ? <div className="ui-badge">{badge}</div> : null}
        <ChevronRight size={20} className={danger ? "text-red-300" : "text-gray-500"} />
      </div>
    </button>
  );
}

export default function MoreView({ showAlert, showConfirm }) {
  const { state, navigate, exportBackup, importBackup, resetAll, runRecurringNow } = useAppStore();
  const fileRef = useRef(null);

  // Theme state (moved to top-level to comply with React hooks rules)
  const THEME_KEY = "app_theme";
  const [theme, setThemeState] = useStateLocal(() => {
    try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
  });
  const setTheme = (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
      document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "");
    } catch { /* ignore */ }
    setThemeState(t);
  };
  const isDark = theme === "dark";

  const merchantCount = Array.isArray(state?.merchants) ? state.merchants.length : 0;

  const inboxList = useMemo(() => {
    if (Array.isArray(state?.inbox)) return state.inbox;
    if (Array.isArray(state?.scanInbox)) return state.scanInbox;
    return [];
  }, [state?.inbox, state?.scanInbox]);

  const inboxPendingCount = useMemo(() => {
    return (inboxList || []).filter((it) => String(it?.status || "pending").toLowerCase() !== "approved").length;
  }, [inboxList]);

  const inboxApprovedCount = useMemo(() => {
    return (inboxList || []).filter((it) => String(it?.status || "").toLowerCase() === "approved").length;
  }, [inboxList]);

  const inboxDupCount = useMemo(() => {
    return (inboxList || []).filter((it) => !!it?.duplicate && String(it?.status || "pending").toLowerCase() !== "approved").length;
  }, [inboxList]);

  const recurringStats = useMemo(() => {
    const list = state?.recurring || [];
    const enabled = list.filter((r) => r?.enabled !== false).length;
    return { total: list.length, enabled };
  }, [state?.recurring]);

  const rulesStats = useMemo(() => {
    const list = Array.isArray(state?.rules) ? state.rules : [];
    const enabled = list.filter((r) => r?.enabled !== false).length;
    return { total: list.length, enabled };
  }, [state?.rules]);

  const onExport = () => {
    const data = exportBackup();
    downloadBackupJSON(data, "smart-expense-backup.json");
    showAlert?.("ส่งออกไฟล์ Backup แล้ว");
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

      // ✅ Backward compatible import:
      // - Accept both raw backups and versioned backups: { v, exportedAt, data: {...} }
      // - If moneyUnit is missing (old broken exports), assume 'satang' to avoid x100 inflation.
      const hasMoneyUnit = (o) => o && typeof o === "object" && String(o.moneyUnit || o.amountUnit || "").trim().length > 0;

      let payload = json;
      let assumedSatang = false;

      if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") {
        if (!hasMoneyUnit(payload.data)) {
          payload = { ...payload, data: { ...payload.data, moneyUnit: "satang" } };
          assumedSatang = true;
        }
      } else if (!hasMoneyUnit(payload)) {
        payload = { ...(payload && typeof payload === "object" ? payload : {}), moneyUnit: "satang" };
        assumedSatang = true;
      }

      // ✅ Zod schema validation (non-blocking: warn but still allow import)
      const validation = validateBackupImport(payload);
      const validationWarn = validation.success
        ? ""
        : `\n\n⚠️ พบข้อมูลที่อาจไม่สมบูรณ์: ${String(validation.error || "").slice(0, 200)}`;

      const warnText = assumedSatang
        ? "\n\nหมายเหตุ: ไฟล์นี้ไม่มี moneyUnit → ระบบจะตีความเป็น 'satang' เพื่อป้องกันจำนวนเงินเพี้ยน x100"
        : "";

      showConfirm?.(
        "นำเข้าข้อมูล (Import)",
        `การนำเข้าจะทับข้อมูลเดิมทั้งหมดในเครื่องนี้ ต้องการดำเนินการต่อหรือไม่?${warnText}${validationWarn}`,
        () => {
          importBackup(payload);
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
    const res = runRecurringNow?.() || { createdCount: 0, truncatedRules: [], cap: 0, todayISO: toISODate(new Date()) };
    const today = res.todayISO || toISODate(new Date());
    const n = Number(res.createdCount || 0) || 0;
    const truncated = Array.isArray(res.truncatedRules) ? res.truncatedRules.length : 0;
    if (truncated) {
      showAlert?.(
        `สร้างรายการ Recurring เพิ่มแล้ว ${n} รายการ (ถึงวันที่ ${today}) — บางกฎถูกจำกัดต่อครั้ง ${res.cap} รายการ (กด Run อีกครั้งเพื่อสร้างต่อ)`
      );
      return;
    }
    showAlert?.(`สร้างรายการ Recurring เพิ่มแล้ว ${n} รายการ (ถึงวันที่ ${today})`);
  };

  const recurringHealth = useMemo(() => {
    const list = state?.recurring || [];
    if (!list.length) return "";

    const todayISO = toISODate(new Date());

    let dueish = 0;
    for (const r of list) {
      if (r?.enabled === false) continue;
      if (isRecurringDue(r, todayISO)) dueish += 1;
    }

    if (!dueish) return "ยังไม่พบรายการที่น่าจะถึงรอบในวันนี้";
    return `มี ${dueish} กฎที่อาจถึงรอบ (กด Run เพื่อสร้างทันที)`;
  }, [state?.recurring]);

  const inboxSubtitle = inboxPendingCount || inboxApprovedCount
    ? `รออนุมัติ ${inboxPendingCount} • อนุมัติแล้ว ${inboxApprovedCount}${inboxDupCount ? ` • ซ้ำ? ${inboxDupCount}` : ""}`
    : "ยังไม่มีรายการใน Inbox";

  return (
    <div className="min-h-dvh">
      <AppHeader title="อื่นๆ" subtitle="จัดการข้อมูล • อัตโนมัติ • ความปลอดภัย" />

      <main className="ui-page pt-4 pb-6 view-flow">

      <div className="view-hero">
        <div className="view-hero-content">
          <div>
            <div className="view-eyebrow">Control center</div>
            <div className="view-hero-title">รวมการตั้งค่า เครื่องมืออัตโนมัติ และการจัดการข้อมูลไว้ในหน้าเดียว</div>
            <div className="view-hero-copy">
              เข้าไปจัดการ recurring, automation rules, merchant memory, backup และ theme ได้จาก hub เดียวที่อ่านสถานะสำคัญได้ทันที
            </div>
          </div>

          <div className="view-hero-grid">
            <div className="view-metric">
              <div className="view-metric-label">Recurring</div>
              <div className="view-metric-value">{recurringStats.enabled}/{recurringStats.total}</div>
              <div className="view-metric-hint">กฎ recurring ที่เปิดใช้งานอยู่ในระบบ</div>
            </div>

            <div className="view-metric">
              <div className="view-metric-label">Inbox pending</div>
              <div className="view-metric-value">{inboxPendingCount}</div>
              <div className="view-metric-hint">รายการที่ยังรอ approve หรือ review ใน inbox</div>
            </div>

            <div className="view-metric">
              <div className="view-metric-label">Automation</div>
              <div className="view-metric-value">{rulesStats.enabled}/{rulesStats.total}</div>
              <div className="view-metric-hint">จำนวน automation rules ที่เปิดใช้งานอยู่</div>
            </div>

            <div className="view-metric">
              <div className="view-metric-label">Theme</div>
              <div className="view-metric-value">{isDark ? "Dark" : "Light"}</div>
              <div className="view-metric-hint">แตะการ์ด appearance ด้านล่างเพื่อสลับโหมด</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick status */}
      <div className="mt-4 mb-5 ui-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-700/70">สถานะการทำงาน</div>
            <div className="mt-1 text-sm font-extrabold text-gray-900">
              Recurring: <span className="tabular-nums">{recurringStats.enabled}</span> เปิดใช้งาน จาก{" "}
              <span className="tabular-nums">{recurringStats.total}</span> รายการ
            </div>
            {recurringHealth ? <div className="mt-1 text-[11px] font-bold text-gray-700/60">{recurringHealth}</div> : null}
          </div>

          {inboxPendingCount ? (
            <div className="shrink-0">
              <div className="text-[11px] font-extrabold text-gray-700/60 text-right">Inbox</div>
              <div className="mt-1 ui-badge">{inboxPendingCount}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Shortcuts */}
      <div className="ui-card overflow-hidden rounded-3xl mb-4">
        <MoreRow icon={<Inbox size={20} />} title="Inbox (สแกน/รับเข้า)" subtitle={inboxSubtitle} badge={inboxPendingCount} onClick={() => navigate("inbox")} />
        <MoreRow
          icon={<Wand2 size={20} />}
          title="Automation Rules"
          subtitle={rulesStats.total ? `เปิดใช้ ${rulesStats.enabled} • ทั้งหมด ${rulesStats.total}` : "ตั้งกฎเพื่อ auto-fill หลังสแกน"}
          onClick={() => navigate("rules")}
        />
        <MoreRow
          icon={<Store size={20} />}
          title="Merchant Library"
          subtitle={merchantCount ? `มี ${merchantCount} ร้าน` : "จำร้าน → หมวด/บัญชี แบบฉลาด"}
          onClick={() => navigate("merchants")}
        />
        <MoreRow icon={<Settings size={20} />} title="จัดการหมวดหมู่" subtitle="แก้ไขหมวดหลัก/ย่อย + Tombstone" onClick={() => navigate("categories")} />
        <MoreRow icon={<Bell size={20} />} title="Budgets" subtitle="ตั้งงบ + แจ้งเตือน" onClick={() => navigate("budgets")} />
        <MoreRow icon={<Repeat size={20} />} title="Recurring" subtitle="ตั้งรายการรายจ่าย/รายรับอัตโนมัติ" onClick={() => navigate("recurring")} />
        <MoreRow icon={<PlayCircle size={20} />} title="Run Recurring Now" subtitle="สร้างรายการที่ถึงรอบทันที" onClick={onRunRecurring} />
      </div>

      {/* Appearance */}
      <div className="ui-card overflow-hidden rounded-3xl mb-4">
        <MoreRow
          icon={isDark ? <Moon size={20} /> : <Sun size={20} />}
          title={isDark ? "โหมดมืด (เปิดอยู่)" : "โหมดมืด"}
          subtitle={isDark ? "แตะเพื่อเปลี่ยนเป็นโหมดสว่าง" : "แตะเพื่อเปลี่ยนเป็นโหมดมืด"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        />
      </div>

      {/* Data */}
      <div className="ui-card overflow-hidden rounded-3xl mb-4">
        <MoreRow icon={<Upload size={20} />} title="นำเข้าข้อมูล (Import Backup JSON)" subtitle="ทับข้อมูลเดิมทั้งหมดในเครื่องนี้" onClick={onPickImport} />
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
        <MoreRow icon={<Upload size={20} />} title="ส่งออกข้อมูล (Backup JSON)" subtitle="ดาวน์โหลดไฟล์สำรองข้อมูล" onClick={onExport} />
        <MoreRow
          icon={<Upload size={20} />}
          title="ส่งออก CSV"
          subtitle="ดาวน์โหลดรายการเป็น CSV (เปิดใน Excel ได้)"
          onClick={() => {
            const csv = transactionsToCsv(state.transactions || [], { categories: state.categories, accounts: state.accounts });
            const d = new Date();
            const fname = `transactions-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.csv`;
            downloadCsv(csv, fname);
            showAlert?.("ส่งออก CSV แล้ว");
          }}
        />
        <MoreRow icon={<Trash2 size={20} />} title="ล้างข้อมูลทั้งหมด" subtitle="ย้อนกลับไม่ได้" danger onClick={onReset} />
      </div>

      <div className="text-center text-gray-500 text-xs mt-8 pb-safe">Smart Expense Tracker</div>
      </main>
    </div>
  );
}
