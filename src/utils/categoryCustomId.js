function hashCategorySeed(value) {
  const input = String(value || "");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);

    second ^= code + 0x9e3779b9 + ((second << 6) >>> 0) + (second >>> 2);
    second >>>= 0;
  }

  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`.slice(0, 14);
}

export function buildCustomCategoryId(userId, legacyId) {
  const userPart = String(userId || "")
    .replace(/-/g, "")
    .slice(0, 12)
    .toLowerCase() || "guest";

  return `cat_${userPart}_${hashCategorySeed(legacyId)}`;
}
