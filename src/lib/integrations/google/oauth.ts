// Pure OAuth helpers (state signing, authorization URL, token exchange) —
// parameter-based like calendar-client.ts, so they stay unit-testable with a
// mock `fetch` and without needing real Google credentials.
import { createHmac, timingSafeEqual } from "node:crypto";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// Workspace scopes used by the explicit Calendar/Meet connection. This is
// intentionally independent from Supabase login/Google social sign-in
// (MASTER_PROMPT.md #9). The Meet scopes let the app create persistent spaces
// owned by a clinical session and configure automatic transcription when the
// user's Workspace edition/admin policy allows it.
export const GOOGLE_MEET_SPACE_SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.settings",
] as const;

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  ...GOOGLE_MEET_SPACE_SCOPES,
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export function parseGrantedGoogleScopes(scope: string | undefined): string[] | undefined {
  if (!scope?.trim()) {
    return undefined;
  }
  return scope.trim().split(/\s+/);
}

export function hasGoogleMeetSpaceScopes(scopes: readonly string[]): boolean {
  return GOOGLE_MEET_SPACE_SCOPES.every((scope) => scopes.includes(scope));
}

export interface OAuthStatePayload {
  organizationId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
  /** Whitelisted return surface after Google redirects back. */
  returnTo?: "agenda" | "settings";
  /**
   * Origin where the authenticated VirgíniaPsi session started the flow.
   * It is signed together with the user/org and validated again before use.
   * This lets a canonical Google callback hand the single-use code back to a
   * Vercel preview without trying to share host-scoped Supabase cookies.
   */
  returnOrigin?: string;
}

/**
 * Signs the OAuth `state` parameter (HMAC-SHA256) so the callback can verify
 * it was issued by this server for this organization/user and was not
 * tampered with — docs/05-security-rbac-rls.md requires the state to be
 * "assinado e ligado ao usuário/organização".
 */
export function signOAuthState(
  payload: OAuthStatePayload,
  secret: string,
): string {
  const json = JSON.stringify(payload);
  const encodedPayload = Buffer.from(json, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export interface VerifyStateResult {
  valid: boolean;
  payload?: OAuthStatePayload;
  reason?: "malformed" | "signature_mismatch" | "expired";
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function verifyOAuthState(
  state: string,
  secret: string,
  now: number = Date.now(),
): VerifyStateResult {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    return { valid: false, reason: "malformed" };
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return { valid: false, reason: "signature_mismatch" };
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (
    typeof payload.organizationId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.issuedAt !== "number" ||
    !Number.isFinite(payload.issuedAt)
  ) {
    return { valid: false, reason: "malformed" };
  }

  if (now - payload.issuedAt > STATE_MAX_AGE_MS || payload.issuedAt > now + 60_000) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, payload };
}

export interface BuildAuthorizationUrlOptions {
  clientId: string;
  redirectUri: string;
  state: string;
  /** Forces Google to reissue a refresh token even on reconnect. */
  forceConsent?: boolean;
}

export function buildAuthorizationUrl(options: BuildAuthorizationUrlOptions): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("state", options.state);
  if (options.forceConsent ?? true) {
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

export interface ExchangeCodeOptions {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export async function exchangeCodeForTokens(
  options: ExchangeCodeOptions,
): Promise<TokenResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: options.code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  return (await response.json()) as TokenResponse;
}

export interface RefreshAccessTokenOptions {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

export async function refreshAccessToken(
  options: RefreshAccessTokenOptions,
): Promise<TokenResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: options.refreshToken,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status}`);
  }

  return (await response.json()) as TokenResponse;
}

export interface GoogleUserInfo {
  email: string;
  verified_email?: boolean;
}

export async function fetchGoogleUserInfo(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleUserInfo> {
  const response = await fetchImpl(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo request failed: ${response.status}`);
  }

  return (await response.json()) as GoogleUserInfo;
}
