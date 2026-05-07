import { useMemo } from "react";

import DebtPlannerWorkspace, { buildDebtPlannerStateFromRuntime } from "../../debts/DebtPlannerWorkspace.jsx";
import { useExpenseApp } from "../AppProvider.jsx";
import { useExpenseNavigation } from "../navigation.js";

export default function DebtPlannerScreen() {
  const { navigateToView } = useExpenseNavigation();
  const { accounts, accountBalanceSnapshot, debtPlans } = useExpenseApp();

  const plannerState = useMemo(
    () =>
      buildDebtPlannerStateFromRuntime({
        accounts,
        accountBalanceSnapshot,
        debtPlans,
      }),
    [accountBalanceSnapshot, accounts, debtPlans],
  );

  return <DebtPlannerWorkspace state={plannerState} onOpenAccounts={() => navigateToView("accounts")} />;
}
