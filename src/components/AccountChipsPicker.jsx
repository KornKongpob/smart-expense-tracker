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
  className = "",
}) {
  const list = Array.isArray(accounts) ? accounts : [];
  const selected = list.find((a) => String(a?.id || "") === String(value || ""));

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      {showTitle ? (
        <h3 className="text-xs font-bold text-gray-900/55 mb-3 uppercase ml-1">{title}</h3>
      ) : null}

      <div className="flex flex-wrap gap-3 pb-2">
        {list.map((acc) => {
          const isSelected = String(value || "") === String(acc?.id || "");
          const v = getAccountVisual(acc);
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onChange?.(acc.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all active:scale-95 min-w-0 max-w-full ${
                isSelected
                  ? "bg-gray-900/90 text-white border-white/10 shadow-lg"
                  : "glass-chip text-gray-900 border border-white/15 hover:bg-white/10"
              }`}
              title={String(acc?.name || "")}
            >
              <span className="w-7 h-7 rounded-xl overflow-hidden bg-white/20 border border-white/15 shrink-0 flex items-center justify-center">
                {v.kind === "img" ? (
                  <img src={v.src} alt="acc" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl leading-none">{v.value}</span>
                )}
              </span>

              <span className="text-sm font-extrabold truncate">{acc.name}</span>
              {isSelected ? <Check size={14} className="ml-1 shrink-0" /> : null}
            </button>
          );
        })}
      </div>

      {showSelectedText && selected?.name ? (
        <div className="text-xs text-gray-900/55 ml-1">
          เลือกบัญชี: <span className="font-extrabold text-gray-900">{selected.name}</span>
        </div>
      ) : null}
    </div>
  );
}
