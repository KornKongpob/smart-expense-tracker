import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

function isImageSrc(v) {
  const s = String(v || "").trim();
  return s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://");
}

function getAccountVisual(acc) {
  if (!acc) return { kind: "emoji", value: "💳" };
  const img = acc.image && isImageSrc(acc.image) ? acc.image : null;
  if (img) return { kind: "img", src: img };

  const icon = String(acc.icon || "").trim();
  if (isImageSrc(icon)) return { kind: "img", src: icon };
  return { kind: "emoji", value: icon || "💳" };
}

/**
 * Account chips picker (matches Manual Add UI)
 * - accounts: [{id,name,icon,image,...}]
 * - value: selected account id
 * - onChange: (id) => void
 */
export default function AccountChipsPicker({
  accounts = [],
  value = "",
  onChange,
  title = "บัญชีที่ใช้",
  showTitle = true,
  showSelectedText = true,
  density = "default",
  mobileSingleRow = false,
  className = "",
}) {
  const list = Array.isArray(accounts) ? accounts : [];
  const selected = list.find((a) => String(a?.id || "") === String(value || ""));
  const isCompact = density === "compact";
  const selectedRef = useRef(null);

  useEffect(() => {
    if (!mobileSingleRow || !selectedRef.current) return;
    try {
      selectedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    } catch {
      // ignore browsers without smooth scroll support
    }
  }, [mobileSingleRow, value]);

  const chipsWrapClass = mobileSingleRow
    ? "flex gap-2 pb-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory no-scrollbar touch-pan-x-scroll sm:flex-wrap sm:overflow-visible sm:touch-auto"
    : isCompact
      ? "flex flex-wrap gap-2 pb-2"
      : "flex flex-wrap gap-3 pb-2";

  const chipClass = isCompact
    ? "flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all active:scale-95 min-w-0 max-w-full"
    : "flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all active:scale-95 min-w-0 max-w-full";

  const iconWrapClass = isCompact
    ? "w-6 h-6 rounded-lg overflow-hidden bg-white/20 border border-white/15 shrink-0 flex items-center justify-center"
    : "w-7 h-7 rounded-xl overflow-hidden bg-white/20 border border-white/15 shrink-0 flex items-center justify-center";

  const emojiIconClass = isCompact ? "text-base leading-none" : "text-xl leading-none";
  const labelClass = isCompact ? "text-xs font-semibold truncate max-w-[9.5rem]" : "text-sm font-semibold truncate";
  const checkSize = isCompact ? 12 : 14;

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      {showTitle ? (
        <h3 className="text-xs font-bold text-gray-900/55 mb-3 uppercase ml-1">{title}</h3>
      ) : null}

      <div
        className={chipsWrapClass}
        style={
          mobileSingleRow
            ? {
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x manipulation",
              }
            : undefined
        }
      >
        {list.map((acc) => {
          const isSelected = String(value || "") === String(acc?.id || "");
          const v = getAccountVisual(acc);
          return (
            <button
              key={acc.id}
              ref={isSelected ? selectedRef : null}
              type="button"
              onClick={() => onChange?.(acc.id)}
              aria-pressed={isSelected}
              className={`${chipClass} ${mobileSingleRow ? "snap-start shrink-0" : ""} ${
                isSelected
                  ? "bg-gray-900/90 text-white border-white/10 shadow-lg"
                  : "glass-chip text-gray-900 border border-white/15 hover:bg-white/10"
              }`}
              title={String(acc?.name || "")}
            >
              <span className={iconWrapClass}>
                {v.kind === "img" ? (
                  <img src={v.src} alt="acc" className="w-full h-full object-cover" />
                ) : (
                  <span className={emojiIconClass}>{v.value}</span>
                )}
              </span>

              <span className={labelClass}>{acc.name}</span>
              {isSelected ? <Check size={checkSize} className="ml-1 shrink-0" /> : null}
            </button>
          );
        })}
      </div>

      {showSelectedText && selected?.name ? (
        <div className="text-xs text-gray-900/55 ml-1">
          เลือกบัญชี: <span className="font-semibold text-gray-900">{selected.name}</span>
        </div>
      ) : null}
    </div>
  );
}
