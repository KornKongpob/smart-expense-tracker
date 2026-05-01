import TransactionCard from "../../components/TransactionCard";
import { formatDateShort } from "../../utils/format";

export default function DailyTransactionGroup({ date, items = [], categoryById, accountById, onSelect }) {
  if (!items.length) return null;

  return (
    <section className="space-y-2">
      <div className="px-1 text-xs font-bold uppercase text-slate-400">{formatDateShort(date)}</div>
      <div className="space-y-2">
        {items.map((tx) => (
          <TransactionCard
            key={tx.id}
            tx={tx}
            category={categoryById?.get(String(tx?.categoryId || tx?.category || "")) || null}
            accountName={accountById?.get(String(tx?.accountId || ""))?.name || ""}
            onClick={() => onSelect?.(tx)}
          />
        ))}
      </div>
    </section>
  );
}
