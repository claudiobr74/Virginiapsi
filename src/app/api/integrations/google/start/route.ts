import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizationUrl } from "@/lib/integrations/google/oauth";
import { getServerEnv } from "@/lib/env/server";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Only ever reached via a redirect from startGoogleConnectionAction(), which
 * already enforced the psychologist_admin check and signed the `state`. This
 * route still requires a real authenticated session on its own — never trust
 * that the redirect chain alone proves authorization.
 */
export async function GET(request: NextRequest) {
  await requireUser();

  const state = request.nextUrl.searchParams.get("state");
  if (!state) {
    return NextResponse.redirect(
      new URL("/app/agenda?google_error=missing_state", request.url),
    );
  }

  const env = getServerEnv();
  const authorizationUrl = buildAuthorizationUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
    state,
  });

  return NextResponse.redirect(authorizationUrl);
}
