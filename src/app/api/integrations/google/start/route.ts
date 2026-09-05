import { NextResponse, type NextRequest } from "next/server";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import {
  buildAuthorizationUrl,
  verifyOAuthState,
} from "@/lib/integrations/google/oauth";
import { resolveGoogleCalendarOAuthStart } from "@/lib/integrations/google/oauth-start";

function redirectAgendaError(request: NextRequest, detail = "invalid_state") {
  const url = new URL("/app/agenda", request.url);
  url.searchParams.set("google", "error");
  url.searchParams.set("google_detail", detail);
  return NextResponse.redirect(url);
}

/**
 * startGoogleConnectionAction() is the authenticated/admin boundary. It signs
 * user + organization + return origin into a short-lived HMAC state before the
 * browser can leave the authenticated host. A Vercel preview may then hand
 * that signed state to the canonical host used by Google without attempting
 * to share Supabase cookies between hostnames.
 */
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  if (!state) {
    return redirectAgendaError(request, "missing_state");
  }

  let env;
  try {
    env = getGoogleCalendarEnv();
  } catch {
    return redirectAgendaError(request, "invalid_env");
  }

  const verified = verifyOAuthState(state, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (!verified.valid || !verified.payload) {
    return redirectAgendaError(request, verified.reason ?? "invalid_state");
  }

  let decision;
  try {
    decision = resolveGoogleCalendarOAuthStart({
      canonicalAppUrl: env.NEXT_PUBLIC_APP_URL,
      requestOrigin: request.nextUrl.origin,
    });
  } catch {
    return redirectAgendaError(request, "invalid_env");
  }

  if (decision.type === "redirect_to_canonical") {
    const canonicalStart = new URL(decision.url);
    canonicalStart.searchParams.set("state", state);
    return NextResponse.redirect(canonicalStart);
  }

  if (decision.type !== "authorize") {
    return redirectAgendaError(request, "invalid_redirect_uri");
  }

  const authorizationUrl = buildAuthorizationUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: decision.redirectUri,
    state,
  });

  return NextResponse.redirect(authorizationUrl);
}
