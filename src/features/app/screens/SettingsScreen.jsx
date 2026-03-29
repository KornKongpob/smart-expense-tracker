import { useEffect, useRef, useState } from "react";
import { Download, LogOut, RefreshCcw, Upload } from "lucide-react";

import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, ScreenShell, StatusPill } from "../ui.jsx";
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

  return (
    <ScreenShell
      eyebrow="Settings"
      title="Settings"
      subtitle="Profile, target, backup, and sync."
    >
      <section className="finance-grid finance-grid-main">
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Profile</div>
              <p className="finance-panel-copy">Personal workspace and monthly target.</p>
            </div>
          </div>

          <div className="finance-form">
            <label className="finance-field">
              <span className="ui-label">Display name</span>
              <input
                className="ui-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="finance-field">
              <span className="ui-label">Monthly target (THB)</span>
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
              Save profile
            </button>
          </div>
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Migration</div>
              <p className="finance-panel-copy">Import older local data into Supabase.</p>
            </div>
            {legacyAvailable ? (
              <StatusPill tone={profile?.migrated_at ? "success" : "warning"}>
                {profile?.migrated_at ? "Migrated" : "Local data detected"}
              </StatusPill>
            ) : (
              <StatusPill tone="default">No local snapshot</StatusPill>
            )}
          </div>

          {legacyAvailable ? (
            <div className="finance-settings-stack">
              <button
                type="button"
                className="ui-btn ui-btn-secondary"
                disabled={saving || migrationState.running}
                onClick={() => runLegacyMigration()}
              >
                <RefreshCcw size={16} />
                {migrationState.running ? "Importing..." : "Run migration now"}
              </button>
              {migrationState.failures?.length ? (
                <div className="ui-toast ui-toast--error">
                  <div className="finance-toast-copy">
                    {migrationState.failures.length} import warnings remain.
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyPanel
              title="Nothing to migrate"
              copy="Local snapshots will appear here."
            />
          )}
        </article>
      </section>

      <section className="finance-grid finance-grid-main">
        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Backup tools</div>
              <p className="finance-panel-copy">Export JSON or import a backup file.</p>
            </div>
          </div>
          <div className="finance-inline-actions">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => exportBackup()} disabled={saving}>
              <Download size={16} />
              Export JSON
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Upload size={16} />
              Import backup
            </button>
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
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-panel-head">
            <div>
              <div className="finance-panel-title">Sync state</div>
              <p className="finance-panel-copy">Offline queue status.</p>
            </div>
          </div>
          <div className="finance-settings-stack">
            <StatusPill tone={queue.manual.length || queue.scans.length ? "warning" : "success"}>
              {queue.scans.length} scan uploads, {queue.manual.length} manual drafts pending
            </StatusPill>
            <button type="button" className="ui-btn ui-btn-danger" onClick={() => signOut()}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </article>
      </section>
    </ScreenShell>
  );
}
