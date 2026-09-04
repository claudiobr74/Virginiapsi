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
 * Fresh, non-singleton client used only to begin a login redirect.
 * It must not initialize/refresh a stale browser session before writing the
 * verifier for the new PKCE flow.
 */
export function createSupabaseLoginBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    isSingleton: false,
    auth: {
      ...BROWSER_PKCE_AUTH_OPTIONS,
      skipAutoInitialize: true,
    },
  });
}
