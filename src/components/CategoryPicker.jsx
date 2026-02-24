import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { buildCategoryHierarchy, splitSelection, isDeletedCategory, getAncestors } from "../utils/categoryHierarchy";

function normalizeText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ");
}

function uniqById(list) {
  const out = [];
  const seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const id = String(x?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(x);
  }
  return out;
}

export default function CategoryPicker({
  categories = [],
  value = "",
  onChange,
  title = "หมวดหมู่",
  placeholder = "ค้นหาหมวดหมู่...",
  recent = [],
  maxListHeightClass = "max-h-[46dvh]",
  showTitle = true,
  twoStep = false,
  className = "",
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("main"); // "main" | "sub" (twoStep only)
  const [manualMainId, setManualMainId] = useState("");

  const selectedId = String(value || "").trim();
  const listAll = useMemo(() => (Array.isArray(categories) ? categories.filter(Boolean) : []), [categories]);

  // Hide tombstones from lists, but keep the selected category visible if needed.
  const list = useMemo(() => {
    return listAll.filter((c) => {
      const id = String(c?.id || "").trim();
      if (!id) return false;
      if (!isDeletedCategory(c)) return true;
      return id === selectedId;
    });
  }, [listAll, selectedId]);

  const hierarchy = useMemo(() => buildCategoryHierarchy(list), [list]);
  const selection = useMemo(() => splitSelection(selectedId, hierarchy), [selectedId, hierarchy]);

  // Collapse sub-step after a real selection change (so UI doesn't feel "stuck")
  useEffect(() => {
    if (!twoStep) return;
    // Avoid setState synchronously inside effects (React Compiler / hooks lint rule).
    const t = setTimeout(() => {
      setStage("main");
      setManualMainId("");
    }, 0);
    return () => clearTimeout(t);
  }, [twoStep, selectedId]);

  const derivedMainId = useMemo(() => {
    const m = String(selection?.mainId || "").trim();
    if (m) return m;
    return String(hierarchy?.main?.[0]?.id || "");
  }, [selection, hierarchy]);

  const activeMainId = String(manualMainId || derivedMainId || "");

  const recentCats = useMemo(() => {
    const byId = hierarchy?.byId || new Map();
    const normalized = uniqById(recent)
      .map((c) => byId.get(String(c?.id || "").trim()) || c)
      .filter(Boolean)
      .filter((c) => {
        const id = String(c?.id || "").trim();
        return id && (byId.has(id) || listAll.some((x) => String(x?.id || "") === id));
      })
      .filter((c) => !isDeletedCategory(c) || String(c?.id || "") === selectedId);
    return normalized.slice(0, 10);
  }, [recent, hierarchy, listAll, selectedId]);

  const getBreadcrumb = useCallback((id) => {
    const cid = String(id || "").trim();
    if (!cid) return "";
    const byId = hierarchy?.byId;
    const parentById = hierarchy?.parentById;
    const me = byId?.get?.(cid);
    if (!me) return "";

    const ancestors = getAncestors(cid, parentById);
    const chain = [...ancestors].reverse().map((aid) => byId.get(aid)).filter(Boolean);
    chain.push(me);
    return chain.map((c) => String(c?.name || "").trim()).filter(Boolean).join(" › ");
  }, [hierarchy]);

  const selectedBreadcrumb = useMemo(() => getBreadcrumb(selectedId), [selectedId, getBreadcrumb]);

  const selectedCat = useMemo(() => {
    const byId = hierarchy?.byId;
    if (!byId) return null;
    const id = String(selectedId || "").trim();
    if (!id) return null;
    return byId.get(id) || null;
  }, [hierarchy, selectedId]);

  const activeMainCat = useMemo(() => {
    const byId = hierarchy?.byId;
    const id = String(activeMainId || "").trim();
    if (!byId || !id) return null;
    return byId.get(id) || null;
  }, [hierarchy, activeMainId]);

  const searchResults = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return [];
    const byId = hierarchy?.byId;
    const parentById = hierarchy?.parentById;
    const source = Array.isArray(list) ? list : [];

    const hit = [];
    for (const c of source) {
      const id = String(c?.id || "").trim();
      if (!id) continue;
      const name = normalizeText(c?.name);
      if (!name) continue;
      if (!name.includes(q)) continue;

      // Build short breadcrumb
      const ancestors = getAncestors(id, parentById);
      const chain = [...ancestors].reverse().map((aid) => byId.get(aid)).filter(Boolean);
      chain.push(c);
      const crumb = chain.map((x) => String(x?.name || "").trim()).filter(Boolean).join(" › ");

      hit.push({ c, crumb, rank: name.indexOf(q) });
    }

    hit.sort((a, b) => (a.rank - b.rank) || String(a.crumb).localeCompare(String(b.crumb), "th"));
    return hit.slice(0, 24);
  }, [query, hierarchy, list]);

  const subcats = useMemo(() => {
    const kids = hierarchy?.childrenByParent?.get?.(activeMainId) || [];
    return Array.isArray(kids) ? kids : [];
  }, [hierarchy, activeMainId]);

  const isSelected = (id) => String(id || "") === selectedId;
  const chipBaseClass =
    "w-full px-3 py-3 rounded-2xl border text-left text-sm font-extrabold transition-all active:scale-[0.99] min-w-0";
  const chipStateClass = (on, deleted) =>
    `${on ? "bg-gray-900/90 text-white border-white/10 shadow-sm" : "bg-white/20 text-gray-900 border-white/15 hover:bg-white/10"} ${
      deleted ? "opacity-70" : ""
    }`;

  return (
    <div className={`min-w-0 rounded-3xl border border-white/20 bg-white/10 p-3 md:p-4 ${className}`.trim()}>
      {showTitle ? (
        <div className="text-xs font-bold text-gray-900/70 mb-3">{title}</div>
      ) : null}

      {/* Search */}
      <div className="relative min-w-0">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-900/45" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full glass-input rounded-2xl pl-10 pr-10 py-3 bg-white/30 outline-none focus:border-gray-900 text-sm font-extrabold text-gray-900"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white/20 border border-white/15 text-gray-900/60 active:scale-95"
            onClick={() => setQuery("")}
            aria-label="clear search"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {selectedBreadcrumb ? (
        <div className="mt-2 text-[11px] text-gray-900/60 flex items-center gap-1 min-w-0">
          <span className="font-bold shrink-0">เลือก:</span>
          {selectedCat?.icon ? <span className="shrink-0">{selectedCat.icon}</span> : null}
          <span className="truncate">{selectedBreadcrumb}</span>
        </div>
      ) : null}

      {/* Search results */}
      {query.trim() ? (
        <div className={`mt-3 rounded-2xl bg-white/15 border border-white/20 overflow-hidden ${maxListHeightClass} overflow-y-auto`}
        >
          {searchResults.length ? (
            <div className="divide-y divide-white/10">
              {searchResults.map(({ c, crumb }) => {
                const id = String(c?.id || "").trim();
                const deleted = isDeletedCategory(c) && id !== selectedId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onChange?.(id);
                      // when choosing via search, reset two-step state
                      if (twoStep) {
                        setStage("main");
                        setManualMainId("");
                      }
                      setQuery("");
                    }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/10 active:scale-[0.99] min-w-0 ${
                      isSelected(id) ? "bg-gray-900/80 text-white" : "text-gray-900"
                    } ${deleted ? "opacity-70" : ""}`}
                    title={crumb}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div
                        className={`shrink-0 w-9 h-9 rounded-2xl border border-white/15 bg-white/20 flex items-center justify-center text-lg ${
                          isSelected(id) ? "bg-white/20" : ""
                        }`}
                        aria-hidden
                      >
                        {c?.icon || "🏷️"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold truncate">{c?.name}</div>
                        <div className={`text-[11px] truncate ${isSelected(id) ? "text-white/75" : "text-gray-900/55"}`}>{crumb}</div>
                      </div>
                    </div>
                    <ChevronRight size={16} className={isSelected(id) ? "text-white/80" : "text-gray-900/40"} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-5 text-sm text-gray-900/60 font-extrabold">ไม่พบหมวดหมู่</div>
          )}
        </div>
      ) : (
        <>
          {/* Recent (hide in twoStep main stage to keep UI focused on "main first") */}
          {!twoStep && recentCats.length ? (
            <div className="mt-3">
              <div className="text-[11px] font-extrabold text-gray-900/55 uppercase mb-2">ล่าสุด</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {recentCats.map((cat) => {
                  const id = String(cat?.id || "").trim();
                  const deleted = isDeletedCategory(cat) && id !== selectedId;
                  const on = isSelected(id);
                  return (
                    <button
                      key={`r-${id}`}
                      type="button"
                      onClick={() => onChange?.(id)}
                      className={`${chipBaseClass} ${chipStateClass(on, deleted)}`}
                      title={getBreadcrumb(id)}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0 w-full">
                        <span className="shrink-0 text-base">{cat?.icon || "🏷️"}</span>
                        <span className="truncate">{cat?.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Main categories */}
          {!twoStep || stage === "main" ? (
            <div className="mt-4">
              <div className="text-[11px] font-extrabold text-gray-900/55 uppercase mb-2">หมวดหลัก</div>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${maxListHeightClass} overflow-y-auto pr-1 no-scrollbar`}>
                {hierarchy.main.map((cat) => {
                  const id = String(cat?.id || "").trim();
                  const on = String(activeMainId) === id;
                  const deleted = isDeletedCategory(cat) && id !== selectedId;
                  return (
                    <button
                      key={`m-${id}`}
                      type="button"
                      onClick={() => {
                        if (!twoStep) {
                          onChange?.(id);
                          return;
                        }

                        // two-step: choose main first, then show subs under it
                        setManualMainId(id);

                        const kids = hierarchy?.childrenByParent?.get?.(id) || [];
                        const hasKids = Array.isArray(kids) && kids.length > 0;

                        if (hasKids) {
                          setStage("sub");
                        } else {
                          // no children → selecting main is final
                          onChange?.(id);
                          setStage("main");
                        }
                      }}
                      className={`${chipBaseClass} ${chipStateClass(on, deleted)}`}
                      title={String(cat?.name || "")}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0 w-full">
                        <span className="shrink-0 text-base">{cat?.icon || "🏷️"}</span>
                        <span className="truncate">{cat?.name}</span>
                        {twoStep ? <ChevronRight size={15} className={`ml-auto shrink-0 ${on ? "text-white/80" : "text-gray-900/50"}`} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Sub categories */}
          {!twoStep && subcats.length ? (
            <div className="mt-4">
              <div className="text-[11px] font-extrabold text-gray-900/55 uppercase mb-2">หมวดย่อย</div>
              <div className={`grid grid-cols-2 gap-2 ${maxListHeightClass} overflow-y-auto pr-1 no-scrollbar`}
              >
                {subcats.map((cat) => {
                  const id = String(cat?.id || "").trim();
                  const on = isSelected(id);
                  const deleted = isDeletedCategory(cat) && id !== selectedId;
                  return (
                    <button
                      key={`s-${id}`}
                      type="button"
                      onClick={() => onChange?.(id)}
                      className={`${chipBaseClass} ${chipStateClass(on, deleted)}`}
                      title={getBreadcrumb(id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-base">{cat?.icon || "🏷️"}</span>
                        <span className="truncate">{cat?.name}</span>
                      </div>
                      {deleted ? (
                        <div className={`text-[10px] font-extrabold mt-1 ${on ? "text-white/70" : "text-red-700/70"}`}>(Deleted)</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Two-step sub stage: show subs only after user picked a main */}
          {twoStep && stage === "sub" && subcats.length ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setStage("main")}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/20 border border-white/15 text-xs font-extrabold text-gray-900/80 active:scale-95"
                >
                  <ChevronLeft size={16} /> เปลี่ยนหมวดหลัก
                </button>

                <div className="min-w-0 flex items-center gap-2">
                  <div className="text-[11px] font-extrabold text-gray-900/55 uppercase">หมวดย่อย</div>
                  {activeMainCat ? (
                    <div className="text-[11px] font-extrabold text-gray-900/70 min-w-0 truncate">
                      • {activeMainCat.icon} {activeMainCat.name}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* option to keep main (no sub) */}
              {activeMainId ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange?.(activeMainId);
                    setStage("main");
                  }}
                  className="w-full mb-2 px-3 py-3 rounded-2xl border border-white/15 bg-white/20 text-left text-sm font-extrabold text-gray-900 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-base">{activeMainCat?.icon || "🏷️"}</span>
                    <span className="truncate">ใช้หมวดหลักนี้{activeMainCat?.name ? `: ${activeMainCat.name}` : ""}</span>
                  </div>
                </button>
              ) : null}

              <div className={`grid grid-cols-2 gap-2 ${maxListHeightClass} overflow-y-auto pr-1 no-scrollbar`}
              >
                {subcats.map((cat) => {
                  const id = String(cat?.id || "").trim();
                  const on = isSelected(id);
                  const deleted = isDeletedCategory(cat) && id !== selectedId;
                  return (
                    <button
                      key={`ts-${id}`}
                      type="button"
                      onClick={() => {
                        onChange?.(id);
                        setStage("main");
                      }}
                      className={`${chipBaseClass} ${chipStateClass(on, deleted)}`}
                      title={getBreadcrumb(id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-base">{cat?.icon || "🏷️"}</span>
                        <span className="truncate">{cat?.name}</span>
                      </div>
                      {deleted ? (
                        <div className={`text-[10px] font-extrabold mt-1 ${on ? "text-white/70" : "text-red-700/70"}`}>(Deleted)</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
