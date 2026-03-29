import { useEffect, useRef, useState } from "react";
import { Download, LogOut, RefreshCcw, Upload } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { ScreenShell, StatusPill } from "../ui.jsx";
import { parseMoneyToSatang } from "../../../utils/money.js";

export default function SettingsScreen() {
  const {
    profile,
    queue,
    legacyAvailable,
    migrationState,
    saving,
    saveProfile,
    exportBackup,
    importBackupFile,
    runLegacyMigration,
    signOut,
  } = useExpenseApp();

  const fileInputRef = useRef(null);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [monthlyTarget, setMonthlyTarget] = useState(
    ((Number(profile?.monthly_target_satang || 0) || 0) / 100).toFixed(2),
  );

  useEffect(() => {
    setDisplayName(profile?.display_name || "");
    setMonthlyTarget(((Number(profile?.monthly_target_satang || 0) || 0) / 100).toFixed(2));
  }, [profile]);

  const pendingCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const migrationTone = profile?.migrated_at ? "success" : "warning";

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

            <label className="finance-field">
              <span className="ui-label">เป้าต่อเดือน</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={monthlyTarget}
                onChange={(event) => setMonthlyTarget(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving}
              onClick={() =>
                saveProfile({
                  displayName,
                  monthlyTargetSatang: parseMoneyToSatang(monthlyTarget),
                })
              }
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
