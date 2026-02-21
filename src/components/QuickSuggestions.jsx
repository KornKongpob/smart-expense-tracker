import { Check } from "lucide-react";

function isImageSrc(v) {
  const s = String(v || "").trim();
  return s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://");
}

/**
 * QuickSuggestions (one-tap chips)
 * items: [{ id, label, badge?, icon?: {kind:'emoji'|'img', value?:string, src?:string } }]
 */
export default function QuickSuggestions({
  title = "Quick suggestions",
  items = [],
  selectedId = "",
  onSelect,
  className = "",
}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return null;

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-extrabold text-gray-900/60 tracking-wide uppercase">
          {title} <span className="normal-case font-black text-gray-900/50">(แตะครั้งเดียว)</span>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {list.map((it) => {
          const isSelected = String(selectedId || "") === String(it?.id || "");
          const icon = it?.icon || null;
          const badge = String(it?.badge || "").trim();
          const label = String(it?.label || "").trim() || "—";

          return (
            <button
              key={String(it?.id || label)}
              type="button"
              onClick={() => onSelect?.(it?.id)}
              className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all active:scale-95 max-w-[75vw] ${
                isSelected
                  ? "bg-gray-900/90 text-white border-white/10 shadow-sm"
                  : "bg-white/20 text-gray-900 border-white/15 hover:bg-white/25"
              }`}
              title={label}
            >
              <span className="w-6 h-6 rounded-xl overflow-hidden bg-white/20 border border-white/15 shrink-0 flex items-center justify-center">
                {icon?.kind === "img" && icon?.src && isImageSrc(icon.src) ? (
                  <img src={icon.src} alt="icon" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[18px] leading-none">{icon?.value || "✨"}</span>
                )}
              </span>

              <span className="text-xs font-extrabold whitespace-nowrap truncate max-w-[38vw]">
                {label}
              </span>

              {badge ? (
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${
                    isSelected ? "border-white/15 bg-white/10" : "border-white/20 bg-white/15"
                  }`}
                >
                  {badge}
                </span>
              ) : null}

              {isSelected ? <Check size={14} className="shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
