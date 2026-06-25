import { useExpenseApp } from "../AppProvider.jsx";
import { useExpenseNavigation } from "../navigation.js";
import { ScreenShell } from "../ui.jsx";
import SalaryPlannerView from "../../../views/SalaryPlannerView.jsx";

export default function SalaryPlannerScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    accounts,
    creditStatements,
    salaryPlans,
    saveSalaryPlan,
    saving,
  } = useExpenseApp();

  return (
    <ScreenShell
      title="วางแผนจ่ายบัตรจากเงินเดือน"
      subtitle="จ่ายขั้นต่ำให้ครบก่อน แล้วค่อยทยอยลดหนี้"
      headerMode="visible"
      fillViewport={false}
    >
      <SalaryPlannerView
        accounts={accounts}
        creditStatements={creditStatements}
        salaryPlans={salaryPlans}
        onSaveSalaryPlan={saveSalaryPlan}
        onNavigate={navigateToView}
        saving={saving}
      />
    </ScreenShell>
  );
}
