import { useMemo } from "react";

import DebtPlannerWorkspace, { buildDebtPlannerStateFromRuntime } from "../../debts/DebtPlannerWorkspace.jsx";
import { useExpenseApp } from "../AppProvider.jsx";
import { useExpenseNavigation } from "../navigation.js";

export default function DebtPlannerScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    accounts,
    accountBalanceSnapshot,
    creditStatements,
    debtPlans,
    createManualTransaction,
    planningTransactions,
    saveCreditStatements,
    saving,
    selectedMonth,
    setSelectedMonth,
  } = useExpenseApp();

  const plannerState = useMemo(
    () =>
      buildDebtPlannerStateFromRuntime({
        accounts,
        accountBalanceSnapshot,
        debtPlans,
        transactions: planningTransactions,
      }),
    [accountBalanceSnapshot, accounts, debtPlans, planningTransactions],
  );

  const createPlannedPayments = async ({ sourceAccountId, payments }) => {
    const list = (Array.isArray(payments) ? payments : []).filter(
      (payment) => String(payment?.accountId || "") !== String(sourceAccountId || ""),
    );

    for (const payment of list) {
      await createManualTransaction(
        {
          kind: "transfer",
          amountSatang: payment.amountSatang,
          fromAccountId: sourceAccountId,
          toAccountId: payment.accountId,
          date: payment.paymentDate,
          note: payment.note,
          transferKind: "credit_payment",
          meta: payment.meta,
          raw: {
            transferKind: "credit_payment",
            transfer_kind: "credit_payment",
            isCreditCardPayment: true,
            is_credit_card_payment: true,
            debtPlanPayment: payment.meta,
          },
        },
        { source: "debt_plan" },
      );
    }

    return {
      createdCount: list.length,
      totalSatang: list.reduce((sum, payment) => sum + Math.max(0, Number(payment?.amountSatang || 0)), 0),
    };
  };

  return (
    <DebtPlannerWorkspace
      state={plannerState}
      creditStatements={creditStatements}
      initialMonth={selectedMonth}
      onMonthChange={setSelectedMonth}
      onOpenAccounts={() => navigateToView("accounts")}
      onCreatePlannedPayments={createPlannedPayments}
      onSaveStatements={saveCreditStatements}
      saving={saving}
    />
  );
}
