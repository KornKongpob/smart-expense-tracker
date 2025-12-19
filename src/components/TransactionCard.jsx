import { formatCurrency, formatDateShort } from "../utils/format";

export default function TransactionCard({ tx, category, accountName, onClick }) {
  const isExpense = tx.type === "expense";
  const sign = isExpense ? "-" : "+";

  const isTransferOut = tx.isTransfer && tx.meta?.transferSide === "out";
  const transferToName = tx.meta?.toAccountName || "";

  return (
    <div
      onClick={onClick}
      className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between mb-3 active:scale-[0.98] transition-transform cursor-pointer hover:border-indigo-100"
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: `${category.color}20` }}
        >
          {category.icon}
        </div>

        <div className="min-w-0">
          <p className="font-medium text-gray-800 text-sm truncate">
            {tx.note || category.name}
          </p>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{formatDateShort(tx.date)}</span>

            {accountName ? (
              <>
                <span>•</span>
                <span className="text-indigo-400 truncate max-w-[120px]">
                  {isTransferOut && transferToName
                    ? `${accountName} → ${transferToName}`
                    : accountName}
                </span>
              </>
            ) : null}

            {tx.isTransfer ? (
              <>
                <span>•</span>
                <span className="text-gray-500">Transfer</span>
              </>
            ) : null}

            {tx.meta?.ref ? (
              <>
                <span>•</span>
                <span className="text-gray-500 truncate max-w-[110px]">Ref: {tx.meta.ref}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <span className={`font-bold text-sm ${isExpense ? "text-red-500" : "text-green-500"}`}>
        {sign}
        {formatCurrency(tx.amount)}
      </span>
    </div>
  );
}
