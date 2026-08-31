import { NextResponse, type NextRequest } from "next/server";
import {
  googleOAuthReturnPath,
  parseGoogleOAuthReturnTo,
} from "@/features/calendar/oauth-callback";
import { requireUser } from "@/lib/auth/require-user";
import { isLoopbackHttpUrl } from "@/lib/env/schema";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import { buildAuthorizationUrl, verifyOAuthState } from "@/lib/integrations/google/oauth";

function redirectOAuthError(request: NextRequest, detail = "invalid_state") {
  const state = request.nextUrl.searchParams.get("state");
  let returnTo = parseGoogleOAuthReturnTo(undefined);
  if (state) {
    try {
      const env = getGoogleCalendarEnv();
      const verified = verifyOAuthState(state, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
      returnTo = parseGoogleOAuthReturnTo(verified.payload?.returnTo);
    } catch {
      // Keep the Agenda fallback when env/state cannot be read.
    }
  }
  return NextResponse.redirect(
    new URL(googleOAuthReturnPath(returnTo, "error", detail), request.url),
  );
}

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
    return redirectOAuthError(request, "missing_code_or_state");
  }

  let env;
  try {
    env = getGoogleCalendarEnv();
  } catch {
    return redirectOAuthError(request, "invalid_env");
  }

  if (
    isLoopbackHttpUrl(env.GOOGLE_OAUTH_REDIRECT_URI) &&
    !isLoopbackHttpUrl(request.nextUrl.origin)
  ) {
    return redirectOAuthError(request, "invalid_env");
  }

  const authorizationUrl = buildAuthorizationUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
    state,
  });

  return NextResponse.redirect(authorizationUrl);
}
