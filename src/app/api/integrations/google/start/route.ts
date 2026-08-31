import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import { buildAuthorizationUrl } from "@/lib/integrations/google/oauth";
import { resolveGoogleCalendarOAuthStart } from "@/lib/integrations/google/oauth-start";

function redirectAgendaError(request: NextRequest) {
  return NextResponse.redirect(new URL("/app/agenda?google=error", request.url));
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
    return redirectAgendaError(request);
  }

  let env;
  try {
    env = getGoogleCalendarEnv();
  } catch {
    return redirectAgendaError(request);
  }

  let decision;
  try {
    decision = resolveGoogleCalendarOAuthStart({
      canonicalAppUrl: env.NEXT_PUBLIC_APP_URL,
      requestOrigin: request.nextUrl.origin,
    });
  } catch {
    return redirectAgendaError(request);
  }

  if (decision.type === "redirect_to_canonical") {
    return NextResponse.redirect(decision.url);
  }

  if (decision.type !== "authorize") {
    return redirectAgendaError(request);
  }

  const authorizationUrl = buildAuthorizationUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: decision.redirectUri,
    state,
  });

  return NextResponse.redirect(authorizationUrl);
}
