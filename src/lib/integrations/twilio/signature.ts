import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio request signature (HMAC-SHA1 of the full URL concatenated with
 * the POST params in lexicographic key order), compared in constant time.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], "");
  return createHmac("sha1", authToken)
    .update(url + sorted, "utf8")
    .digest("base64");
}

export function isValidTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  provided: string | null,
): boolean {
  if (!provided) {
    return false;
  }
  const expected = twilioSignature(url, params, authToken);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function formDataToParams(form: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = value;
  }
  return params;
}
