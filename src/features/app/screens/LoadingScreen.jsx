export default function LoadingScreen({ label = "กำลังโหลด" }) {
  return (
    <main className="finance-loading">
      <div className="ui-card-strong finance-loading-card">
        <div className="view-eyebrow">Smart Expense</div>
        <h1 className="finance-loading-title">{label}</h1>
        <div className="finance-loading-bar">
          <span />
        </div>
      </div>
    </main>
  );
}
