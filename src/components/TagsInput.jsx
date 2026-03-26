// src/components/TagsInput.jsx
// Chip-based tags input for transactions.
// Supports typing + Enter to add, click X to remove, and autocomplete from history.

import { useState, useMemo, useRef } from "react";
import { X, Tag } from "lucide-react";

function normalizeTag(s) {
  return String(s || "").trim().toLowerCase().slice(0, 30);
}

export default function TagsInput({ value = [], onChange, allTags = [], placeholder = "เพิ่มแท็ก..." }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const tags = useMemo(() => (Array.isArray(value) ? value : []), [value]);

  const suggestions = useMemo(() => {
    const q = normalizeTag(input);
    if (!q) return [];
    const existing = new Set(tags.map(normalizeTag));
    return (allTags || [])
      .filter((t) => {
        const nt = normalizeTag(t);
        return nt && nt.includes(q) && !existing.has(nt);
      })
      .slice(0, 5);
  }, [input, tags, allTags]);

  const addTag = (raw) => {
    const t = normalizeTag(raw);
    if (!t) return;
    if (tags.some((x) => normalizeTag(x) === t)) return;
    onChange([...tags, t]);
    setInput("");
  };

  const removeTag = (idx) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && tags.length) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div>
      {/* Tag chips */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-indigo-600/12 text-indigo-800 border border-indigo-600/15"
          >
            <Tag size={11} />
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="ml-0.5 p-0.5 rounded-full hover:bg-indigo-600/15 active:scale-90 transition-transform"
              aria-label={`ลบแท็ก ${tag}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="ui-input text-sm"
          placeholder={tags.length ? "เพิ่มอีก..." : placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={30}
        />

        {/* Autocomplete dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 glass-card rounded-2xl overflow-hidden border border-white/20 shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addTag(s)}
                className="w-full px-4 py-2.5 text-left text-sm font-bold text-gray-800 hover:bg-white/30 active:bg-white/40 flex items-center gap-2"
              >
                <Tag size={13} className="text-gray-500 shrink-0" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
