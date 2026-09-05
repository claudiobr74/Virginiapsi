// Server-side Supabase auth must not auto-initialize before the route's
// explicit auth operation. In the OAuth callback, an eager initialization can
// race the PKCE code exchange and leave the first Google login attempt without
// a usable verifier/session while a second attempt succeeds.
//
// Keep this shared by Route/Server clients and the proxy so both follow the
// same invariant. `getUser()` / `exchangeCodeForSession()` remain the explicit
// first auth operation at their respective boundaries.
export const SUPABASE_SERVER_AUTH_OPTIONS = {
  skipAutoInitialize: true,
} as const;
