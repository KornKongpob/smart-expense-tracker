"use client";

import {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { AppProvider, useExpenseApp } from "../features/app/AppProvider.jsx";
import {
  ExpenseNavigationProvider,
  setPendingAccountDeepLink,
} from "../features/app/navigation.js";
import {
  getCanonicalPathForPathname,
  getPathForView,
  getViewForPathname,
} from "../features/app/routes.js";
import NotificationCenter from "../features/app/NotificationCenter.jsx";
import ScreenErrorBoundary from "../features/app/ScreenErrorBoundary.jsx";
import AuthScreen from "../features/app/screens/AuthScreen.jsx";
import LoadingScreen from "../features/app/screens/LoadingScreen.jsx";
import { BottomNav, ToastBar } from "../features/app/ui.jsx";

const SCREEN_LOADERS = {
  dashboard: () => import("../features/app/screens/DashboardScreen.jsx"),
  inbox: () => import("../features/app/screens/InboxScreen.jsx"),
  add: () => import("../features/app/screens/AddScreen.jsx"),
  transactions: () => import("../features/app/screens/TransactionsScreen.jsx"),
  accounts: () => import("../features/app/screens/AccountsScreen.jsx"),
  plan: () => import("../features/app/screens/PlanScreen.jsx"),
  assistant: () => import("../features/app/screens/AssistantScreen.jsx"),
  categories: () => import("../features/app/screens/CategoriesScreen.jsx"),
  planner: () => import("../features/app/screens/PlannerScreen.jsx"),
  goals: () => import("../features/app/screens/GoalsScreen.jsx"),
  debts: () => import("../features/app/screens/DebtPlannerScreen.jsx"),
  "credit-statements": () => import("../features/app/screens/CreditStatementsScreen.jsx"),
  "salary-planner": () => import("../features/app/screens/SalaryPlannerScreen.jsx"),
  bills: () => import("../features/app/screens/BillsScreen.jsx"),
  recurring: () => import("../features/app/screens/RecurringScreen.jsx"),
  settings: () => import("../features/app/screens/SettingsScreen.jsx"),
};

const PRELOADED_VIEWS = new Set();
const IDLE_PRELOAD_VIEWS = ["plan", "assistant", "inbox", "add", "transactions", "accounts", "settings", "planner", "goals", "debts", "credit-statements", "salary-planner", "bills", "categories", "recurring"];

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
const TransactionsScreen = lazy(SCREEN_LOADERS.transactions);
const AccountsScreen = lazy(SCREEN_LOADERS.accounts);
const PlanScreen = lazy(SCREEN_LOADERS.plan);
const AssistantScreen = lazy(SCREEN_LOADERS.assistant);
const CategoriesScreen = lazy(SCREEN_LOADERS.categories);
const PlannerScreen = lazy(SCREEN_LOADERS.planner);
const GoalsScreen = lazy(SCREEN_LOADERS.goals);
const DebtPlannerScreen = lazy(SCREEN_LOADERS.debts);
const CreditStatementsScreen = lazy(SCREEN_LOADERS["credit-statements"]);
const SalaryPlannerScreen = lazy(SCREEN_LOADERS["salary-planner"]);
const BillsScreen = lazy(SCREEN_LOADERS.bills);
const RecurringScreen = lazy(SCREEN_LOADERS.recurring);
const SettingsScreen = lazy(SCREEN_LOADERS.settings);

const SCREEN_COMPONENTS = {
  dashboard: DashboardScreen,
  inbox: InboxScreen,
  add: AddScreen,
  transactions: TransactionsScreen,
  accounts: AccountsScreen,
  plan: PlanScreen,
  assistant: AssistantScreen,
  categories: CategoriesScreen,
  planner: PlannerScreen,
  goals: GoalsScreen,
  debts: DebtPlannerScreen,
  "credit-statements": CreditStatementsScreen,
  "salary-planner": SalaryPlannerScreen,
  bills: BillsScreen,
  recurring: RecurringScreen,
  settings: SettingsScreen,
};

const SCREEN_TITLES = {
  dashboard: "Smart Expense",
  inbox: "Inbox | Smart Expense",
  add: "Add | Smart Expense",
  transactions: "Transactions | Smart Expense",
  accounts: "Accounts | Smart Expense",
  plan: "Plan | Smart Expense",
  assistant: "Assistant | Smart Expense",
  categories: "Categories | Smart Expense",
  planner: "Planner | Smart Expense",
  goals: "Savings Goals | Smart Expense",
  debts: "Debt Planner | Smart Expense",
  "credit-statements": "Credit Statements | Smart Expense",
  "salary-planner": "Salary Planner | Smart Expense",
  bills: "Bills | Smart Expense",
  recurring: "Recurring | Smart Expense",
  settings: "Settings | Smart Expense",
};

const SCREEN_HEADER_LABELS = {
  "credit-statements": "รอบบิลบัตรเครดิต",
  "salary-planner": "วางแผนจ่ายบัตรจากเงินเดือน",
  debts: "แผนจัดการหนี้",
  goals: "เป้าหมายการออม",
  bills: "บิล & Subscription",
  recurring: "รายการประจำ",
  dashboard: "ภาพรวม",
  inbox: "กล่องรับ",
  add: "เพิ่มรายการ",
  transactions: "รายการย้อนหลัง",
  accounts: "บัญชี",
  plan: "แผนการเงิน",
  assistant: "ผู้ช่วยการเงิน",
  categories: "หมวดหมู่",
  planner: "วางแผนการเงิน",
  settings: "ตั้งค่า",
};

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

function useAppServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return undefined;

    const CACHE_PREFIX = "smart-expense-runtime";
    const CACHE_PREFIXES = [CACHE_PREFIX, "smart-expense-runtime-v2"];
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

    const clearDevServiceWorkers = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const keys = await window.caches.keys();
          await Promise.all(
            keys
              .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
              .map((key) => window.caches.delete(key)),
          );
        }
      } catch {
        // Ignore best-effort dev cleanup failures.
      }
    };

    if (!isProd) {
      const handleLoad = () => {
        void clearDevServiceWorkers();
      };
      window.addEventListener("load", handleLoad);
      return () => {
        window.removeEventListener("load", handleLoad);
      };
    }

    let refreshIntervalId = 0;
    const buildId = String(
      process.env.NEXT_PUBLIC_APP_BUILD_ID || document.lastModified || process.env.NODE_ENV || "dev",
    )
      .trim()
      .replace(/\s+/g, "-");
    const swUrl = `/sw.js?v=${encodeURIComponent(buildId)}`;
    let refreshing = false;

    const handleLoad = async () => {
      try {
        const registration = await navigator.serviceWorker.register(swUrl, { scope: "/" });
        window.__SMART_EXPENSE_SW__ = registration;

        if (registration.waiting) {
          window.dispatchEvent(new CustomEvent("smart-expense:update-ready"));
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              window.__SMART_EXPENSE_SW__ = registration;
              window.dispatchEvent(new CustomEvent("smart-expense:update-ready"));
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        const refreshRegistration = async () => {
          try {
            await registration.update();
            if (registration.waiting) {
              window.__SMART_EXPENSE_SW__ = registration;
              window.dispatchEvent(new CustomEvent("smart-expense:update-ready"));
            }
          } catch {
            // Ignore best-effort background refresh failures.
          }
        };

        refreshIntervalId = window.setInterval(refreshRegistration, 60 * 60 * 1000);
      } catch {
        // Ignore service worker registration failures.
      }
    };

    window.addEventListener("load", handleLoad);
    return () => {
      window.removeEventListener("load", handleLoad);
      if (refreshIntervalId) window.clearInterval(refreshIntervalId);
    };
  }, []);
}

