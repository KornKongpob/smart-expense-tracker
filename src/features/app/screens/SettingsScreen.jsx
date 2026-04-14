import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  FolderTree,
  LogOut,
  RefreshCcw,
  Target,
  Upload,
} from "lucide-react";

import { useExpenseNavigation } from "../navigation.js";
import { useExpenseApp } from "../AppProvider.jsx";
import { ScreenShell, StatusPill } from "../ui.jsx";
import { formatCurrency } from "../../../utils/format.js";

export default function SettingsScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    profile,
    queue,
    legacyAvailable,
    migrationState,
    plannerSummary,
    planningConfig,
    budgetPlanSnapshot,
    saving,
    saveProfile,
    exportBackup,
    importBackupFile,
    runLegacyMigration,
    signOut,
  } = useExpenseApp();

  const fileInputRef = useRef(null);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");

  useEffect(() => {
    setDisplayName(profile?.display_name || "");
  }, [profile]);

  const pendingCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const migrationTone = profile?.migrated_at ? "success" : "warning";
  const plannerCount = Number(plannerSummary.activeGoalCount || 0) + Number(plannerSummary.activeDebtCount || 0);
  const plannerBudgetSatang =
    (!budgetPlanSnapshot?.hasAppliedBudget && !budgetPlanSnapshot?.usesLegacyMonthlyTarget)
      ? budgetPlanSnapshot?.suggestedExpenseBudgetSatang || 0
      : budgetPlanSnapshot?.activeExpenseBudgetSatang || 0;

  return (
    <ScreenShell title="ตั้งค่า">
      <section className="finance-grid finance-grid-main">
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div className="finance-panel-title">โปรไฟล์</div>
          </div>

          <div className="finance-form">
            <label className="finance-field">
              <span className="ui-label">ชื่อ</span>
              <input className="ui-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>

            <div className="ui-toast ui-toast--info finance-inline-note">
              <div className="finance-toast-copy">
                Planner เป็นจุดตั้งค่าหลักของรายได้ เงินออม และงบรายเดือน
                <br />
                รายได้: {planningConfig?.incomeMode === "fixed" ? "คงที่" : "เฉลี่ยย้อนหลัง"} · เงินออม: {planningConfig?.savingsMode === "percent" ? "เปอร์เซ็นต์" : "จำนวนเงิน"} · หนี้: {planningConfig?.debtStrategyMode === "survival" ? "ประคองรายเดือน" : "เน้นปิดหนี้"}
                <br />
                งบเดือนนี้: {formatCurrency(plannerBudgetSatang)} · เงินออม {formatCurrency(budgetPlanSnapshot?.savingsReserveSatang || 0)} · หนี้ขั้นต่ำ {formatCurrency(budgetPlanSnapshot?.debtMinimumSatang || 0)}
              </div>
            </div>

            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving}
              onClick={() => saveProfile({ displayName })}
            >
              บันทึก
            </button>
          </div>
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div className="finance-panel-title">เครื่องมือ</div>
            {legacyAvailable ? (
              <StatusPill tone={migrationTone}>{profile?.migrated_at ? "ย้ายแล้ว" : "มีข้อมูลเก่า"}</StatusPill>
            ) : null}
          </div>

          <div className="finance-list">
            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("planner")}
              data-testid="open-planner"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <Target size={18} />
                  </span>
                  <div>
                    <div className="finance-row-title">วางแผนการเงิน</div>
                    <div className="finance-row-meta">ตั้งค่ารายได้ เงินออม หนี้ และ budget รายหมวดจากหน้าหลักเดียว</div>
                  </div>
                </div>

                <div className="finance-row-side">
                  {plannerCount ? <StatusPill tone="default">{plannerCount} แผน</StatusPill> : <ChevronRight size={16} />}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("categories")}
              data-testid="open-categories"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <FolderTree size={18} />
                  </span>
                  <div>
                    <div className="finance-row-title">หมวดหมู่</div>
                    <div className="finance-row-meta">จัดการหมวดหลักและหมวดย่อย</div>
                  </div>
                </div>

                <div className="finance-row-side">
                  <ChevronRight size={16} />
                </div>
              </div>
            </button>
          </div>

          <div className="finance-inline-actions">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => exportBackup()} disabled={saving}>
              <Download size={16} />
              ส่งออก
            </button>

            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Upload size={16} />
              นำเข้า
            </button>

            {legacyAvailable ? (
              <button
                type="button"
                className="ui-btn ui-btn-secondary"
                disabled={saving || migrationState.running}
                onClick={() => runLegacyMigration()}
              >
                <RefreshCcw size={16} />
                {migrationState.running ? "กำลังย้าย..." : "ย้ายข้อมูลเก่า"}
              </button>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                await importBackupFile(file);
                event.target.value = "";
              }}
            />
          </div>

          {migrationState.failures?.length ? (
            <div className="ui-toast ui-toast--error finance-inline-note">
              <div className="finance-toast-copy">ย้ายข้อมูลเตือน {migrationState.failures.length} รายการ</div>
            </div>
          ) : null}
        </article>
      </section>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div className="finance-panel-title">สถานะ</div>
          <StatusPill tone={pendingCount ? "warning" : "success"}>
            {pendingCount ? `รอซิงก์ ${pendingCount}` : "ไม่มีรายการรอ"}
          </StatusPill>
        </div>

        <div className="finance-inline-actions">
          <button type="button" className="ui-btn ui-btn-danger" onClick={() => signOut()}>
            <LogOut size={16} />
            ออกจากระบบ
          </button>
        </div>
      </article>
    </ScreenShell>
  );
}
