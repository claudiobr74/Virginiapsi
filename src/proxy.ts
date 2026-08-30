import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parsePublicEnv } from "@/lib/env/schema";
import { buildContentSecurityPolicy, createCspNonce, supabaseOriginFromUrl } from "@/lib/security/csp";

const PROTECTED_PREFIXES = [
  "/app",
  "/session",
  "/onboarding",
  "/select-organization",
];
const AUTH_ONLY_WHEN_ANONYMOUS = ["/login"];

function applyCsp(
  response: NextResponse,
  nonce: string,
  supabaseOrigin: string | null,
): NextResponse {
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseOrigin,
    isDev: process.env.NODE_ENV !== "production",
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = createCspNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let env;
  try {
    env = parsePublicEnv(process.env);
  } catch {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    return applyCsp(response, nonce, null);
  }

  const supabaseOrigin = supabaseOriginFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  let response = applyCsp(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
    supabaseOrigin,
  );

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = applyCsp(
            NextResponse.next({ request: { headers: requestHeaders } }),
            nonce,
            supabaseOrigin,
          );
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Do not add logic between client creation and getUser(): it must be the
  // first call so the refreshed session cookies are captured correctly.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    return response;
  }

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return applyCsp(NextResponse.redirect(loginUrl), nonce, supabaseOrigin);
  }

  const isAnonymousOnly = AUTH_ONLY_WHEN_ANONYMOUS.some(
    (path) => pathname === path,
  );
  if (isAnonymousOnly && user) {
    return applyCsp(NextResponse.redirect(new URL("/app", request.url)), nonce, supabaseOrigin);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|brand/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
