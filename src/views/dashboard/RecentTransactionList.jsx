import DailyTransactionGroup from "./DailyTransactionGroup.jsx";

function groupByDate(transactions = []) {
  const groups = new Map();
  for (const tx of transactions) {
    const date = String(tx?.date || "").slice(0, 10) || "unknown";
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(tx);
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

export default function RecentTransactionList({ transactions = [], categoryById, accountById, onSelect }) {
  const groups = groupByDate(transactions);

  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm font-medium text-slate-500">
        No transactions for this view yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <DailyTransactionGroup
          key={group.date}
          date={group.date}
          items={group.items}
          categoryById={categoryById}
          accountById={accountById}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
