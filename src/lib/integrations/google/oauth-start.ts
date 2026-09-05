import {
  googleCalendarRedirectUri,
  httpOriginOf,
  isLoopbackHttpUrl,
} from "@/lib/env/schema";

export type GoogleCalendarOAuthStartDecision =
  | { type: "authorize"; redirectUri: string }
  | { type: "redirect_to_canonical"; url: string }
  | { type: "reject_loopback" };

export function requestOriginFromHeaders(headerList: {
  get(name: string): string | null;
}): string | null {
  const hostHeader = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!hostHeader) {
    return null;
  }
  const host = hostHeader.split(",")[0]?.trim();
  if (!host) {
    return null;
  }
  const protoHeader = headerList.get("x-forwarded-proto");
  const proto =
    protoHeader?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Calendar OAuth always uses the canonical NEXT_PUBLIC_APP_URL callback.
 * Preview/ephemeral hosts never become the Google redirect_uri. When a flow
 * starts on another host, hand it to the canonical *start route* so the
 * signed OAuth state is preserved; never bounce to a protected app page,
 * because Supabase session cookies are host-scoped.
 */
export function resolveGoogleCalendarOAuthStart(input: {
  canonicalAppUrl: string;
  requestOrigin: string;
}): GoogleCalendarOAuthStartDecision {
  const redirectUri = googleCalendarRedirectUri(input.canonicalAppUrl);
  const canonicalOrigin = httpOriginOf(input.canonicalAppUrl);
  const requestOrigin = httpOriginOf(input.requestOrigin);

  if (!canonicalOrigin) {
    return { type: "reject_loopback" };
  }

  if (isLoopbackHttpUrl(redirectUri) && requestOrigin && !isLoopbackHttpUrl(requestOrigin)) {
    return { type: "reject_loopback" };
  }

  if (requestOrigin && canonicalOrigin !== requestOrigin) {
    return {
      type: "redirect_to_canonical",
      url: `${canonicalOrigin}/api/integrations/google/start`,
    };
  }

  return { type: "authorize", redirectUri };
}
