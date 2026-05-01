import { Inbox, Sparkles } from "lucide-react";

export default function PendingReceiptCard({ count = 0, onOpen }) {
  const hasPending = Number(count || 0) > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-indigo-50 text-indigo-700">
          {hasPending ? <Inbox size={18} /> : <Sparkles size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            {hasPending ? `${count} receipt${count === 1 ? "" : "s"} waiting` : "Receipt inbox clear"}
          </div>
          <div className="mt-0.5 text-xs font-medium text-slate-500">
            {hasPending ? "Review scans and save them into the ledger." : "New scans can still be sent here for review."}
          </div>
        </div>
      </div>
    </button>
  );
}
