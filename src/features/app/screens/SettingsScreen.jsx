import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  ChevronRight,
  CreditCard,
  Download,
  FolderTree,
  Inbox,
  LogOut,
  ReceiptText,
  Repeat2,
  RefreshCcw,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";

import { useExpenseNavigation } from "../navigation.js";
import { useExpenseApp } from "../AppProvider.jsx";
import { ScreenShell, StatusPill } from "../ui.jsx";
import { formatCurrency } from "../../../utils/format.js";

export default function SettingsScreen() {
  const { navigateToPath, navigateToView } = useExpenseNavigation();
  const {
    profile,
    queue,
    legacyAvailable,
    migrationState,
    plannerSummary,
    planningConfig,
    budgetPlanSnapshot,
    plannerDecisionSummary,
    recurringRules,
    recurringDueToday,
    notificationPermission,
    notificationsSupported,
    saving,
    saveProfile,
    exportBackup,
    exportBackupWithAttachments,
    importBackupFile,
    requestBudgetNotificationPermission,
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
  const recurringCount = Array.isArray(recurringRules) ? recurringRules.length : 0;
  const recurringDueCount = Array.isArray(recurringDueToday) ? recurringDueToday.length : 0;
  const plannerBudgetSatang =
    (!budgetPlanSnapshot?.hasAppliedBudget && !budgetPlanSnapshot?.usesLegacyMonthlyTarget)
      ? budgetPlanSnapshot?.suggestedExpenseBudgetSatang || 0
      : budgetPlanSnapshot?.activeExpenseBudgetSatang || 0;
  const plannerAttentionCount = Number(
    plannerDecisionSummary?.attentionCount ?? budgetPlanSnapshot?.plannerAttentionCount ?? 0,
  );
  const plannerConfidencePct = Math.max(
    0,
    Math.min(
      100,
      Math.round(Number(plannerDecisionSummary?.confidenceScore ?? budgetPlanSnapshot?.plannerConfidenceScore ?? 0) * 100),
    ),
  );
  const plannerSummaryItems = [
    {
      label: "รายได้",
      value: planningConfig?.incomeMode === "fixed" ? "คงที่" : "เฉลี่ยย้อนหลัง",
    },
    {
      label: "เงินออม",
      value: planningConfig?.savingsMode === "percent" ? "เปอร์เซ็นต์" : "จำนวนเงิน",
    },
    {
      label: "หนี้",
      value: planningConfig?.debtStrategyMode === "survival" ? "ประคองรายเดือน" : "เน้นปิดหนี้",
    },
  ];
  const notificationStatusLabel =
    notificationPermission === "granted"
      ? "เปิดใช้งานแล้ว"
      : notificationPermission === "denied"
        ? "ถูกบล็อกในเบราว์เซอร์"
        : notificationsSupported
          ? "ยังไม่ได้ขอสิทธิ์"
          : "เบราว์เซอร์ไม่รองรับ";
  const notificationActionLabel =
    notificationPermission === "granted" ? "เปิดแล้ว" : "เปิดการแจ้งเตือน";

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
              <input
                className="ui-input"
                name="displayName"
                autoComplete="nickname"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>

            <div className="finance-settings-summary">
              <div className="finance-chip-grid">
                {plannerAttentionCount ? <StatusPill tone="warning">ควรปรับ {plannerAttentionCount} หมวด</StatusPill> : null}
                {plannerConfidencePct ? <StatusPill tone="default">ความมั่นใจ {plannerConfidencePct}%</StatusPill> : null}
              </div>
              {plannerDecisionSummary?.title ? (
                <div className="finance-settings-summary-copy">
                  <strong>{plannerDecisionSummary.title}</strong>
                </div>
              ) : null}
              <div className="finance-settings-summary-copy">
                แผนการเงินเป็นจุดตั้งค่าหลักของรายได้ เงินออม หนี้ และงบรายเดือน
                {plannerAttentionCount ? ` · ควรปรับ ${plannerAttentionCount} หมวด` : ""}
                {plannerConfidencePct ? ` · ความมั่นใจ ${plannerConfidencePct}%` : ""}
              </div>
              <div className="finance-settings-summary-grid">
                {plannerSummaryItems.map((item) => (
                  <div key={item.label} className="finance-settings-summary-pill">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              {plannerDecisionSummary?.copy ? (
                <div className="finance-settings-summary-footnote">{plannerDecisionSummary.copy}</div>
              ) : null}
              <div className="finance-settings-summary-footnote">
                งบเดือนนี้ {formatCurrency(plannerBudgetSatang)} · เงินออม {formatCurrency(budgetPlanSnapshot?.savingsReserveSatang || 0)} · หนี้ขั้นต่ำ {formatCurrency(budgetPlanSnapshot?.debtMinimumSatang || 0)}
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
              onClick={() => navigateToView("plan")}
              data-testid="open-plan"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <Target size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">แผนการเงิน</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      งบ ออม หนี้ บิล และเงินเหลือใช้ในหน้าเดียว
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  <ChevronRight size={16} />
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("assistant")}
              data-testid="open-assistant"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <Sparkles size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">ผู้ช่วยการเงิน</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      ถามเรื่องเงินเหลือใช้ บิล หนี้ และ action ต่อไปจากข้อมูลในเครื่อง
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  <ChevronRight size={16} />
                </div>
              </div>
            </button>

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
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">วางแผนการเงิน</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      {plannerDecisionSummary?.copy || "ตั้งค่ารายได้ เงินออม หนี้ และงบรายหมวดจากหน้าเดียว"}
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  {plannerAttentionCount ? (
                    <StatusPill tone="warning">ควรปรับ {plannerAttentionCount}</StatusPill>
                  ) : plannerConfidencePct ? (
                    <StatusPill tone="default">{plannerConfidencePct}%</StatusPill>
                  ) : plannerCount ? (
                    <StatusPill tone="default">{plannerCount} แผน</StatusPill>
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToPath("/stats")}
              data-testid="open-stats"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <BarChart3 size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">สถิติ/รายงาน</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      เส้นทางรายงานเดิมยังเปิดได้จากตรงนี้
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  <ChevronRight size={16} />
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("inbox")}
              data-testid="open-inbox"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <Inbox size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">กล่องรับ</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      ตรวจรายการสแกนและรายการรออนุมัติ
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  {pendingCount ? <StatusPill tone="warning">{pendingCount}</StatusPill> : <ChevronRight size={16} />}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("debts")}
              data-testid="open-debts"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <CreditCard size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">แผนจัดการหนี้</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      ดูยอดหนี้ วันครบกำหนด และจำลองลำดับปิดหนี้จากบัตรเครดิต
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  {plannerSummary.activeDebtCount ? (
                    <StatusPill tone="warning">{plannerSummary.activeDebtCount} แผน</StatusPill>
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("credit-statements")}
              data-testid="open-credit-statements"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <CreditCard size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">รอบบิลบัตรเครดิต</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      กรอกยอดขั้นต่ำ/ยอดเต็มหลังวันตัดรอบ
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  <ChevronRight size={16} />
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("goals")}
              data-testid="open-goals"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <Target size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">เป้าหมายการออม</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      วางแผนเงินก้อน กองทุนฉุกเฉิน เที่ยว ซื้อของใหญ่ และเงินสำรองจ่ายหนี้
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  <ChevronRight size={16} />
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("recurring")}
              data-testid="open-recurring"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <Repeat2 size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">รายการประจำ</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      ตั้งกฎรายการประจำ เช่น เงินเดือน ค่าบ้าน หรือโอนเงินออม
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  {recurringDueCount ? (
                    <StatusPill tone="warning">ถึงรอบ {recurringDueCount}</StatusPill>
                  ) : recurringCount ? (
                    <StatusPill tone="default">{recurringCount} กฎ</StatusPill>
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="finance-list-button"
              onClick={() => navigateToView("bills")}
              data-testid="open-bills"
            >
              <div className="finance-row">
                <div className="finance-row-main">
                  <span className="finance-category-icon finance-account-icon">
                    <ReceiptText size={18} />
                  </span>
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">บิล & Subscription</div>
                    <div className="finance-row-meta finance-row-meta-wrap">
                      ดูบิลข้างหน้า subscription ที่ตรวจพบ และยอดที่อาจแพงขึ้น
                    </div>
                  </div>
                </div>

                <div className="finance-row-side">
                  <ChevronRight size={16} />
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
                  <div className="finance-settings-row-copy">
                    <div className="finance-row-title">หมวดหมู่</div>
                    <div className="finance-row-meta finance-row-meta-wrap">จัดการหมวดหลักและหมวดย่อย</div>
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
              onClick={() => exportBackupWithAttachments()}
              disabled={saving}
            >
              <ReceiptText size={16} />
              ส่งออก Backup พร้อมรูปใบเสร็จ
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

          <div className="finance-inline-note">
            <div className="finance-row">
              <div className="finance-row-main">
                <span className="finance-category-icon finance-account-icon">
                  <Bell size={18} />
                </span>
                <div className="finance-settings-row-copy">
                  <div className="finance-row-title">Budget notifications</div>
                  <div className="finance-row-meta finance-row-meta-wrap">{notificationStatusLabel}</div>
                </div>
              </div>

              <div className="finance-row-side">
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  disabled={saving || !notificationsSupported || notificationPermission === "granted"}
                  onClick={() => requestBudgetNotificationPermission()}
                >
                  <Bell size={16} />
                  {notificationActionLabel}
                </button>
              </div>
            </div>
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
