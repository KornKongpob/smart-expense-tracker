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
import AuthScreen from "../features/app/screens/AuthScreen.jsx";
import LoadingScreen from "../features/app/screens/LoadingScreen.jsx";
import { BottomNav, ToastBar } from "../features/app/ui.jsx";

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

const SCREEN_COMPONENTS = {
  dashboard: DashboardScreen,
  inbox: InboxScreen,
  add: AddScreen,
  accounts: AccountsScreen,
  categories: CategoriesScreen,
  planner: PlannerScreen,
  settings: SettingsScreen,
};

const SCREEN_TITLES = {
  dashboard: "Smart Expense",
  inbox: "Inbox | Smart Expense",
  add: "Add | Smart Expense",
  accounts: "Accounts | Smart Expense",
  categories: "Categories | Smart Expense",
  planner: "Planner | Smart Expense",
  settings: "Settings | Smart Expense",
};

const SCREEN_HEADER_LABELS = {
  dashboard: "ภาพรวม",
  inbox: "กล่องรับ",
  add: "เพิ่มรายการ",
  accounts: "บัญชี",
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

        window.setInterval(refreshRegistration, 60 * 60 * 1000);
      } catch {
        // Ignore service worker registration failures.
      }
    };

    window.addEventListener("load", handleLoad);
    return () => {
      window.removeEventListener("load", handleLoad);
    };
  }, []);
}

function SignedInApp() {
  const { authReady, session, bootstrapping, queue, toast, clearToast, isOnline } = useExpenseApp();
  const router = useRouter();
  const pathname = usePathname();
  const view = getViewForPathname(pathname);
  const [appUpdateRegistration, setAppUpdateRegistration] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
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

  if (!authReady) {
    return <LoadingScreen label="กำลังเข้าใช้" />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (bootstrapping) {
    return <LoadingScreen label="กำลังโหลด" />;
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
          <Suspense fallback={<LoadingScreen label="กำลังโหลดหน้าถัดไป" />}>
            <ActiveScreen />
          </Suspense>
        </main>

        <BottomNav
          view={view}
          onChange={navigationValue.navigateToView}
          onIntent={navigationValue.prefetchView}
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
