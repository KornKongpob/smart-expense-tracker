import crypto from "node:crypto";

function getSecret() {
  const secret = String(process.env.SUPABASE_ACCOUNT_DIGITS_KEY || "").trim();
  if (!secret) throw new Error("account_digits_key_missing");
  return secret;
}

function getKey() {
  return crypto.createHash("sha256").update(getSecret()).digest();
}

export function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function maskDigits(value) {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  const tail = digits.slice(-4);
  return `•••• ${tail}`;
}

export function encryptAccountDigits(value) {
  const digits = normalizeDigits(value);
  if (!digits) {
    return {
      digitsCiphertext: "",
      digitsMasked: "",
      last4: "",
      last6: "",
    };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    digitsCiphertext: [
      "v1",
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":"),
    digitsMasked: maskDigits(digits),
    last4: digits.slice(-4),
    last6: digits.slice(-6),
  };
}
