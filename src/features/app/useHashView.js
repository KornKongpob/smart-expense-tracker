import { useEffect, useState } from "react";

const ALLOWED_VIEWS = new Set(["dashboard", "inbox", "add", "accounts", "categories", "planner", "settings"]);

function redirectPathToHash() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname.replace(/^\/+/, "").toLowerCase();
  
  if (path) {
    const routeMap = {
      "dashboard": "dashboard",
      "inbox": "inbox",
      "add": "add",
      "add-transaction": "add",
      "accounts": "accounts",
      "categories": "categories",
      "planner": "planner",
      "budgets": "planner",
      "recurring": "planner",
      "stats": "planner",
      "settings": "settings"
    };
    
    const matched = Object.keys(routeMap).find(k => path.startsWith(k));
    if (matched && !window.location.hash) {
      window.history.replaceState(null, "", "/#" + routeMap[matched]);
      return routeMap[matched];
    }
  }
}

function readHashView() {
  if (typeof window === "undefined") return "dashboard";
  redirectPathToHash();
  const raw = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  return ALLOWED_VIEWS.has(raw) ? raw : "dashboard";
}

export function useHashView() {
  const [view, setView] = useState(readHashView);

  useEffect(() => {
    const handleHashChange = () => setView(readHashView());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const updateView = (nextView) => {
    const safeView = ALLOWED_VIEWS.has(String(nextView || "").trim()) ? String(nextView).trim() : "dashboard";
    if (typeof window !== "undefined") {
      window.location.hash = safeView;
    }
    setView(safeView);
  };

  return [view, updateView];
}
