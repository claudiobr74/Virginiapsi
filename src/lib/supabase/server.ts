import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env/public";
import { SUPABASE_SERVER_AUTH_OPTIONS } from "@/lib/supabase/server-auth-options";

export async function createSupabaseServerClient() {
  // Read cookies first so Next.js opts the route into dynamic rendering
  // even if public env validation throws afterwards.
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: SUPABASE_SERVER_AUTH_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component; session refresh happens in Route Handlers.
          }
        },
      },
    },
  );
}
