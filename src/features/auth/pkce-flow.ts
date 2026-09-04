/** Query param appended when `auth.experimental.appendPkceFlowIdToRedirects` is on. */
export const PKCE_FLOW_ID_QUERY = "sb_flow_id";

/** Supabase auth-js accepts 8-64 URL-safe flow-id characters. */
const PKCE_FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const COOKIE_CHUNK_SUFFIX = /\.\d+$/;
const PKCE_FLOW_MARKER = "-flow-";
const PKCE_VERIFIER_SUFFIX = "-code-verifier";

/**
 * Installed `@supabase/auth-js` supports per-flow PKCE verifier slots.
 * Appending the flow id lets the callback choose the verifier that created
 * the code instead of falling back to the most recent legacy verifier.
 */
export const BROWSER_PKCE_AUTH_OPTIONS = {
  experimental: {
    appendPkceFlowIdToRedirects: true,
  },
} as const;

export function readPkceFlowId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !PKCE_FLOW_ID_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function unchunkCookieName(name: string): string {
  return name.trim().replace(COOKIE_CHUNK_SUFFIX, "");
}

export function isPkceVerifierCookieName(name: string): boolean {
  const normalized = unchunkCookieName(name);
  return normalized.startsWith("sb-") && normalized.endsWith(PKCE_VERIFIER_SUFFIX);
}

export function cookieListHasPkceVerifier(cookies: { name: string }[]): boolean {
  return cookies.some((cookie) => isPkceVerifierCookieName(cookie.name));
}

/**
 * Recovers a per-flow id from the verifier cookie itself. This is a safe
 * fallback only when exactly one flow is present. It covers Vercel/Supabase
 * redirect allow-list fallbacks that can drop the `sb_flow_id` query param.
 */
export function readPkceFlowIdFromCookies(
  cookies: { name: string }[],
): string | undefined {
  const candidates = new Set<string>();

  for (const cookie of cookies) {
    const name = unchunkCookieName(cookie.name);
    if (!isPkceVerifierCookieName(name)) {
      continue;
    }

    const markerIndex = name.lastIndexOf(PKCE_FLOW_MARKER);
    if (markerIndex < 0) {
      continue;
    }

    const rawFlowId = name.slice(
      markerIndex + PKCE_FLOW_MARKER.length,
      -PKCE_VERIFIER_SUFFIX.length,
    );
    const flowId = readPkceFlowId(rawFlowId);
    if (flowId) {
      candidates.add(flowId);
    }
  }

  return candidates.size === 1 ? [...candidates][0] : undefined;
}

export function resolvePkceFlowId(
  queryValue: string | null | undefined,
  cookies: { name: string }[],
): string | undefined {
  return readPkceFlowId(queryValue) ?? readPkceFlowIdFromCookies(cookies);
}

/**
 * Returns only Supabase PKCE verifier cookie names from `document.cookie`.
 * Session/access-token cookies are deliberately excluded.
 */
export function listPkceVerifierCookieNames(cookieHeader: string): string[] {
  const names = cookieHeader
    .split(";")
    .map((part) => part.split("=", 1)[0]?.trim() ?? "")
    .filter((name) => Boolean(name) && isPkceVerifierCookieName(name));

  return [...new Set(names)];
}
