/** Query param appended when `auth.experimental.appendPkceFlowIdToRedirects` is on. */
export const PKCE_FLOW_ID_QUERY = "sb_flow_id";

/**
 * Installed `@supabase/auth-js` 2.112.3 supports this flag on `createBrowserClient`.
 * Without it, concurrent PKCE verifiers cannot be matched on `/auth/callback`.
 */
export const BROWSER_PKCE_AUTH_OPTIONS = {
  experimental: {
    appendPkceFlowIdToRedirects: true,
  },
} as const;

export function readPkceFlowId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 128) {
    return undefined;
  }
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function cookieListHasPkceVerifier(cookies: { name: string }[]): boolean {
  return cookies.some((cookie) => cookie.name.endsWith("-code-verifier"));
}
