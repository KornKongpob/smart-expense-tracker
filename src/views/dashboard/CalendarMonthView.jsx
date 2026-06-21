import { formatCurrency } from "../../utils/format";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function leadingBlanks(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return Number.isFinite(date.getTime()) ? date.getDay() : 0;
}

export default function CalendarMonthView({ monthKey, days = [], selectedDate = "", onSelectDate }) {
  const blanks = Array.from({ length: leadingBlanks(monthKey) }, (_, index) => `blank-${index}`);

  return (
    <div className="ui-card p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[color:var(--muted)]">
        {WEEKDAYS.map((day, index) => (
          <div key={`${day}-${index}`} className="py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {blanks.map((key) => (
          <div key={key} className="aspect-square rounded-xl" />
        ))}
        {days.map((day) => {
          const active = day.date === selectedDate;
          const hasActivity = day.incomeSatang || day.expenseSatang;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate?.(day.date)}
              className={`aspect-square rounded-xl border p-1 text-left transition active:scale-95 ${
                active ? "border-blue-300 bg-blue-50" : "border-slate-100 bg-white/70"
              }`}
            >
              <div className="text-[11px] font-semibold text-[color:var(--text)]">{Number(day.date.slice(-2))}</div>
              {hasActivity ? (
                <div className="mt-1 space-y-0.5">
                  {day.expenseSatang ? (
                    <div className="truncate text-[9px] font-semibold text-rose-600">-{formatCurrency(day.expenseSatang)}</div>
                  ) : null}
                  {day.incomeSatang ? (
                    <div className="truncate text-[9px] font-semibold text-emerald-600">+{formatCurrency(day.incomeSatang)}</div>
                  ) : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