function SignedInApp() {
  const {
    authReady,
    session,
    bootstrapping,
    queue,
    toast,
    clearToast,
    isOnline,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotification,
  } = useExpenseApp();
  const router = useRouter();
  const pathname = usePathname();
  const view = getViewForPathname(pathname);
  const [appUpdateRegistration, setAppUpdateRegistration] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const pendingCount = Number(queue.scans.length || 0) + Number(queue.manual.length || 0);
  const headerRef = useRef(null);
  const mainRef = useRef(null);
  const canonicalPath = getCanonicalPathForPathname(pathname);
  const activeScreenLabel = SCREEN_HEADER_LABELS[view] || SCREEN_HEADER_LABELS.dashboard;

  useStandaloneMode();
  useAppServiceWorker();

  useEffect(() => {
    if (canonicalPath === pathname) return;
    startTransition(() => {
      router.replace(canonicalPath);
    });
  }, [canonicalPath, pathname, router]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = SCREEN_TITLES[view] || SCREEN_TITLES.dashboard;
  }, [view]);

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
  }, [isOnline, pendingCount, unreadNotificationCount, view]);

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

    void syncUpdateState();
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
  }, [pathname]);

  useEffect(() => {
    setNotificationOpen(false);
  }, [pathname]);

  useEffect(() => {
    preloadView(view);
  }, [view]);

  useEffect(() => {
    if (!session || bootstrapping || typeof window === "undefined") return undefined;

    const warmLikelyRoutes = () => {
      IDLE_PRELOAD_VIEWS.forEach((nextView, index) => {
        window.setTimeout(() => {
          preloadView(nextView);
          router.prefetch?.(getPathForView(nextView));
        }, index * 180);
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(warmLikelyRoutes, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(warmLikelyRoutes, 700);
    return () => window.clearTimeout(timeoutId);
  }, [bootstrapping, router, session]);

  const navigationValue = useMemo(
    () => ({
      view,
      navigateToView: (nextView, { replace = false } = {}) => {
        const nextPath = getPathForView(nextView);
        startTransition(() => {
          if (replace) router.replace(nextPath);
          else router.push(nextPath);
        });
      },
      navigateToPath: (nextPath, { replace = false } = {}) => {
        const targetPath = String(nextPath || "").trim() || getPathForView(view);
        startTransition(() => {
          if (replace) router.replace(targetPath);
          else router.push(targetPath);
        });
      },
      prefetchView: (nextView) => {
        preloadView(nextView);
        router.prefetch?.(getPathForView(nextView));
      },
      openAccountDetails: (accountId) => {
        setPendingAccountDeepLink(accountId);
        startTransition(() => {
          router.push(getPathForView("accounts"));
        });
      },
    }),
    [router, view],
  );

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

  // Toasts must survive the signed-out and bootstrapping branches too, otherwise
  // feedback like the sign-up confirmation notice is pushed but never rendered.
  if (!authReady) {
    return (
      <>
        <ToastBar toast={toast} onClose={clearToast} />
        <LoadingScreen label="กำลังเข้าใช้" />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <ToastBar toast={toast} onClose={clearToast} />
        <AuthScreen />
      </>
    );
  }

  if (bootstrapping) {
    return (
      <>
        <ToastBar toast={toast} onClose={clearToast} />
        <LoadingScreen label="กำลังโหลด" />
      </>
    );
  }

  const ActiveScreen = SCREEN_COMPONENTS[view] || DashboardScreen;

  return (
    <ExpenseNavigationProvider value={navigationValue}>
      <div className="finance-app-shell">
        <ToastBar toast={toast} onClose={clearToast} />

        <header ref={headerRef} className="finance-app-header">
          <div className="finance-app-page">
            <div className="finance-app-header-surface">
              <div className="finance-brand-block">
                <div className="finance-brand">Smart Expense</div>
                <div className="finance-brand-context">{activeScreenLabel}</div>
              </div>
              <div className="finance-header-state">
                <button
                  type="button"
                  className="ui-icon-btn finance-header-bell"
                  onClick={() => setNotificationOpen(true)}
                  aria-label="Open notifications"
                >
                  <Bell size={18} />
                  {unreadNotificationCount ? (
                    <span className="ui-badge finance-header-bell-badge">{unreadNotificationCount}</span>
                  ) : null}
                </button>
                {updateReady ? (
                  <button
                    type="button"
                    className="finance-header-pill finance-header-pill-action"
                    onClick={applyAppUpdate}
                  >
                    อัปเดตแอป
                  </button>
                ) : null}
                {!isOnline ? (
                  <span className="finance-header-pill finance-header-pill-warning">
                    ออฟไลน์
                  </span>
                ) : null}
                {pendingCount ? <span className="finance-header-pill">{pendingCount} รอซิงก์</span> : null}
              </div>
            </div>
          </div>
        </header>

        <main ref={mainRef} className="finance-app-page finance-app-main" data-app-scroll-root="true">
          <ScreenErrorBoundary resetKey={view}>
            <Suspense fallback={<LoadingScreen label="กำลังโหลดหน้าถัดไป" />}>
              <ActiveScreen />
            </Suspense>
          </ScreenErrorBoundary>
        </main>

        <BottomNav
          view={view}
          onChange={navigationValue.navigateToView}
          onIntent={navigationValue.prefetchView}
        />
        <NotificationCenter
          open={notificationOpen}
          onClose={() => setNotificationOpen(false)}
          notifications={notifications}
          unreadCount={unreadNotificationCount}
          markNotificationRead={markNotificationRead}
          markAllNotificationsRead={markAllNotificationsRead}
          dismissNotification={dismissNotification}
        />
      </div>
    </ExpenseNavigationProvider>
  );
}

export default function AppRoot() {
  return (
    <AppProvider>
      <SignedInApp />
    </AppProvider>
  );
}
