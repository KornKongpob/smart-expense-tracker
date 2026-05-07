import AppHeader from "../components/AppHeader.jsx";
import GoalsWorkspace from "../features/goals/GoalsWorkspace.jsx";
import { useAppStore } from "../store/store.jsx";

export default function GoalsView({ showAlert }) {
  const {
    state,
    navigate,
    upsertGoal,
    deleteGoal,
    contributeToGoal,
  } = useAppStore();

  const saveGoal = async (goal) => {
    upsertGoal(goal);
    return true;
  };

  const removeGoal = async (id) => {
    deleteGoal(id);
    return true;
  };

  const addContribution = async (id, amountSatang) => {
    contributeToGoal(id, amountSatang);
    return true;
  };

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="เป้าหมายการออม"
        subtitle="วางแผนเงินก้อน กองทุนฉุกเฉิน และเป้าหมายสำคัญ"
        onBack={() => navigate("plan")}
      />

      <main className="ui-page pt-4 pb-nav view-flow">
        <GoalsWorkspace
          goals={state.goals || []}
          accounts={state.accounts || []}
          onSaveGoal={saveGoal}
          onDeleteGoal={removeGoal}
          onContributeGoal={addContribution}
          showAlert={showAlert}
        />
      </main>
    </div>
  );
}
