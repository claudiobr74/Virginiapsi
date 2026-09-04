import { NextResponse, type NextRequest } from "next/server";
import { getConnection } from "@/features/calendar/connection-queries";
import { ensureGoogleCalendarReady } from "@/features/calendar/ensure-calendar";
import {
  googleOAuthReturnPath,
  parseGoogleOAuthReturnOrigin,
  parseGoogleOAuthReturnTo,
  type GoogleOAuthReturnTo,
} from "@/features/calendar/oauth-callback";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { requireUser } from "@/lib/auth/require-user";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import { completeGoogleConnection } from "@/lib/integrations/google/connection";
import { verifyOAuthState } from "@/lib/integrations/google/oauth";

function redirectWithStatus(
  origin: string,
  status: "connected" | "error",
  detail?: string,
  returnTo: GoogleOAuthReturnTo = "agenda",
) {
  return NextResponse.redirect(
    new URL(googleOAuthReturnPath(returnTo, status, detail), origin),
  );
}

function handoffToAuthenticatedOrigin(
  request: NextRequest,
  returnOrigin: string,
  state: string,
) {
  const target = new URL("/api/integrations/google/callback", returnOrigin);
  target.searchParams.set("state", state);

  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    target.searchParams.set("code", code);
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    target.searchParams.set("error", error);
  }

  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const state = searchParams.get("state");

  let env;
  try {
    env = getGoogleCalendarEnv();
  } catch {
    return redirectWithStatus(origin, "error", "invalid_env");
  }

  if (!state) {
    return redirectWithStatus(origin, "error", "missing_code_or_state");
  }

  const verified = verifyOAuthState(state, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (!verified.valid || !verified.payload) {
    return redirectWithStatus(
      origin,
      "error",
      verified.reason ?? "invalid_state",
    );
  }

  const returnTo = parseGoogleOAuthReturnTo(verified.payload.returnTo);
  const returnOrigin = parseGoogleOAuthReturnOrigin(
    verified.payload.returnOrigin,
    env.NEXT_PUBLIC_APP_URL,
  );

  // Google always calls the canonical redirect URI. If OAuth started on a
  // Vercel preview, send the still-unconsumed authorization code back to that
  // signed origin. The preview owns the Supabase session cookie, so the normal
  // authenticated/RLS path can finish the connection without service-role
  // bypasses or cross-domain cookies.
  if (origin !== returnOrigin) {
    return handoffToAuthenticatedOrigin(request, returnOrigin, state);
  }

  const user = await requireUser();

  if (verified.payload.userId !== user.id) {
    return redirectWithStatus(
      returnOrigin,
      "error",
      "state_user_mismatch",
      returnTo,
    );
  }

  const error = searchParams.get("error");
  if (error) {
    return redirectWithStatus(returnOrigin, "error", error, returnTo);
  }

  const code = searchParams.get("code");
  if (!code) {
    return redirectWithStatus(
      returnOrigin,
      "error",
      "missing_code_or_state",
      returnTo,
    );
  }

  try {
    await completeGoogleConnection({
      organizationId: verified.payload.organizationId,
      code,
    });
  } catch {
    return redirectWithStatus(
      returnOrigin,
      "error",
      "token_exchange_failed",
      returnTo,
    );
  }

  try {
    const connection = await getConnection(verified.payload.organizationId);
    await ensureGoogleCalendarReady(
      verified.payload.organizationId,
      connection,
    );
  } catch {
    // Tokens already saved; operator can pick a calendar in the UI.
  }

  try {
    await logAuditEvent({
      organizationId: verified.payload.organizationId,
      action: "google_calendar.connect",
      resourceType: "google_calendar_connection",
    });
  } catch {
    // Connection already persisted; do not fail the user on audit write.
  }

  return redirectWithStatus(returnOrigin, "connected", undefined, returnTo);
}
