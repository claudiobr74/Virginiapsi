"use client";

import { createBrowserClient } from "@supabase/ssr";
import { BROWSER_PKCE_AUTH_OPTIONS } from "@/features/auth/pkce-flow";
import { getPublicEnv } from "@/lib/env/public";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: BROWSER_PKCE_AUTH_OPTIONS,
  });
}

/**
 * Fresh, non-singleton client used only to begin a Google login redirect.
 *
 * Important: do NOT append `sb_flow_id` to this redirect. Supabase matches
 * redirect allow-list entries against the full URL, including the query. On
 * Vercel previews an exact `/auth/callback` entry can therefore stop matching
 * after `?sb_flow_id=...` is appended and Auth falls back to the Site URL.
 * That changes hosts and the PKCE verifier cookie is no longer available to
 * the callback.
 *
 * We still get per-flow verifier cookies from auth-js; the server callback can
 * recover the single flow id from that cookie. The Google button also removes
 * obsolete verifier slots before starting a new attempt, so there is no need
 * to put the flow id in the redirect URL.
 */
export function createSupabaseLoginBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    isSingleton: false,
    auth: {
      skipAutoInitialize: true,
      experimental: {
        appendPkceFlowIdToRedirects: false,
      },
    },
  });
}
