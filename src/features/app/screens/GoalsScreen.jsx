import { useEffect, useMemo, useReducer, useRef } from "react";

import { DEFAULT_CATEGORIES } from "../../../constants/categories.js";
import GoalsWorkspace from "../../goals/GoalsWorkspace.jsx";
import { loadAll, saveAll } from "../../../services/storage.js";
import { ACTIONS } from "../../../store/actions.js";
import { DEFAULT_ACCOUNTS, createInitialState } from "../../../store/boot.js";
import { reducer } from "../../../store/store.jsx";
import { useExpenseApp } from "../AppProvider.jsx";
import { ScreenShell } from "../ui.jsx";

function loadGoalState() {
  return createInitialState(
    loadAll({
      defaultAccounts: DEFAULT_ACCOUNTS,
      defaultCategories: DEFAULT_CATEGORIES,
      defaultBudgets: [],
      defaultRecurring: [],
      defaultGoals: [],
      defaultMerchants: [],
      defaultRules: [],
      defaultInbox: [],
      defaultScanInbox: [],
      defaultUI: { view: "goals", editingId: null },
    }),
  );
}

function persistGoalState(state) {
  saveAll({
    moneyUnit: state.moneyUnit,
    transactions: state.transactions,
    accounts: state.accounts,
    categories: state.categories,
    budgets: state.budgets,
    recurring: state.recurring,
    goals: state.goals,
    merchants: state.merchants,
    rules: state.rules,
    inbox: state.inbox,
    scanInbox: state.inbox,
    ui: state.ui,
  });
}

export default function GoalsScreen() {
  const { accounts: runtimeAccounts } = useExpenseApp();
  const [goalState, dispatch] = useReducer(reducer, undefined, loadGoalState);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    persistGoalState(goalState);
  }, [goalState]);

  const accounts = useMemo(() => {
    const runtimeList = Array.isArray(runtimeAccounts) ? runtimeAccounts : [];
    if (runtimeList.length) {
      return runtimeList.map((account) => ({
        ...account,
        id: String(account?.id || ""),
        name: String(account?.name || ""),
      }));
    }
    return goalState.accounts || [];
  }, [goalState.accounts, runtimeAccounts]);

  const saveGoal = async (goal) => {
    dispatch({ type: ACTIONS.GOAL_UPSERT, payload: goal });
    return true;
  };

  const deleteGoal = async (id) => {
    dispatch({ type: ACTIONS.GOAL_DELETE, payload: id });
    return true;
  };

  const contributeGoal = async (id, amountSatang) => {
    dispatch({ type: ACTIONS.GOAL_CONTRIBUTE, payload: { id, amountSatang } });
    return true;
  };

  return (
    <ScreenShell
      title="เป้าหมายการออม"
      subtitle="วางแผนเงินก้อน กองทุนฉุกเฉิน และเป้าหมายสำคัญ"
      headerMode="visible"
    >
      <GoalsWorkspace
        goals={goalState.goals || []}
        accounts={accounts}
        onSaveGoal={saveGoal}
        onDeleteGoal={deleteGoal}
        onContributeGoal={contributeGoal}
      />
    </ScreenShell>
  );
}
