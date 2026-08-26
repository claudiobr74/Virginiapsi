import { NextResponse, type NextRequest } from "next/server";
import { getConnection } from "@/features/calendar/connection-queries";
import { ensureGoogleCalendarReady } from "@/features/calendar/ensure-calendar";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { requireUser } from "@/lib/auth/require-user";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import { completeGoogleConnection } from "@/lib/integrations/google/connection";
import { verifyOAuthState } from "@/lib/integrations/google/oauth";

function redirectWithStatus(origin: string, status: "connected" | "error", detail?: string) {
  const url = new URL("/app/agenda", origin);
  url.searchParams.set("google", status);
  if (detail) {
    url.searchParams.set("google_detail", detail);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  const user = await requireUser();

  const error = searchParams.get("error");
  if (error) {
    return redirectWithStatus(origin, "error", error);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    return redirectWithStatus(origin, "error", "missing_code_or_state");
  }

  let env;
  try {
    env = getGoogleCalendarEnv();
  } catch {
    return redirectWithStatus(origin, "error", "invalid_env");
  }

  const verified = verifyOAuthState(state, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (!verified.valid || !verified.payload) {
    return redirectWithStatus(origin, "error", verified.reason ?? "invalid_state");
  }

  // The state is cryptographically tied to the user/organization that
  // started the flow — a state signed for a different session is rejected
  // even if it is otherwise validly signed (replay/tamper protection).
  if (verified.payload.userId !== user.id) {
    return redirectWithStatus(origin, "error", "state_user_mismatch");
  }

  try {
    await completeGoogleConnection({
      organizationId: verified.payload.organizationId,
      code,
    });
  } catch {
    return redirectWithStatus(origin, "error", "token_exchange_failed");
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

  return redirectWithStatus(origin, "connected");
}
