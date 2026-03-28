// src/app/App.jsx
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/store.jsx";
import { useUndo } from "../utils/useUndo";
import { parseHash, replaceHash } from "../utils/hashRouter";
import { checkBudgetAndNotify } from "../utils/budgetNotifications";
import { formatCurrency } from "../utils/format";
import { getBudget, toMonthKey } from "../store/selectors.js";
import { sumExpenseForMonth } from "../utils/transaction";
import { STORAGE_SAVE_ERROR_EVENT } from "../services/storage";
import Navbar from "../components/Navbar";
import ConfirmationModal from "../components/ConfirmationModal";
import PinLockScreen from "../components/PinLockScreen.jsx";
import OnboardingScreen from "../components/OnboardingScreen.jsx";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";

const DashboardView = lazy(() => import("../views/DashboardView"));
const AddTransactionView = lazy(() => import("../views/AddTransactionView"));
const AccountsView = lazy(() => import("../views/AccountsView"));
const StatsView = lazy(() => import("../views/StatsView"));
const BudgetsView = lazy(() => import("../views/BudgetsView"));
const CategoriesView = lazy(() => import("../views/CategoriesView"));
const RecurringView = lazy(() => import("../views/RecurringView"));
const RulesView = lazy(() => import("../views/RulesView"));
const InboxView = lazy(() => import("../views/InboxView"));
const MerchantLibraryView = lazy(() => import("../views/MerchantLibraryView"));
const MoreView = lazy(() => import("../views/MoreView"));
const RESET_ALL_EVENT = "app:after-reset-all";

function AlertToast({ message, onClose }) {
  if (!message) return null;

  // very light heuristic: show success icon if contains success-ish words
  const msg = String(message || "");
  const lower = msg.toLowerCase();
  const isError = /error|ผิดพลาด|ไม่สำเร็จ|fail/.test(lower);
  const isSuccess = /สำเร็จ|เรียบร้อย|done|success/.test(lower);

  const toneClass = isError ? "ui-toast--error" : isSuccess ? "ui-toast--success" : "ui-toast--info";
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] z-[100] left-1/2 -translate-x-1/2 w-[min(92vw,420px)]">
      <div className={["ui-toast", toneClass, "flex items-start gap-3"].join(" ")}> 
        <div className="mt-0.5 shrink-0">
          <Icon size={18} className={isError ? "text-red-700" : isSuccess ? "text-emerald-700" : "text-indigo-700"} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 break-words whitespace-pre-wrap">{msg}</div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="ui-icon-btn shrink-0"
          aria-label="close toast"
          title="ปิด"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ confirm, setConfirm }) {
  if (!confirm) return null;

  return (
    <ConfirmationModal
      isOpen={!!confirm}
      title={confirm.title}
      message={confirm.message}
      onConfirm={() => {
        confirm.onConfirm?.();
        setConfirm(null);
      }}
      onCancel={() => {
        setConfirm(null);
        confirm.onCancel?.();
      }}
      isDestructive={confirm.isDestructive}
      confirmText={confirm.confirmText || "ยืนยัน"}
      cancelText={confirm.cancelText || "ยกเลิก"}
    />
  );
}

