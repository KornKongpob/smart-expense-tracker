import DebtPlannerWorkspace from "../features/debts/DebtPlannerWorkspace.jsx";
import { createCreditPaymentPair } from "../domain/ledger/createCreditPaymentPair.js";
import { useAppStore } from "../store/store.jsx";

export default function DebtPlannerView() {
  const { state, navigate, upsertCreditStatement, bulkUpsertTransactions } = useAppStore();

  const saveCreditStatements = (statements) => {
    for (const statement of Array.isArray(statements) ? statements : []) {
      upsertCreditStatement(statement);
    }
    return true;
  };

  const createPlannedPayments = ({ sourceAccountId, payments }) => {
    const txs = [];
    const list = Array.isArray(payments) ? payments : [];
    const createdPayments = [];

    for (const payment of list) {
      const amount = Math.max(0, Number(payment?.amountSatang || 0));
      const accountId = String(payment?.accountId || "").trim();
      if (!amount || !accountId || !sourceAccountId || accountId === String(sourceAccountId)) continue;

      const pair = createCreditPaymentPair({
        amount,
        fromAccountId: sourceAccountId,
        toAccountId: accountId,
        date: payment?.paymentDate,
        note: payment?.note,
        source: "debt_plan",
        common: {
          meta: payment?.meta || null,
        },
      });
      txs.push(...pair);
      createdPayments.push(payment);
    }

    if (txs.length) {
      bulkUpsertTransactions(txs, { navigateToDashboard: false });
    }

    return {
      createdCount: txs.length / 2,
      totalSatang: createdPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment?.amountSatang || 0)), 0),
    };
  };

  return (
    <DebtPlannerWorkspace
      state={state}
      creditStatements={state.creditStatements || []}
      onOpenAccounts={() => navigate("accounts")}
      onCreatePlannedPayments={createPlannedPayments}
      onSaveStatements={saveCreditStatements}
    />
  );
}
