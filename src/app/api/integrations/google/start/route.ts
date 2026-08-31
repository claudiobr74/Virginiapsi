import { NextResponse, type NextRequest } from "next/server";
import {
  googleOAuthReturnPath,
  parseGoogleOAuthReturnTo,
} from "@/features/calendar/oauth-callback";
import { requireUser } from "@/lib/auth/require-user";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import { buildAuthorizationUrl, verifyOAuthState } from "@/lib/integrations/google/oauth";
import { resolveGoogleCalendarOAuthStart } from "@/lib/integrations/google/oauth-start";

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

  let decision;
  try {
    decision = resolveGoogleCalendarOAuthStart({
      canonicalAppUrl: env.NEXT_PUBLIC_APP_URL,
      requestOrigin: request.nextUrl.origin,
    });
  } catch {
    return redirectOAuthError(request, "invalid_env");
  }

  if (decision.type === "redirect_to_canonical") {
    return NextResponse.redirect(decision.url);
  }

  if (decision.type !== "authorize") {
    return redirectOAuthError(request, "invalid_env");
  }

  const authorizationUrl = buildAuthorizationUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: decision.redirectUri,
    state,
  });

  return NextResponse.redirect(authorizationUrl);
}
