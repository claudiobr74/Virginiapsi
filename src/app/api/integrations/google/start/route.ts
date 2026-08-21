import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { isLoopbackHttpUrl } from "@/lib/env/schema";
import { getServerEnv } from "@/lib/env/server";
import { buildAuthorizationUrl } from "@/lib/integrations/google/oauth";

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
    env = getServerEnv();
  } catch {
    return redirectAgendaError(request);
  }

  if (
    isLoopbackHttpUrl(env.GOOGLE_OAUTH_REDIRECT_URI) &&
    !isLoopbackHttpUrl(request.nextUrl.origin)
  ) {
    return redirectAgendaError(request);
  }

  const authorizationUrl = buildAuthorizationUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
    state,
  });

  return NextResponse.redirect(authorizationUrl);
}
