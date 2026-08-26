import { describe, expect, it } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  GOOGLE_CALENDAR_SCOPES,
  refreshAccessToken,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/integrations/google/oauth";
import { mockFetch } from "./support/mock-fetch";

const SECRET = "state-signing-secret";

describe("signOAuthState / verifyOAuthState", () => {
  const payload = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    nonce: "nonce-abc",
    issuedAt: Date.now(),
  };

  it("assina e verifica um state legítimo", () => {
    const state = signOAuthState(payload, SECRET);
    const result = verifyOAuthState(state, SECRET, payload.issuedAt + 1000);
    expect(result.valid).toBe(true);
    expect(result.payload).toEqual(payload);
  });

  it("rejeita um state assinado com outra chave (adulteração)", () => {
    const state = signOAuthState(payload, SECRET);
    const result = verifyOAuthState(state, "outra-chave");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejeita payload alterado sem re-assinar", () => {
    const state = signOAuthState(payload, SECRET);
    const [, signature] = state.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...payload, organizationId: "forjado" }),
      "utf8",
    ).toString("base64url");
    const forgedState = `${tamperedPayload}.${signature}`;

    expect(forgedState).not.toBe(state);
    const result = verifyOAuthState(forgedState, SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejeita state expirado", () => {
    const state = signOAuthState(payload, SECRET);
    const farFuture = payload.issuedAt + 60 * 60 * 1000;
    const result = verifyOAuthState(state, SECRET, farFuture);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("rejeita um state malformado", () => {
    expect(verifyOAuthState("not-a-real-state", SECRET).valid).toBe(false);
    expect(verifyOAuthState("", SECRET).valid).toBe(false);
  });

  it("cada chamada gera uma assinatura ligada ao payload exato", () => {
    const stateA = signOAuthState(payload, SECRET);
    const stateB = signOAuthState({ ...payload, nonce: "outro-nonce" }, SECRET);
    expect(stateA).not.toBe(stateB);
  });
});

describe("buildAuthorizationUrl", () => {
  it("inclui offline access, escopos mínimos do Calendar e o state assinado", () => {
    const url = new URL(
      buildAuthorizationUrl({
        clientId: "client-id-123",
        redirectUri: "https://app.example.com/api/integrations/google/callback",
        state: "signed-state-value",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id-123");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("signed-state-value");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPES.join(" "));
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/integrations/google/callback",
    );
  });
});

describe("exchangeCodeForTokens", () => {
  it("faz POST no endpoint de token com grant_type=authorization_code", async () => {
    const fetchImpl = mockFetch(async () =>
      new Response(
        JSON.stringify({
          access_token: "access-123",
          expires_in: 3600,
          refresh_token: "refresh-123",
          scope: "calendar",
          token_type: "Bearer",
        }),
        { status: 200 },
      ),
    );

    const result = await exchangeCodeForTokens({
      code: "auth-code",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://app.example.com/callback",
      fetchImpl,
    });

    expect(result.access_token).toBe("access-123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
  });

  it("lança erro quando a troca de código falha", async () => {
    const fetchImpl = mockFetch(
      async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );

    await expect(
      exchangeCodeForTokens({
        code: "bad-code",
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://app.example.com/callback",
        fetchImpl,
      }),
    ).rejects.toThrow(/token exchange failed/i);
  });
});

describe("refreshAccessToken", () => {
  it("faz POST com grant_type=refresh_token", async () => {
    const fetchImpl = mockFetch(async () =>
      new Response(
        JSON.stringify({
          access_token: "new-access",
          expires_in: 3600,
          scope: "calendar",
          token_type: "Bearer",
        }),
        { status: 200 },
      ),
    );

    const result = await refreshAccessToken({
      refreshToken: "refresh-abc",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl,
    });

    expect(result.access_token).toBe("new-access");
    const [, init] = fetchImpl.mock.calls[0];
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-abc");
  });
});

describe("fetchGoogleUserInfo", () => {
  it("envia o access token como Bearer e retorna o e-mail", async () => {
    const fetchImpl = mockFetch(async () =>
      new Response(JSON.stringify({ email: "consultorio@example.com" }), { status: 200 }),
    );

    const result = await fetchGoogleUserInfo("access-token-xyz", fetchImpl);

    expect(result.email).toBe("consultorio@example.com");
    const [, init] = fetchImpl.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-token-xyz",
    );
  });
});
