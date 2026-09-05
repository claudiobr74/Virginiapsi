/** Query param used only when experimental per-flow redirect IDs are enabled. */
export const PKCE_FLOW_ID_QUERY = "sb_flow_id";

/** Supabase auth-js accepts 8-64 URL-safe flow-id characters. */
const PKCE_FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const COOKIE_CHUNK_SUFFIX = /\.\d+$/;
const PKCE_FLOW_MARKER = "-flow-";
const PKCE_VERIFIER_SUFFIX = "-code-verifier";

/**
 * Keep the browser OAuth callback URL stable and queryless.
 *
 * The project already has a proven login flow based on an exact
 * `/auth/callback` redirect. Appending `?sb_flow_id=...` can make that URL stop
 * matching Supabase Redirect URLs and make Auth fall back to the Site URL,
 * changing Vercel hosts and losing the host-scoped PKCE verifier cookie.
 *
 * Server-side `skipAutoInitialize` remains the protection against the original
 * first-attempt exchange race. Do not re-enable this experimental redirect
 * mutation without also changing the hosted Supabase redirect configuration.
 */
export const BROWSER_PKCE_AUTH_OPTIONS = {
  experimental: {
    appendPkceFlowIdToRedirects: false,
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
 * Backward-compatible recovery for an older per-flow callback that may still
 * be open in a browser tab. New Google login attempts no longer append a flow
 * id to the redirect URL.
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
