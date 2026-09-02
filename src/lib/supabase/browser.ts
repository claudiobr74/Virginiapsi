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
