/**
 * Browser → Supabase Auth redirect helpers.
 *
 * Query strings on `redirectTo` (e.g. `?next=/app`) are often missing from the
 * Supabase Redirect URLs allow list. Auth then falls back to the Site URL,
 * which is still `http://localhost:3000` on a project that started locally —
 * the browser shows ERR_CONNECTION_REFUSED after Google sign-in.
 *
 * `sb_flow_id` is appended by auth-js when PKCE flow-id redirects are enabled.
 * Supabase Redirect URLs must tolerate that query (wildcard `/**` on Preview).
 */
import { PKCE_FLOW_ID_QUERY, readPkceFlowId } from "@/features/auth/pkce-flow";

type QueryValue = string | string[] | undefined;
type QueryRecord = Record<string, QueryValue>;

function firstQueryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function oauthCallbackRedirectTo(origin: string): string {
  return `${origin.replace(/\/$/, "")}/auth/callback`;
}

/** Forces Google's account picker even when one Gmail session is already open. */
export const GOOGLE_SIGNIN_QUERY_PARAMS = {
  prompt: "select_account",
} as const;

/** Forwards an OAuth `code` that landed on `/` or `/login` (Site URL without path). */
export function oauthCodeCallbackPath(params: QueryRecord): string | null {
  const code = firstQueryValue(params.code)?.trim();
  if (!code) {
    return null;
  }

  const next = new URLSearchParams();
  next.set("code", code);
  const after = firstQueryValue(params.next);
  if (after && after.startsWith("/") && !after.startsWith("//")) {
    next.set("next", after);
  }
  const flowId = readPkceFlowId(firstQueryValue(params[PKCE_FLOW_ID_QUERY]));
  if (flowId) {
    next.set(PKCE_FLOW_ID_QUERY, flowId);
  }
  return `/auth/callback?${next.toString()}`;
}
