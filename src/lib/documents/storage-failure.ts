/**
 * Classify Storage/admin failures for server logs without leaking URLs,
 * tokens, JWTs or secret material. Safe to import from unit tests.
 */

const TOKENISH =
  /(?:eyJ[\w-]+\.[\w-]+\.[\w-]+)|(?:sb_secret_[^\s]+)|(?:Bearer\s+[^\s]+)|(?:token=[^\s&]+)/i;
const URLISH = /https?:\/\/[^\s)]+/i;

function asRecord(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  return error as Record<string, unknown>;
}

function safeCodeFragment(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) {
    return null;
  }
  if (URLISH.test(trimmed) || TOKENISH.test(trimmed)) {
    return null;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function classifyStorageFailure(error: unknown): { code: string } {
  const record = asRecord(error);
  const fromCode = safeCodeFragment(record?.code) ?? safeCodeFragment(record?.statusCode);
  if (fromCode) {
    return { code: fromCode };
  }

  const raw = error instanceof Error ? error.message : String(error ?? "unknown");
  const sanitized = raw.replace(URLISH, "").replace(TOKENISH, "").toLowerCase();

  if (sanitized.includes("invalid environment configuration")) {
    return { code: "env_invalid" };
  }
  if (sanitized.includes("bucket") && sanitized.includes("not found")) {
    return { code: "bucket_not_found" };
  }
  if (sanitized.includes("row-level security") || sanitized.includes("unauthorized")) {
    return { code: "unauthorized" };
  }
  if (sanitized.includes("payload too large") || sanitized.includes("maximum allowed size")) {
    return { code: "payload_too_large" };
  }
  if (sanitized.includes("mime") || sanitized.includes("content-type")) {
    return { code: "invalid_mime" };
  }
  return { code: "signed_url_failed" };
}
