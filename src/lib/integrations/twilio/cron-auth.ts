import { timingSafeEqual } from "node:crypto";

/**
 * Compare a provided cron secret with the configured value in constant time.
 * Length mismatch returns false without calling timingSafeEqual.
 */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function cronSecretFromRequest(request: Request): string | null {
  const header = request.headers.get("x-cron-secret");
  if (header) {
    return header;
  }
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return null;
}

export function isValidCronRequest(request: Request, expectedSecret: string): boolean {
  return secretsMatch(cronSecretFromRequest(request), expectedSecret);
}
