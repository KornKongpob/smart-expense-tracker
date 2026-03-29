import { AppProvider, useExpenseApp } from "../features/app/AppProvider.jsx";
import AuthScreen from "../features/app/screens/AuthScreen.jsx";
import LoadingScreen from "../features/app/screens/LoadingScreen.jsx";
import DashboardScreen from "../features/app/screens/DashboardScreen.jsx";
import InboxScreen from "../features/app/screens/InboxScreen.jsx";
import AddScreen from "../features/app/screens/AddScreen.jsx";
import AccountsScreen from "../features/app/screens/AccountsScreen.jsx";
import SettingsScreen from "../features/app/screens/SettingsScreen.jsx";
import { BottomNav, ToastBar } from "../features/app/ui.jsx";
import { useHashView } from "../features/app/useHashView.js";

function SignedInApp() {
  const { authReady, session, profile, bootstrapping, queue, toast, clearToast, isOnline } = useExpenseApp();
  const [view, setView] = useHashView();
  const pendingCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const sessionLabel =
    profile?.display_name ||
    (session?.user?.is_anonymous ? "Guest workspace" : session?.user?.email?.split("@")?.[0] || "Personal");

  if (!authReady) {
    return <LoadingScreen label="Checking your session" />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (bootstrapping) {
    return <LoadingScreen label="Connecting dashboard, inbox, and accounts" />;
  }

  return (
    <div className="finance-app-shell">
      <ToastBar toast={toast} onClose={clearToast} />

      <header className="ui-page finance-app-header">
        <div className="app-header-surface finance-app-header-surface">
          <div>
            <div className="finance-brand">Smart Expense</div>
            <div className="finance-brand-copy">{sessionLabel}</div>
          </div>
          <div className="finance-header-state">
            {!isOnline ? <span className="finance-header-pill finance-header-pill-warning">Offline</span> : null}
            {pendingCount ? <span className="finance-header-pill">{pendingCount} queued</span> : null}
          </div>
        </div>
      </header>

      <main className="ui-page pb-nav finance-app-main">
        {view === "dashboard" ? <DashboardScreen /> : null}
        {view === "inbox" ? <InboxScreen /> : null}
        {view === "add" ? <AddScreen /> : null}
        {view === "accounts" ? <AccountsScreen /> : null}
        {view === "settings" ? <SettingsScreen /> : null}
      </main>

      <BottomNav view={view} onChange={setView} />
    </div>
  );
}

export default function AppRoot() {
  return (
    <AppProvider>
      <SignedInApp />
    </AppProvider>
  );
}
