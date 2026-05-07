import DebtPlannerWorkspace from "../features/debts/DebtPlannerWorkspace.jsx";
import { useAppStore } from "../store/store.jsx";

export default function DebtPlannerView() {
  const { state, navigate } = useAppStore();

  return <DebtPlannerWorkspace state={state} onOpenAccounts={() => navigate("accounts")} />;
}
