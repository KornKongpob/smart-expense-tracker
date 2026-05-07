import { useMemo, useRef } from "react";
import { useState as useStateLocal } from "react";
import {
  BarChart3,
  Bell,
  ChevronRight,
  CreditCard,
  Home,
  Inbox,
  Lock,
  Moon,
  PlayCircle,
  ReceiptText,
  Repeat,
  Settings,
  Sparkles,
  Store,
  Sun,
  Target,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { useAppStore } from "../store/store.jsx";
import AppHeader from "../components/AppHeader";
import { downloadBackupJSON } from "../services/storage";
import { toISODate } from "../utils/format";
import { getRecurringDueCount } from "../utils/recurring";
import { hasExplicitMoneyUnit } from "../utils/moneyUnit";
import { validateBackupImport } from "../schemas/index.js";
import { transactionsToCsv, downloadCsv } from "../utils/exportCsv";

function MoreRow({ icon, title, subtitle, badge, onClick, danger, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={["ui-row group", danger ? "text-red-700" : "text-[color:var(--text)]"].join(" ")}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={[
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors",
            danger
              ? "border-red-500/15 bg-red-500/10 text-red-700"
              : "border-white/70 bg-white/60 text-[color:var(--text)] group-hover:bg-white/80",
          ].join(" ")}
        >
          {icon}
        </div>

        <div className="min-w-0 text-left">
          <div className="truncate font-semibold">{title}</div>
          {subtitle ? <div className="mt-0.5 truncate text-xs font-medium text-[color:var(--muted)]">{subtitle}</div> : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {typeof badge === "number" && badge > 0 ? <div className="ui-badge">{badge}</div> : null}
        <ChevronRight size={18} className={danger ? "text-red-300" : "text-[color:var(--muted)]"} />
      </div>
    </button>
  );
}

function HubSection({ title, subtitle, children }) {
  return (
    <section className="hub-section">
      {title ? (
        <div className="hub-section-head">
          <div className="hub-section-title">{title}</div>
          {subtitle ? <div className="hub-section-copy">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="ui-card-strong overflow-hidden">{children}</div>
    </section>
  );
}

function HubStatusCard({ label, value, copy }) {
  return (
    <div className="hub-status-card">
      <div className="hub-status-label">{label}</div>
      <div className="hub-status-value">{value}</div>
      <div className="hub-status-copy">{copy}</div>
    </div>
  );
}

function PinModal({ isOpen, hasPin, pin, setPin, confirmPin, setConfirmPin, error, onClose, onSave, onRemove }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-sm ui-card-strong p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[color:var(--text)]">Security / PIN</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-[color:var(--muted)]">
              ใช้รหัส 6 หลักเพื่อให้แอปถาม PIN ทุกครั้งที่เปิดใหม่
            </div>
          </div>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary px-3">
            <ChevronRight size={16} className="rotate-180" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="ui-label">{hasPin ? "PIN ใหม่" : "ตั้ง PIN"}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(String(event.target.value || "").replace(/[^\d]/g, "").slice(0, 6))}
              data-testid="hub-pin-input"
              className="ui-input"
              placeholder="6 หลัก"
            />
          </div>

          <div>
            <label className="ui-label">ยืนยัน PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(event) => setConfirmPin(String(event.target.value || "").replace(/[^\d]/g, "").slice(0, 6))}
              data-testid="hub-pin-confirm"
              className="ui-input"
              placeholder="ใส่อีกครั้ง"
            />
          </div>

          {error ? <div className="text-sm font-semibold text-red-700">{error}</div> : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {hasPin ? (
            <button type="button" onClick={onRemove} data-testid="hub-pin-remove" className="ui-btn ui-btn-secondary border-red-200 bg-red-50/70 text-red-700">
              ลบ PIN
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
              ยกเลิก
            </button>
            <button type="button" onClick={onSave} data-testid="hub-pin-save" className="ui-btn ui-btn-primary">
              บันทึก PIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MoreView({ showAlert, showConfirm }) {
  const { state, navigate, exportBackup, importBackup, resetAll, runRecurringNow } = useAppStore();
  const fileRef = useRef(null);

  const THEME_KEY = "app_theme";
  const PIN_KEY = "privacy_pin_6";

  const [theme, setThemeState] = useStateLocal(() => {
    try {
      return localStorage.getItem(THEME_KEY) || "light";
    } catch {
      return "light";
    }
  });
  const [pinModalOpen, setPinModalOpen] = useStateLocal(false);
  const [pinValue, setPinValue] = useStateLocal("");
  const [pinConfirm, setPinConfirm] = useStateLocal("");
  const [pinError, setPinError] = useStateLocal("");
  const [hasPin, setHasPin] = useStateLocal(() => {
    try {
      return !!localStorage.getItem(PIN_KEY);
    } catch {
      return false;
    }
  });

  const setTheme = (nextTheme) => {
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
      document.documentElement.setAttribute("data-theme", nextTheme === "dark" ? "dark" : "");
    } catch {
      // ignore
    }
    setThemeState(nextTheme);
  };

  const inboxList = useMemo(() => {
    if (Array.isArray(state?.inbox)) return state.inbox;
    if (Array.isArray(state?.scanInbox)) return state.scanInbox;
    return [];
  }, [state?.inbox, state?.scanInbox]);

  const inboxPendingCount = useMemo(
    () => inboxList.filter((item) => String(item?.status || "pending").toLowerCase() !== "approved").length,
    [inboxList]
  );
  const inboxApprovedCount = useMemo(
    () => inboxList.filter((item) => String(item?.status || "").toLowerCase() === "approved").length,
    [inboxList]
  );
  const inboxDupCount = useMemo(
    () =>
      inboxList.filter(
        (item) => !!item?.duplicate && String(item?.status || "pending").toLowerCase() !== "approved"
      ).length,
    [inboxList]
  );

  const rulesStats = useMemo(() => {
    const list = Array.isArray(state?.rules) ? state.rules : [];
    const enabled = list.filter((item) => item?.enabled !== false).length;
    return { total: list.length, enabled };
  }, [state?.rules]);

  const merchantCount = Array.isArray(state?.merchants) ? state.merchants.length : 0;
  const activeGoalCount = Array.isArray(state?.goals)
    ? state.goals.filter((goal) => String(goal?.status || "active") === "active").length
    : 0;
  const activeDebtAccountCount = Array.isArray(state?.accounts)
    ? state.accounts.filter((account) => String(account?.type || "").toLowerCase() === "credit").length
    : 0;
  const transactionCount = Array.isArray(state?.transactions) ? state.transactions.length : 0;
  const accountCount = Array.isArray(state?.accounts) ? state.accounts.length : 0;
  const isDark = theme === "dark";

  const recurringHealth = useMemo(() => {
    const list = state?.recurring || [];
    if (!list.length) return "ยังไม่มี recurring rule";

    const todayISO = toISODate(new Date());
    const dueish = getRecurringDueCount(list, todayISO);

    if (!dueish) return "ยังไม่พบกฎที่ถึงรอบวันนี้";
    return `มีกฎถึงรอบ ${dueish} รายการ กด Run ได้ทันที`;
  }, [state?.recurring]);

  const inboxSubtitle =
    inboxPendingCount || inboxApprovedCount
      ? `รออนุมัติ ${inboxPendingCount} • อนุมัติแล้ว ${inboxApprovedCount}${inboxDupCount ? ` • ซ้ำ? ${inboxDupCount}` : ""}`
      : "ยังไม่มีรายการใน Inbox";

  const openPinModal = () => {
    setPinValue("");
    setPinConfirm("");
    setPinError("");
    setPinModalOpen(true);
  };

  const savePin = () => {
    if (pinValue.length !== 6) {
      setPinError("PIN ต้องเป็นตัวเลข 6 หลัก");
      return;
    }
    if (pinValue !== pinConfirm) {
      setPinError("PIN สองช่องไม่ตรงกัน");
      return;
    }

    try {
      localStorage.setItem(PIN_KEY, pinValue);
      setHasPin(true);
      setPinModalOpen(false);
      setPinValue("");
      setPinConfirm("");
      setPinError("");
      showAlert?.("บันทึก PIN แล้ว");
    } catch (error) {
      setPinError(String(error?.message || error || "บันทึก PIN ไม่สำเร็จ"));
    }
  };

  const removePin = () => {
    try {
      localStorage.removeItem(PIN_KEY);
      setHasPin(false);
      setPinModalOpen(false);
      setPinValue("");
      setPinConfirm("");
      setPinError("");
      showAlert?.("ลบ PIN แล้ว");
    } catch (error) {
      setPinError(String(error?.message || error || "ลบ PIN ไม่สำเร็จ"));
    }
  };

  const onExport = () => {
    const data = exportBackup();
    downloadBackupJSON(data, "smart-expense-backup.json");
    showAlert?.("ส่งออกไฟล์ Backup แล้ว");
  };

  const onPickImport = () => {
    fileRef.current?.click();
  };

  const onImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const root = json && typeof json === "object" && json.data && typeof json.data === "object" ? json.data : json;
      const assumedSatang = !hasExplicitMoneyUnit(root);
      const validation = validateBackupImport(json);
      if (!validation.success) {
        showAlert?.(`ไฟล์สำรองไม่ถูกต้อง: ${String(validation.error || "").slice(0, 200)}`);
        return;
      }

      const warnText = assumedSatang
        ? "\n\nไฟล์นี้ไม่มี moneyUnit ระบบจึงตีความเป็น satang เพื่อป้องกันยอดเพี้ยน x100"
        : "";

      showConfirm?.(
        "นำเข้าข้อมูล (Import)",
        `การนำเข้าจะทับข้อมูลเดิมทั้งหมดในเครื่องนี้ ต้องการดำเนินการต่อหรือไม่?${warnText}`,
        () => {
          importBackup(validation.data);
          showAlert?.("นำเข้าข้อมูลสำเร็จ");
          navigate("dashboard");
        },
        true
      );
    } catch (error) {
      showAlert?.(`ไฟล์ไม่ถูกต้อง: ${String(error?.message || error)}`);
    }
  };

  const onReset = () => {
    showConfirm?.(
      "ล้างข้อมูลทั้งหมด",
      "ยืนยันล้างข้อมูลทั้งหมด? (ย้อนกลับไม่ได้)",
      () => resetAll(),
      true
    );
  };

  const onRunRecurring = () => {
    const result =
      runRecurringNow?.() || { createdCount: 0, truncatedRules: [], cap: 0, todayISO: toISODate(new Date()) };
    const today = result.todayISO || toISODate(new Date());
    const count = Number(result.createdCount || 0) || 0;
    const truncated = Array.isArray(result.truncatedRules) ? result.truncatedRules.length : 0;

    if (truncated) {
      showAlert?.(
        `สร้างรายการ Recurring แล้ว ${count} รายการ (ถึงวันที่ ${today}) และยังมีกฎบางส่วนถูกจำกัดต่อครั้ง ${result.cap} รายการ`
      );
      return;
    }

    showAlert?.(`สร้างรายการ Recurring แล้ว ${count} รายการ (ถึงวันที่ ${today})`);
  };

  return (
    <div className="min-h-dvh">
      <AppHeader title="ตั้งค่า" subtitle="ระบบ / ข้อมูล / ความปลอดภัย" />

    <main className="ui-page pt-4 pb-nav view-flow">
        <section className="hub-hero">
          <div className="dashboard-kicker">Control Center</div>
          <h2 className="hub-hero-title">จัดการระบบ งานอัตโนมัติ และข้อมูลสำรองจากที่เดียว</h2>
          <p className="hub-hero-copy">
            ใช้หน้านี้เพื่อตรวจสถานะ Inbox, เปิดกฎอัตโนมัติ, สลับธีม, ตั้ง PIN Lock และสำรองข้อมูลก่อนทำงานต่อ
          </p>

          <div className="hub-status-grid">
            <HubStatusCard
              label="Inbox"
              value={inboxPendingCount ? `${inboxPendingCount} รอตรวจ` : "ไม่มีค้าง"}
              copy={inboxPendingCount ? "เปิดเพื่อตรวจรายการก่อนบันทึก" : "พร้อมรับรายการใหม่"}
            />
            <HubStatusCard
              label="Rules"
              value={rulesStats.total ? `${rulesStats.enabled}/${rulesStats.total} เปิดใช้` : "ยังไม่มี"}
              copy="กฎ auto-fill สำหรับหลังสแกน"
            />
            <HubStatusCard
              label="Theme"
              value={isDark ? "Dark mode" : "Light mode"}
              copy={hasPin ? "PIN Lock เปิดอยู่" : "ยังไม่ตั้ง PIN Lock"}
            />
            <HubStatusCard
              label="Data"
              value={`${transactionCount} รายการ`}
              copy={`${accountCount} บัญชี • ร้านค้า ${merchantCount}`}
            />
          </div>
        </section>

        <HubSection title="ทางลัด" subtitle="ไปยังหน้าที่ใช้บ่อยและมุมมองสรุปหลักของแอป">
          <MoreRow icon={<Home size={20} />} title="หน้าหลัก" subtitle="ภาพรวมรายรับรายจ่าย" onClick={() => navigate("dashboard")} testId="hub-dashboard" />
          <MoreRow icon={<Target size={20} />} title="แผนการเงิน" subtitle="งบ ออม หนี้ บิล และเงินเหลือใช้" onClick={() => navigate("plan")} testId="hub-plan" />
          <MoreRow icon={<Sparkles size={20} />} title="ผู้ช่วยการเงิน" subtitle="ถามเรื่องเงินเหลือใช้ บิล หนี้ และ action ต่อไป" onClick={() => navigate("assistant")} testId="hub-assistant" />
          <MoreRow icon={<BarChart3 size={20} />} title="สถิติ/รายงาน" subtitle="กราฟและ breakdown" onClick={() => navigate("stats")} testId="hub-analytics" />
          <MoreRow icon={<Bell size={20} />} title="งบประมาณ" subtitle="ตั้งงบรายวัน รายเดือน และรายหมวด" onClick={() => navigate("budgets")} testId="hub-budgets" />
          <MoreRow
            icon={<Target size={20} />}
            title="เป้าหมายการออม"
            subtitle={activeGoalCount ? `กำลังออม ${activeGoalCount} เป้าหมาย` : "กองทุนฉุกเฉิน เที่ยว ซื้อของใหญ่ และสำรองจ่ายหนี้"}
            badge={activeGoalCount}
            onClick={() => navigate("goals")}
            testId="hub-goals"
          />
          <MoreRow
            icon={<CreditCard size={20} />}
            title="แผนจัดการหนี้"
            subtitle={activeDebtAccountCount ? `ติดตามบัตรเครดิต ${activeDebtAccountCount} บัญชี` : "ดูยอดหนี้ วันครบกำหนด และแผนปิดหนี้"}
            badge={activeDebtAccountCount}
            onClick={() => navigate("debts")}
            testId="hub-debts"
          />
        </HubSection>

        <HubSection title="ระบบอัตโนมัติ" subtitle="ตรวจงานที่ต้องอนุมัติ กฎประจำ และการทำงานอัตโนมัติของแอป">
          <MoreRow icon={<Settings size={20} />} title="หมวดหมู่" subtitle="จัดกลุ่มรายจ่ายและรายรับ" onClick={() => navigate("categories")} testId="hub-categories" />
          <MoreRow icon={<Inbox size={20} />} title="Inbox" subtitle={inboxSubtitle} badge={inboxPendingCount} onClick={() => navigate("inbox")} testId="hub-inbox" />
          <MoreRow icon={<Repeat size={20} />} title="รายการประจำ" subtitle={recurringHealth} onClick={() => navigate("recurring")} testId="hub-recurring" />
          <MoreRow
            icon={<ReceiptText size={20} />}
            title="บิล & Subscription"
            subtitle="ดูบิลข้างหน้า subscription ที่ตรวจพบ และยอดที่อาจแพงขึ้น"
            onClick={() => navigate("bills")}
            testId="hub-bills"
          />
          <MoreRow icon={<PlayCircle size={20} />} title="รัน Recurring" subtitle="สร้างรายการที่ถึงรอบทันที" onClick={onRunRecurring} testId="hub-run-recurring" />
          <MoreRow
            icon={<Wand2 size={20} />}
            title="กฎอัตโนมัติ"
            subtitle={rulesStats.total ? `เปิดใช้ ${rulesStats.enabled} จาก ${rulesStats.total}` : "ตั้งกฎ auto-fill หลังสแกน"}
            onClick={() => navigate("rules")}
            testId="hub-rules"
          />
          <MoreRow
            icon={<Store size={20} />}
            title="ร้านค้า"
            subtitle={merchantCount ? `${merchantCount} ร้าน` : "จำร้านค้าอัตโนมัติ"}
            onClick={() => navigate("merchants")}
            testId="hub-merchants"
          />
        </HubSection>

        <HubSection title="ข้อมูลและความปลอดภัย" subtitle="สลับธีม ตั้ง PIN และสำรองข้อมูลออกจากเครื่อง">
          <MoreRow
            icon={isDark ? <Moon size={20} /> : <Sun size={20} />}
            title={isDark ? "Dark mode (เปิดอยู่)" : "Dark mode"}
            subtitle={isDark ? "แตะเพื่อปิด" : "แตะเพื่อเปิด"}
            onClick={() => setTheme(isDark ? "light" : "dark")}
            testId="hub-theme"
          />
          <MoreRow
            icon={<Lock size={20} />}
            title="PIN Lock"
            subtitle={hasPin ? "เปิดอยู่ — แตะเพื่อเปลี่ยน" : "ตั้ง PIN 6 หลัก"}
            onClick={openPinModal}
            testId="hub-security"
          />
          <MoreRow icon={<Upload size={20} />} title="Export Backup" subtitle="สำรองข้อมูล JSON" onClick={onExport} testId="hub-export-backup" />
          <MoreRow icon={<Upload size={20} />} title="Import Backup" subtitle="นำเข้าจากไฟล์ JSON" onClick={onPickImport} testId="hub-import-backup" />
          <input ref={fileRef} type="file" accept="application/json,.json" data-testid="hub-import-file" className="hidden" onChange={onImportFile} />
          <MoreRow
            icon={<Upload size={20} />}
            title="Export CSV"
            subtitle="สำหรับ Excel"
            onClick={() => {
              const csv = transactionsToCsv(state.transactions || [], { categories: state.categories, accounts: state.accounts });
              const date = new Date();
              const fileName = `transactions-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}.csv`;
              downloadCsv(csv, fileName);
              showAlert?.("ส่งออก CSV แล้ว");
            }}
            testId="hub-export-csv"
          />
        </HubSection>

        <HubSection>
          <MoreRow icon={<Trash2 size={20} />} title="ลบข้อมูลทั้งหมด" subtitle="ย้อนกลับไม่ได้" danger onClick={onReset} testId="hub-reset" />
        </HubSection>
      </main>

      <PinModal
        isOpen={pinModalOpen}
        hasPin={hasPin}
        pin={pinValue}
        setPin={setPinValue}
        confirmPin={pinConfirm}
        setConfirmPin={setPinConfirm}
        error={pinError}
        onClose={() => {
          setPinModalOpen(false);
          setPinError("");
        }}
        onSave={savePin}
        onRemove={removePin}
      />
    </div>
  );
}
