import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parsePublicEnv } from "@/lib/env/schema";

const PROTECTED_PREFIXES = [
  "/app",
  "/session",
  "/onboarding",
  "/select-organization",
];
const AUTH_ONLY_WHEN_ANONYMOUS = ["/login"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = parsePublicEnv(process.env);
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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Do not add logic between client creation and getUser(): it must be the
  // first call so the refreshed session cookies are captured correctly.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
