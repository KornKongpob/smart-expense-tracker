import { useEffect } from "react";
import {
  BarChart3,
  CreditCard,
  Inbox,
  PlusCircle,
  Settings,
  X,
} from "lucide-react";

import { formatCurrency } from "../../utils/format.js";
import { useLockBodyScroll } from "../../utils/useLockBodyScroll.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "ภาพรวม", icon: BarChart3 },
  { id: "inbox", label: "กล่องรับ", icon: Inbox },
  { id: "add", label: "เพิ่ม", icon: PlusCircle },
  { id: "accounts", label: "บัญชี", icon: CreditCard },
  { id: "settings", label: "ตั้งค่า", icon: Settings },
];

function isTextEntryElement(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;

  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;

  const type = String(node.getAttribute("type") || "text").toLowerCase();
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
}

function applyKeyboardDomState(open, inset = 0) {
  if (typeof document === "undefined") return;
  const nextInset = open ? Math.max(0, Math.round(inset)) : 0;
  document.documentElement.style.setProperty("--keyboard-inset", `${nextInset}px`);
  if (open) document.body.setAttribute("data-keyboard-open", "true");
  else document.body.removeAttribute("data-keyboard-open");
}

export function BottomNav({ view, onChange }) {
  return (
    <nav className="finance-nav-wrap app-navbar">
      <div className="app-nav-surface finance-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={["app-nav-item", active ? "app-nav-item--active" : ""].filter(Boolean).join(" ")}
              onClick={() => onChange(item.id)}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${item.id}`}
            >
              <span className="app-nav-icon">
                <Icon size={18} />
              </span>
              <span className="finance-nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function ToastBar({ toast, onClose }) {
  useEffect(() => {
    if (!toast?.message) return undefined;
    const timer = window.setTimeout(() => onClose?.(), 2400);
    return () => window.clearTimeout(timer);
  }, [onClose, toast?.message, toast?.tone]);

  if (!toast?.message) return null;

  return (
    <div className="finance-toast-wrap">
      <div className={["ui-toast", "finance-toast-card", `finance-toast-${toast.tone || "info"}`].join(" ")}>
        <div>
          <div className="finance-toast-label">{toast.tone === "error" ? "ต้องตรวจ" : "บันทึกแล้ว"}</div>
          <div className="finance-toast-copy">{toast.message}</div>
        </div>
        <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close message">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function ScreenShell({ eyebrow, title, subtitle, actions, children }) {
  return (
    <section className="finance-screen">
      <header className="finance-screen-head">
        <div className="finance-screen-copy">
          {eyebrow ? <div className="view-eyebrow">{eyebrow}</div> : null}
          <h1 className="finance-screen-title">{title}</h1>
          {subtitle ? <p className="finance-screen-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="finance-screen-actions">{actions}</div> : null}
      </header>
      <div className="finance-screen-body">{children}</div>
    </section>
  );
}

export function MetricCard({ label, value, hint, tone = "default" }) {
  return (
    <article className={["ui-card", "finance-metric", `finance-metric-${tone}`].join(" ")}>
      <div className="finance-metric-label">{label}</div>
      <div className="finance-metric-value">{value}</div>
      {hint ? <div className="finance-metric-hint">{hint}</div> : null}
    </article>
  );
}

export function EmptyPanel({ title, copy, action }) {
  return (
    <div className="view-empty">
      <div className="finance-empty-title">{title}</div>
      <p className="finance-empty-copy">{copy}</p>
      {action ? <div className="finance-empty-action">{action}</div> : null}
    </div>
  );
}

export function StatusPill({ tone = "default", children }) {
  return <span className={["finance-pill", `finance-pill-${tone}`].join(" ")}>{children}</span>;
}

export function Sheet({ open, onClose, title, subtitle, children, footer }) {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    let focusTimer = 0;
    let maxWindowHeight = window.innerHeight || 0;
    const visualViewport = window.visualViewport;

    const updateKeyboardState = () => {
      const windowHeight = window.innerHeight || 0;
      if (windowHeight > maxWindowHeight) maxWindowHeight = windowHeight;

      const viewportInset = visualViewport
        ? Math.max(0, windowHeight - Math.max(0, (visualViewport.height || 0) + (visualViewport.offsetTop || 0)))
        : 0;
      const fallbackInset = Math.max(0, maxWindowHeight - windowHeight);
      const inset = Math.max(viewportInset, fallbackInset);
      const compactViewport = (window.innerWidth || 0) < 768;
      const focusedEditable = isTextEntryElement(document.activeElement);
      const keyboardOpen = inset > 110 || (compactViewport && focusedEditable);

      applyKeyboardDomState(keyboardOpen, inset);
    };

    const onFocusIn = (event) => {
      if (!isTextEntryElement(event.target)) return;
      clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        updateKeyboardState();
        if ((window.innerWidth || 0) < 768 && event.target instanceof HTMLElement) {
          try {
            event.target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          } catch {
            // Ignore browsers that do not support scrollIntoView options.
          }
        }
      }, 120);
    };

    const onFocusOut = () => {
      clearTimeout(focusTimer);
      window.setTimeout(updateKeyboardState, 80);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    applyKeyboardDomState(false, 0);
    updateKeyboardState();

    visualViewport?.addEventListener("resize", updateKeyboardState);
    visualViewport?.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);
    window.addEventListener("orientationchange", updateKeyboardState);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(focusTimer);
      visualViewport?.removeEventListener("resize", updateKeyboardState);
      visualViewport?.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
      window.removeEventListener("orientationchange", updateKeyboardState);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      applyKeyboardDomState(false, 0);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="finance-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="finance-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        data-testid="app-sheet"
      >
        <div className="finance-sheet-head">
          <div className="finance-sheet-head-copy">
            <h2 className="finance-sheet-title">{title}</h2>
            {subtitle ? <p className="finance-sheet-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </div>
        <div className="finance-sheet-body no-scrollbar">{children}</div>
        {footer ? <div className="finance-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function MiniCashflowChart({ series }) {
  const points = Array.isArray(series) ? series : [];
  if (!points.length) {
    return <div className="finance-chart-empty">ยังไม่มีข้อมูล</div>;
  }

  const values = points.flatMap((point) => [Number(point?.income_satang || 0), Number(point?.expense_satang || 0)]);
  const max = Math.max(...values, 1);
  const width = 320;
  const height = 160;

  const buildPath = (key) =>
    points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * (width - 8) + 4;
        const y = height - (Number(point?.[key] || 0) / max) * (height - 24) - 8;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

  return (
    <div className="finance-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="finance-chart-svg" aria-hidden="true">
        <path d={buildPath("expense_satang")} className="finance-chart-line finance-chart-line-expense" />
        <path d={buildPath("income_satang")} className="finance-chart-line finance-chart-line-income" />
      </svg>
      <div className="finance-chart-legend">
        <span><i className="finance-dot finance-dot-income" />รายรับ</span>
        <span><i className="finance-dot finance-dot-expense" />รายจ่าย</span>
      </div>
    </div>
  );
}

export function AmountText({ value, tone = "default" }) {
  return <span className={`finance-amount finance-amount-${tone}`}>{formatCurrency(value || 0)}</span>;
}