function ViewFallback() {
  return (
    <div className="min-h-dvh">
      <div className="ui-page pt-[calc(var(--app-header-h,76px)+1rem)] pb-nav">
        <div className="ui-card-strong p-6 animate-fade-in-up">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Loading</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">Preparing your workspace…</div>
          <div className="mt-3 h-2 rounded-full bg-slate-900/10 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-slate-950 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function isTextEntryElement(node) {
  if (typeof HTMLElement === "undefined" || !(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  const type = String(node.getAttribute("type") || "text").toLowerCase();
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
}

export default function App() {
  const store = useAppStore();
  const { state } = store;

  const view = state?.ui?.view || "dashboard";
  const initialHash = typeof window === "undefined" ? "" : window.location.hash;
  const initialHashRef = useRef(initialHash);
  const skipInitialHashSyncRef = useRef(!!initialHash);

  // ---- Keyboard (mobile) guard ----
  // Hide bottom navbar while the on-screen keyboard is open (prevents overlap with inputs),
  // and expose the keyboard inset as a CSS variable for fixed buttons.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    let focusTimer = 0;
    let maxWindowHeight = window.innerHeight || 0;
    const vv = window.visualViewport;

    const applyKeyboardDomState = (open, inset = 0) => {
      const nextInset = open ? Math.max(0, Math.round(inset)) : 0;
      try {
        document.documentElement.style.setProperty("--keyboard-inset", `${nextInset}px`);
      } catch {
        // ignore
      }
      try {
        if (open) document.body.setAttribute("data-keyboard-open", "true");
        else document.body.removeAttribute("data-keyboard-open");
      } catch {
        // ignore
      }
    };

    const update = () => {
      const winHeight = window.innerHeight || 0;
      if (winHeight > maxWindowHeight) maxWindowHeight = winHeight;

      const vvInset = vv
        ? Math.max(0, winHeight - Math.max(0, (vv.height || 0) + (vv.offsetTop || 0)))
        : 0;
      const fallbackInset = Math.max(0, maxWindowHeight - winHeight);
      const inset = Math.max(vvInset, fallbackInset);
      const compactViewport = (window.innerWidth || 0) < 768;
      const focusedEditable = isTextEntryElement(document.activeElement);
      const open = inset > 110 || (compactViewport && focusedEditable);

      applyKeyboardDomState(open, inset);
      setKeyboardOpen(open);
    };

    const onFocusIn = (event) => {
      if (!isTextEntryElement(event.target)) return;
      clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        update();
        if ((window.innerWidth || 0) < 768 && event.target instanceof HTMLElement) {
          try {
            event.target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          } catch {
            // ignore
          }
        }
      }, 120);
    };

    const onFocusOut = () => {
      clearTimeout(focusTimer);
      window.setTimeout(update, 80);
    };

    applyKeyboardDomState(false, 0);
    update();

    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      clearTimeout(focusTimer);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      applyKeyboardDomState(false, 0);
    };
  }, []);

  // ---- Hash router: sync URL ↔ view ----
  useEffect(() => {
    const initialHash = initialHashRef.current;
    if (initialHash) {
      const { view: hashView } = parseHash(initialHash);
      if (hashView !== view) {
        store.navigate(hashView);
        return;
      }
    }
    replaceHash(view);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHashChange = () => {
      const { view: hashView } = parseHash(window.location.hash);
      if (hashView !== (state?.ui?.view || "dashboard")) {
        store.navigate(hashView);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [state?.ui?.view, store]);

  // Keep hash in sync when view changes programmatically
  useEffect(() => {
    if (skipInitialHashSyncRef.current) {
      skipInitialHashSyncRef.current = false;
      const { view: hashView } = parseHash(initialHashRef.current);
      if (hashView !== view) return;
    }
    replaceHash(view);
  }, [view]);

  // ---- Global alert / confirm (UI only) ----
  const [alert, setAlert] = useState("");
  const [confirm, setConfirm] = useState(null);

  // ---- Undo system ----
  const handleUndoRestore = useCallback((items) => {
    if (!items?.length) return;
    store.bulkUpsertTransactions(items, { navigateToDashboard: false });
  }, [store]);

  const { undoItem, performUndo, clearUndo } = useUndo({ onRestore: handleUndoRestore });

  // ---- Budget notifications (check after transactions change) ----
  useEffect(() => {
    try {
      const monthKey = toMonthKey(new Date());
      const monthSpent = sumExpenseForMonth(state.transactions || [], monthKey);
      const budget = getBudget(state.budgets || [], monthKey, "__TOTAL__");
      const limit = Number(budget?.limit || 0);
      const alertPct = Number(budget?.alertPct || 90);
      if (limit > 0) {
        checkBudgetAndNotify({ monthSpent, monthlyLimit: limit, alertPct, monthKey, formatCurrency });
      }
    } catch {
      // ignore
    }
  }, [state.transactions, state.budgets]);

  const showAlert = useCallback((msg) => {
    const m = String(msg || "");
    setAlert(m);
    if (m) {
      window.clearTimeout(window.__toastTimer);
      window.__toastTimer = window.setTimeout(() => setAlert(""), 2400);
    }
  }, []);

  useEffect(() => {
    const onStorageSaveError = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const approxBytes = Math.max(0, Number(detail?.approxBytes) || 0);
      const approxMb = approxBytes ? ` (~${(approxBytes / (1024 * 1024)).toFixed(1)} MB)` : "";
      const quotaText = String(detail?.errorName || "") === "QuotaExceededError" ? " พื้นที่จัดเก็บอาจเต็ม" : "";
      showAlert(`บันทึกข้อมูลไม่สำเร็จ${quotaText}${approxMb} — แนะนำให้ Export Backup และลบไฟล์แนบหรือข้อมูลที่ไม่จำเป็น`);
    };

    window.addEventListener(STORAGE_SAVE_ERROR_EVENT, onStorageSaveError);
    return () => window.removeEventListener(STORAGE_SAVE_ERROR_EVENT, onStorageSaveError);
  }, [showAlert]);

  const showConfirm = (title, message, onConfirm, isDestructive = false, opts = {}) => {
    setConfirm({
      title,
      message,
      onConfirm,
      isDestructive,
      confirmText: opts?.confirmText,
      cancelText: opts?.cancelText,
      onCancel: opts?.onCancel,
    });
  };

  // ---- PIN Lock: If PIN saved, show lock screen before app ----
  const PIN_KEY = "privacy_pin_6";
  const savedPin = useMemo(() => {
    try {
      return localStorage.getItem(PIN_KEY) || "";
    } catch {
      return "";
    }
  }, []);

  const [isUnlocked, setIsUnlocked] = useState(() => !savedPin);

  // ---- Onboarding (must declare hooks before any conditional return) ----
  const ONBOARDING_KEY = "onboarding_done_v1";
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try {
      return !!localStorage.getItem(ONBOARDING_KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onResetAll = () => {
      setOnboardingDone(false);
      setIsUnlocked(true);
    };

    window.addEventListener(RESET_ALL_EVENT, onResetAll);
    return () => window.removeEventListener(RESET_ALL_EVENT, onResetAll);
  }, []);

  // If PIN is removed in another tab, unlock.
  useEffect(() => {
    const onStorage = () => {
      try {
        const v = localStorage.getItem(PIN_KEY) || "";
        if (!v) setIsUnlocked(true);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!isUnlocked && savedPin) {
    return (
      <PinLockScreen
        savedPin={savedPin}
        title="ปลดล็อก (PIN)"
        onUnlocked={() => setIsUnlocked(true)}
      />
    );
  }

  // ---- Onboarding: show for first-time users ----
  const hasTx = (state.transactions || []).length > 0;

  if (!onboardingDone && !hasTx) {
    return (
      <OnboardingScreen
        onComplete={({ monthlyBudget }) => {
          try {
            localStorage.setItem(ONBOARDING_KEY, "1");
          } catch {
            // ignore
          }
          setOnboardingDone(true);

          // If user set a budget, save it
          if (monthlyBudget > 0 && store.upsertBudget) {
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            store.upsertBudget({ month, categoryId: "__TOTAL__", limit: monthlyBudget, alertPct: 90 });
          }
        }}
      />
    );
  }

  // ---- Views map ----
  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <DashboardView showAlert={showAlert} showConfirm={showConfirm} />;
      case "add":
        return <AddTransactionView showAlert={showAlert} showConfirm={showConfirm} />;
      case "accounts":
        return <AccountsView showAlert={showAlert} showConfirm={showConfirm} />;
      case "stats":
        return <StatsView showAlert={showAlert} showConfirm={showConfirm} />;
      case "budgets":
        return <BudgetsView showAlert={showAlert} showConfirm={showConfirm} />;
      case "categories":
        return <CategoriesView showAlert={showAlert} showConfirm={showConfirm} />;
      case "recurring":
        return <RecurringView showAlert={showAlert} showConfirm={showConfirm} />;
      case "rules":
        return <RulesView showAlert={showAlert} showConfirm={showConfirm} />;
      case "inbox":
        return <InboxView showAlert={showAlert} showConfirm={showConfirm} />;
      case "merchants":
        return <MerchantLibraryView showAlert={showAlert} showConfirm={showConfirm} />;
      case "more":
        return <MoreView showAlert={showAlert} showConfirm={showConfirm} />;
      default:
        return <DashboardView showAlert={showAlert} showConfirm={showConfirm} />;
    }
  };

  const reserveNavSpace = view !== "add";
  const showNavbar = reserveNavSpace && !keyboardOpen; // hide while keyboard is open
  const rootSpacingClass = showNavbar ? "pb-nav" : "pb-safe";

  return (
    <div className={rootSpacingClass}>
      <AlertToast message={alert} onClose={() => setAlert("")} />
      <ConfirmModal confirm={confirm} setConfirm={setConfirm} />

      {/* Undo toast */}
      {undoItem && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[90] left-1/2 -translate-x-1/2 w-[min(92vw,420px)] animate-fade-in-up">
          <div className="ui-toast flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-900 truncate">{undoItem.label}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={performUndo}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-600/15 border border-indigo-600/20 active:scale-95 transition-transform"
              >
                เลิกทำ
              </button>
              <button
                type="button"
                onClick={clearUndo}
                className="p-1.5 rounded-full text-gray-500 hover:text-gray-700"
                aria-label="dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div key={view} className="animate-view-enter">
        <Suspense fallback={<ViewFallback />}>
          {renderView()}
        </Suspense>
      </div>

      {showNavbar ? <Navbar /> : null}
    </div>
  );
}
