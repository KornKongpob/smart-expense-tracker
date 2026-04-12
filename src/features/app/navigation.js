"use client";

import { createContext, useContext } from "react";

const ACCOUNT_DEEPLINK_KEY = "smart-expense-open-account";

const ExpenseNavigationContext = createContext({
  view: "dashboard",
  navigateToView: () => {},
  navigateToPath: () => {},
  prefetchView: () => {},
  openAccountDetails: () => {},
});

export function ExpenseNavigationProvider({ value, children }) {
  return (
    <ExpenseNavigationContext.Provider value={value}>
      {children}
    </ExpenseNavigationContext.Provider>
  );
}

export function useExpenseNavigation() {
  return useContext(ExpenseNavigationContext);
}

export function setPendingAccountDeepLink(accountId) {
  if (typeof window === "undefined") return;
  const targetId = String(accountId || "").trim();
  if (!targetId) return;
  window.sessionStorage.setItem(ACCOUNT_DEEPLINK_KEY, targetId);
}

export function consumePendingAccountDeepLink() {
  if (typeof window === "undefined") return "";
  const targetId = String(window.sessionStorage.getItem(ACCOUNT_DEEPLINK_KEY) || "").trim();
  if (targetId) {
    window.sessionStorage.removeItem(ACCOUNT_DEEPLINK_KEY);
  }
  return targetId;
}
