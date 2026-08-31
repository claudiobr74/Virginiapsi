import { describe, expect, it } from "vitest";
import { googleCalendarRedirectUri } from "@/lib/env/schema";
import { parseGoogleCalendarEnv } from "@/lib/env/server-schema";
import { buildAuthorizationUrl } from "@/lib/integrations/google/oauth";
import { resolveGoogleCalendarOAuthStart } from "@/lib/integrations/google/oauth-start";

const calendarEnvBase = {
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GOOGLE_TOKEN_ENCRYPTION_KEY: "token-encryption-key-placeholder",
};

function authorizationRedirectHostname(redirectUri: string): string {
  const url = new URL(
    buildAuthorizationUrl({
      clientId: "google-client-id",
      redirectUri,
      state: "signed-state",
    }),
  );
  const callback = url.searchParams.get("redirect_uri");
  expect(callback).toBeTruthy();
  return new URL(callback!).hostname;
}

describe("Google Calendar OAuth — callback canônico", () => {
  it("o redirect_uri FINAL de buildAuthorizationUrl é NEXT_PUBLIC_APP_URL/callback", () => {
    const env = parseGoogleCalendarEnv({
      ...calendarEnvBase,
      NEXT_PUBLIC_APP_URL: "https://serena-psi-beta.vercel.app",
      VERCEL_URL: "tesseli-git-cursor-fase-13-ha-153b81.vercel.app",
      GOOGLE_OAUTH_REDIRECT_URI:
        "https://tesseli-git-cursor-fase-13-ha-153b81.vercel.app/api/integrations/google/callback",
    });

    const redirectUri = googleCalendarRedirectUri(env.NEXT_PUBLIC_APP_URL);
    const url = new URL(
      buildAuthorizationUrl({
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri,
        state: "signed-state",
      }),
    );

    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://serena-psi-beta.vercel.app/api/integrations/google/callback",
    );
    expect(authorizationRedirectHostname(redirectUri).toLowerCase()).not.toMatch(
      /tesseli/,
    );
  });

  it("falha se o hostname do callback OAuth contiver tesseli", () => {
    expect(() =>
      googleCalendarRedirectUri("https://tesseli-git-preview.vercel.app"),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);

    expect(() =>
      parseGoogleCalendarEnv({
        ...calendarEnvBase,
        NEXT_PUBLIC_APP_URL: "https://tesseli-qualquer-coisa.vercel.app",
      }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("Preview efêmero não vira callback; usa só o domínio oficial", () => {
    const env = parseGoogleCalendarEnv({
      ...calendarEnvBase,
      NEXT_PUBLIC_APP_URL: "https://dominio-oficial.vercel.app",
    });

    const decision = resolveGoogleCalendarOAuthStart({
      canonicalAppUrl: env.NEXT_PUBLIC_APP_URL,
      requestOrigin: "https://virginiapsi-preview-123.vercel.app",
    });

    expect(decision).toEqual({
      type: "redirect_to_canonical",
      url: "https://dominio-oficial.vercel.app/app/settings?tab=integrations",
    });

    const tesseliPreview = resolveGoogleCalendarOAuthStart({
      canonicalAppUrl: env.NEXT_PUBLIC_APP_URL,
      requestOrigin: "https://tesseli-qualquer-coisa.vercel.app",
    });
    expect(tesseliPreview.type).toBe("redirect_to_canonical");
    if (tesseliPreview.type === "redirect_to_canonical") {
      expect(tesseliPreview.url).not.toMatch(/tesseli/i);
      expect(tesseliPreview.url).not.toContain("virginiapsi-preview-123");
    }

    const onCanonical = resolveGoogleCalendarOAuthStart({
      canonicalAppUrl: env.NEXT_PUBLIC_APP_URL,
      requestOrigin: "https://dominio-oficial.vercel.app",
    });
    expect(onCanonical).toEqual({
      type: "authorize",
      redirectUri:
        "https://dominio-oficial.vercel.app/api/integrations/google/callback",
    });

    if (onCanonical.type === "authorize") {
      const hostname = authorizationRedirectHostname(onCanonical.redirectUri);
      expect(hostname).toBe("dominio-oficial.vercel.app");
      expect(hostname.toLowerCase()).not.toMatch(/tesseli/);
      expect(hostname).not.toBe("virginiapsi-preview-123.vercel.app");
    }
  });
});
