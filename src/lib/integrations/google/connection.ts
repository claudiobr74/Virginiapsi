import "server-only";

import { GoogleCalendarClient } from "@/lib/integrations/google/calendar-client";
import { decryptToken, encryptToken } from "@/lib/integrations/google/crypto";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  refreshAccessToken,
} from "@/lib/integrations/google/oauth";
import { googleCalendarRedirectUri } from "@/lib/env/schema";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstRpcRow } from "@/lib/supabase/rpc-result";

const EXPIRY_SAFETY_MARGIN_MS = 60_000;

interface StoredCredentials {
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  refresh_token_encrypted: string;
}

async function loadCredentials(
  organizationId: string,
): Promise<StoredCredentials | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_google_credentials", {
    org_id: organizationId,
  });

  if (error) {
    throw new Error(`failed to load Google credentials: ${error.message}`);
  }

  return firstRpcRow<StoredCredentials>(data);
}

async function persistCredentials(
  organizationId: string,
  tokens: { accessToken: string; expiresAt: Date; refreshToken?: string; email?: string },
): Promise<void> {
  const env = getGoogleCalendarEnv();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("upsert_google_credentials", {
    org_id: organizationId,
    p_access_token_encrypted: encryptToken(tokens.accessToken, env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    p_access_token_expires_at: tokens.expiresAt.toISOString(),
    p_refresh_token_encrypted: tokens.refreshToken
      ? encryptToken(tokens.refreshToken, env.GOOGLE_TOKEN_ENCRYPTION_KEY)
      : // upsert_google_credentials() keeps the existing refresh token when
        // this is null — Google only reissues one on first consent.
        (null as unknown as string),
    p_google_account_email: tokens.email ?? null,
    p_scopes: null,
  });

  if (error) {
    throw new Error(`failed to persist Google credentials: ${error.message}`);
  }
}

/**
 * Returns a valid (non-expired) access token for the organization's Google
 * Calendar connection, refreshing it first if needed. Throws if the
 * organization has no connection — callers should treat that as
 * "not connected" and prompt reconnection.
 */
export async function getValidAccessToken(organizationId: string): Promise<string> {
  const env = getGoogleCalendarEnv();
  const credentials = await loadCredentials(organizationId);

  if (!credentials) {
    throw new Error("google_calendar_not_connected");
  }

  const expiresAt = credentials.access_token_expires_at
    ? new Date(credentials.access_token_expires_at).getTime()
    : 0;

  if (
    credentials.access_token_encrypted &&
    expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()
  ) {
    return decryptToken(credentials.access_token_encrypted, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  }

  const refreshToken = decryptToken(
    credentials.refresh_token_encrypted,
    env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );

  const refreshed = await refreshAccessToken({
    refreshToken,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });

  await persistCredentials(organizationId, {
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    refreshToken: refreshed.refresh_token,
  });

  return refreshed.access_token;
}

export async function getCalendarClientForOrganization(
  organizationId: string,
): Promise<GoogleCalendarClient> {
  const accessToken = await getValidAccessToken(organizationId);
  return new GoogleCalendarClient({ accessToken });
}

export interface CompleteConnectionInput {
  organizationId: string;
  code: string;
}

/** Called from the OAuth callback route after state verification. */
export async function completeGoogleConnection(
  input: CompleteConnectionInput,
): Promise<{ email: string }> {
  const env = getGoogleCalendarEnv();

  const tokens = await exchangeCodeForTokens({
    code: input.code,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: googleCalendarRedirectUri(env.NEXT_PUBLIC_APP_URL),
  });

  if (!tokens.refresh_token) {
    // Should not happen with access_type=offline + prompt=consent, but never
    // silently store a connection Tesseli cannot actually use in the
    // background (no refresh token means no offline sync).
    throw new Error("google_no_refresh_token");
  }

  const userInfo = await fetchGoogleUserInfo(tokens.access_token);

  await persistCredentials(input.organizationId, {
    accessToken: tokens.access_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    refreshToken: tokens.refresh_token,
    email: userInfo.email,
  });

  return { email: userInfo.email };
}

export async function disconnectGoogleCalendar(organizationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("disconnect_google_calendar", {
    org_id: organizationId,
  });
  if (error) {
    throw new Error(`failed to disconnect Google Calendar: ${error.message}`);
  }
}

export async function listAvailableCalendars(organizationId: string) {
  const client = await getCalendarClientForOrganization(organizationId);
  return client.listCalendars();
}

export async function selectPrimaryGoogleCalendar(
  organizationId: string,
): Promise<boolean> {
  const calendars = await listAvailableCalendars(organizationId);
  const chosen = calendars.find((calendar) => calendar.primary) ?? calendars[0];
  if (!chosen) {
    return false;
  }
  await selectOrganizationCalendar(
    organizationId,
    chosen.id,
    chosen.summary || chosen.id,
  );
  return true;
}

export async function selectOrganizationCalendar(
  organizationId: string,
  calendarId: string,
  calendarSummary: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("google_calendar_connections")
    .update({ calendar_id: calendarId, calendar_summary: calendarSummary })
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`failed to select calendar: ${error.message}`);
  }
}
