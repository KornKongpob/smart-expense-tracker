import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AppProvider, useExpenseApp } from "../features/app/AppProvider.jsx";
import AuthScreen from "../features/app/screens/AuthScreen.jsx";
import LoadingScreen from "../features/app/screens/LoadingScreen.jsx";
import { BottomNav, ToastBar } from "../features/app/ui.jsx";
import { useHashView } from "../features/app/useHashView.js";

const SCREEN_LOADERS = {
  dashboard: () => import("../features/app/screens/DashboardScreen.jsx"),
  inbox: () => import("../features/app/screens/InboxScreen.jsx"),
  add: () => import("../features/app/screens/AddScreen.jsx"),
  accounts: () => import("../features/app/screens/AccountsScreen.jsx"),
  categories: () => import("../features/app/screens/CategoriesScreen.jsx"),
  planner: () => import("../features/app/screens/PlannerScreen.jsx"),
  settings: () => import("../features/app/screens/SettingsScreen.jsx"),
};

const PRELOADED_VIEWS = new Set();
const IDLE_PRELOAD_VIEWS = ["inbox", "add", "accounts", "settings", "planner", "categories"];

function preloadView(view) {
  const key = String(view || "").trim();
  const loader = SCREEN_LOADERS[key];
  if (!loader || PRELOADED_VIEWS.has(key)) return;

  PRELOADED_VIEWS.add(key);
  void loader().catch(() => {
    PRELOADED_VIEWS.delete(key);
  });
}

const DashboardScreen = lazy(SCREEN_LOADERS.dashboard);
const InboxScreen = lazy(SCREEN_LOADERS.inbox);
const AddScreen = lazy(SCREEN_LOADERS.add);
const AccountsScreen = lazy(SCREEN_LOADERS.accounts);
const CategoriesScreen = lazy(SCREEN_LOADERS.categories);
const PlannerScreen = lazy(SCREEN_LOADERS.planner);
const SettingsScreen = lazy(SCREEN_LOADERS.settings);

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
  const [appUpdateRegistration, setAppUpdateRegistration] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const pendingCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const headerRef = useRef(null);
  const mainRef = useRef(null);

  useStandaloneMode();

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!session) {
      document.body.removeAttribute("data-finance-shell");
      return undefined;
    }
    document.body.setAttribute("data-finance-shell", "true");
    return () => {
      document.body.removeAttribute("data-finance-shell");
    };
  }, [session]);

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncUpdateState = async () => {
      const registration =
        window.__SMART_EXPENSE_SW__ ||
        (typeof navigator !== "undefined" && navigator.serviceWorker
          ? await navigator.serviceWorker.getRegistration().catch(() => null)
          : null) ||
        null;

      if (registration) {
        window.__SMART_EXPENSE_SW__ = registration;
      }

      setAppUpdateRegistration(registration);
      setUpdateReady(Boolean(registration?.waiting));
    };

    syncUpdateState();
    window.addEventListener("smart-expense:update-ready", syncUpdateState);

    return () => {
      window.removeEventListener("smart-expense:update-ready", syncUpdateState);
    };
  }, []);

  useEffect(() => {
    const node = mainRef.current;
    if (!(node instanceof HTMLElement)) return undefined;

    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = 0;
      node.scrollLeft = 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => {
    preloadView(view);
  }, [view]);

  useEffect(() => {
    if (!session || bootstrapping || typeof window === "undefined") return undefined;

    const warmLikelyRoutes = () => {
      IDLE_PRELOAD_VIEWS.forEach((nextView, index) => {
        window.setTimeout(() => preloadView(nextView), index * 180);
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(warmLikelyRoutes, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(warmLikelyRoutes, 700);
    return () => window.clearTimeout(timeoutId);
  }, [bootstrapping, session]);

  const applyAppUpdate = () => {
    const waiting = appUpdateRegistration?.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      return;
    }

    if (appUpdateRegistration?.update) {
      appUpdateRegistration.update().catch(() => {
        window.location.reload();
      });
      return;
    }

    window.location.reload();
  };

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

      <header ref={headerRef} className="finance-app-header">
        <div className="finance-app-page">
          <div className="finance-app-header-surface">
            <div className="finance-brand">Smart Expense</div>
            <div className="finance-header-state">
              {updateReady ? (
                <button
                  type="button"
                  className="finance-header-pill finance-header-pill-action"
                  onClick={applyAppUpdate}
                >
                  อัปเดตแอป
                </button>
              ) : null}
              {!isOnline ? <span className="finance-header-pill finance-header-pill-warning">ออฟไลน์</span> : null}
              {pendingCount ? <span className="finance-header-pill">{pendingCount} รอซิงก์</span> : null}
            </div>
          </div>
        </div>
      </header>

      <main ref={mainRef} className="finance-app-page finance-app-main" data-app-scroll-root="true">
        <Suspense fallback={<LoadingScreen label="กำลังโหลดหน้าถัดไป" />}>
          {view === "dashboard" ? <DashboardScreen /> : null}
          {view === "inbox" ? <InboxScreen /> : null}
          {view === "add" ? <AddScreen /> : null}
          {view === "accounts" ? <AccountsScreen /> : null}
          {view === "categories" ? <CategoriesScreen /> : null}
          {view === "planner" ? <PlannerScreen /> : null}
          {view === "settings" ? <SettingsScreen /> : null}
        </Suspense>
      </main>

      <BottomNav view={view} onChange={setView} onIntent={preloadView} />
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
