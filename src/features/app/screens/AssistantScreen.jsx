import { useMemo } from "react";

import AssistantView from "../../../views/AssistantView.jsx";
import { loadAll } from "../../../services/storage.js";
import { buildAccountBalanceMap } from "../accountBalanceState.js";
import { useExpenseApp } from "../AppProvider.jsx";
import { useExpenseNavigation } from "../navigation.js";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function toId(value) {
  return String(value || "").trim();
}

function mergeTransactions(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const transaction of listOf(group)) {
      const key = toId(transaction?.id);
      if (!key || byId.has(key)) continue;
      byId.set(key, transaction);
    }
  }
  return [...byId.values()];
}

function loadLocalGoals() {
  try {
    const snapshot = loadAll({ defaultGoals: [] });
    return listOf(snapshot?.goals);
  } catch {
    return [];
  }
}

function buildAssistantAccounts(accounts, accountBalanceSnapshot, debtPlans) {
  const balanceMap = buildAccountBalanceMap(accountBalanceSnapshot);
  const debtPlanByAccountId = new Map();

  for (const plan of listOf(debtPlans)) {
    const accountId = toId(plan?.account_id ?? plan?.accountId);
    if (!accountId) continue;
    debtPlanByAccountId.set(accountId, plan);
  }

  return listOf(accounts).map((account) => {
    const id = toId(account?.id);
    const numericId = Number(account?.id);
    const plan = debtPlanByAccountId.get(id) || null;
    const balanceSatang = Number.isFinite(numericId) && balanceMap.has(numericId)
      ? balanceMap.get(numericId)
      : account?.balance_satang ?? account?.balanceSatang ?? account?.opening_balance_satang ?? account?.openingBalance ?? 0;

    return {
      ...account,
      id,
      balance_satang: balanceSatang,
      creditLimit: account?.creditLimit ?? account?.credit_limit_satang,
      statementDay: account?.statementDay ?? account?.statement_day,
      dueDay: plan?.due_day ?? account?.dueDay ?? account?.due_day,
      aprBps: plan?.apr_bps ?? account?.aprBps ?? account?.apr_bps,
      minimumPaymentSatang: plan?.minimum_payment_satang ?? account?.minimumPaymentSatang,
      extraPaymentSatang: plan?.target_payment_satang
        ? Math.max(0, Number(plan.target_payment_satang || 0) - Number(plan.minimum_payment_satang || 0))
        : account?.extraPaymentSatang,
    };
  });
}

export default function AssistantScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    accounts,
    accountBalanceSnapshot,
    budgetRows,
    categories,
    debtPlans,
    financialGoals,
    recentTransactions,
    recurringRules,
    transactionsPage,
  } = useExpenseApp();

  const localGoals = useMemo(() => loadLocalGoals(), []);
  const transactions = useMemo(
    () => mergeTransactions(recentTransactions, transactionsPage?.items),
    [recentTransactions, transactionsPage?.items],
  );
  const assistantAccounts = useMemo(
    () => buildAssistantAccounts(accounts, accountBalanceSnapshot, debtPlans),
    [accountBalanceSnapshot, accounts, debtPlans],
  );
  const assistantState = useMemo(
    () => ({
      accounts: assistantAccounts,
      transactions,
      budgets: budgetRows,
      recurring: recurringRules,
      goals: localGoals.length ? localGoals : financialGoals,
      categories,
    }),
    [assistantAccounts, budgetRows, categories, financialGoals, localGoals, recurringRules, transactions],
  );

  const navigateFromAssistant = (view) => {
    const target = view === "budgets" ? "planner" : view;
    navigateToView(target);
  };

  return <AssistantView state={assistantState} onNavigate={navigateFromAssistant} />;
}
