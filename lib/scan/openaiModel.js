const OPENAI_SCAN_DEFAULT_MODEL = "gpt-5.4";

export function normalizeOpenAIModel(raw) {
  const safe = String(raw || "").trim();
  if (!safe) return OPENAI_SCAN_DEFAULT_MODEL;

  const lower = safe.toLowerCase();

  if (
    lower === "5" ||
    lower === "5.0" ||
    lower === "gpt5" ||
    lower === "gpt-5.0" ||
    lower === "gpt-5.0.0" ||
    lower === "chatgpt-5" ||
    lower === "chatgpt-5.0" ||
    lower === "chat gpt 5" ||
    lower === "chat gpt 5.0" ||
    lower === "chatgpt 5" ||
    lower === "chatgpt 5.0"
  ) {
    return "gpt-5-chat-latest";
  }

  if (
    lower === "5.1" ||
    lower === "gpt5.1" ||
    lower === "gpt-5.1" ||
    lower === "chatgpt 5.1" ||
    lower === "chatgpt-5.1"
  ) {
    return "gpt-5.1";
  }

  if (
    lower === "5.4" ||
    lower === "gpt5.4" ||
    lower === "gpt-5.4" ||
    lower === "chatgpt 5.4" ||
    lower === "chatgpt-5.4"
  ) {
    return OPENAI_SCAN_DEFAULT_MODEL;
  }

  if (lower === "gpt-5.0") return "gpt-5";

  return safe;
}

export { OPENAI_SCAN_DEFAULT_MODEL };
