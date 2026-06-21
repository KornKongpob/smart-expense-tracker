import { useExpenseApp } from "../AppProvider.jsx";
import { ScreenShell } from "../ui.jsx";
import CreditStatementsView from "../../../views/CreditStatementsView.jsx";

export default function CreditStatementsScreen() {
  const {
    accounts,
    accountBalanceSnapshot,
    creditStatements,
    saveCreditStatement,
    saving,
  } = useExpenseApp();

  return (
    <ScreenShell
      title="รอบบิลบัตรเครดิต"
      subtitle="กรอกยอดเรียกเก็บหลังวันตัดรอบ เพื่อวางแผนเงินเดือน"
      headerMode="visible"
      fillViewport={false}
    >
      <CreditStatementsView
        accounts={accounts}
        accountBalanceSnapshot={accountBalanceSnapshot}
        creditStatements={creditStatements}
        onSaveStatement={saveCreditStatement}
        saving={saving}
      />
    </ScreenShell>
  );
}
