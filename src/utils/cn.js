// src/utils/cn.js
// Tiny className joiner (avoids adding deps like clsx)

export function cn(...parts) {
  return parts
    .flatMap((p) => {
      if (!p) return [];
      if (Array.isArray(p)) return p;
      if (typeof p === "object") {
        return Object.entries(p)
          .filter(([, v]) => !!v)
          .map(([k]) => k);
      }
      return [String(p)];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
