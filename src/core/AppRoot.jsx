import { useEffect, useLayoutEffect, useRef } from "react";

import { AppProvider, useExpenseApp } from "../features/app/AppProvider.jsx";
import AuthScreen from "../features/app/screens/AuthScreen.jsx";
import LoadingScreen from "../features/app/screens/LoadingScreen.jsx";
import DashboardScreen from "../features/app/screens/DashboardScreen.jsx";
import InboxScreen from "../features/app/screens/InboxScreen.jsx";
import AddScreen from "../features/app/screens/AddScreen.jsx";
import AccountsScreen from "../features/app/screens/AccountsScreen.jsx";
import CategoriesScreen from "../features/app/screens/CategoriesScreen.jsx";
import PlannerScreen from "../features/app/screens/PlannerScreen.jsx";
import SettingsScreen from "../features/app/screens/SettingsScreen.jsx";
import { BottomNav, ToastBar } from "../features/app/ui.jsx";
import { useHashView } from "../features/app/useHashView.js";

function useStandaloneMode() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(display-mode: standalone)");
    const apply = () => {
      const standalone = media.matches || window.navigator.standalone === true;
      if (standalone) document.body.setAttribute("data-standalone", "true");
      else document.body.removeAttribute("data-standalone");
    };

    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      document.body.removeAttribute("data-standalone");
    };
  }, []);
}

function SignedInApp() {
  const { authReady, session, bootstrapping, queue, toast, clearToast, isOnline } = useExpenseApp();
  const [view, setView] = useHashView();
  const pendingCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const headerRef = useRef(null);

  useStandaloneMode();

  useLayoutEffect(() => {
    const node = headerRef.current;
    if (!node || typeof document === "undefined") return undefined;

    const updateHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height || 0);
      if (nextHeight > 0) {
        document.documentElement.style.setProperty("--finance-app-header-h", `${nextHeight}px`);
      }
    };

    updateHeight();

    let observer;
    try {
      observer = new ResizeObserver(() => updateHeight());
      observer.observe(node);
    } catch {
      // Ignore browsers without ResizeObserver support.
    }

    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
      observer?.disconnect?.();
    };
  }, [isOnline, pendingCount, view]);

  if (!authReady) {
    return <LoadingScreen label="กำลังเข้าใช้" />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (bootstrapping) {
    return <LoadingScreen label="กำลังโหลด" />;
  }

  return (
    <div className="finance-app-shell">
      <ToastBar toast={toast} onClose={clearToast} />

      <header ref={headerRef} className="finance-app-page finance-app-header">
        <div className="finance-app-header-surface">
          <div className="finance-brand">Smart Expense</div>
          <div className="finance-header-state">
            {!isOnline ? <span className="finance-header-pill finance-header-pill-warning">ออฟไลน์</span> : null}
            {pendingCount ? <span className="finance-header-pill">{pendingCount} รอซิงก์</span> : null}
          </div>
        </div>
      </header>

      <main className="finance-app-page finance-app-main">
        {view === "dashboard" ? <DashboardScreen /> : null}
        {view === "inbox" ? <InboxScreen /> : null}
        {view === "add" ? <AddScreen /> : null}
        {view === "accounts" ? <AccountsScreen /> : null}
        {view === "categories" ? <CategoriesScreen /> : null}
        {view === "planner" ? <PlannerScreen /> : null}
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
