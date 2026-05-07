import { useMemo } from "react";

import BillsView from "../../../views/BillsView.jsx";
import { useExpenseApp } from "../AppProvider.jsx";
import { useExpenseNavigation } from "../navigation.js";

function mergeTransactions(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const transaction of Array.isArray(group) ? group : []) {
      const key = String(transaction?.id || "");
      if (!key || byId.has(key)) continue;
      byId.set(key, transaction);
    }
  }
  return [...byId.values()];
}

export default function BillsScreen() {
  const { navigateToView } = useExpenseNavigation();
  const { accounts, categories, recentTransactions, recurringRules, transactionsPage } = useExpenseApp();
  const transactions = useMemo(
    () => mergeTransactions(recentTransactions, transactionsPage?.items),
    [recentTransactions, transactionsPage?.items],
  );

  return (
    <BillsView
      state={{
        transactions,
        recurring: recurringRules,
        accounts,
        categories,
      }}
      onOpenRecurring={() => navigateToView("recurring")}
    />
  );
}
