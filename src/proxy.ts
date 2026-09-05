import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parsePublicEnv } from "@/lib/env/schema";
import { SUPABASE_SERVER_AUTH_OPTIONS } from "@/lib/supabase/server-auth-options";

const PROTECTED_PREFIXES = [
  "/app",
  "/session",
  "/onboarding",
  "/select-organization",
];
const AUTH_ONLY_WHEN_ANONYMOUS = ["/login"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  let env;
  try {
    env = parsePublicEnv(process.env);
  } catch {
    // Invalid public env must not 500 the entire site (including /login).
    return response;
  }
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: SUPABASE_SERVER_AUTH_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Do not add logic between client creation and getUser(): it must be the
  // first explicit auth call so refreshed session cookies are captured
  // correctly without racing eager server-client initialization.
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
    return NextResponse.redirect(loginUrl);
  }

  const isAnonymousOnly = AUTH_ONLY_WHEN_ANONYMOUS.some(
    (path) => pathname === path,
  );
  if (isAnonymousOnly && user) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|brand/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
