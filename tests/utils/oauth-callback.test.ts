import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { completeAuthCallback, buildOAuthCallbackLog } from "@/features/auth/oauth-callback";
import { BROWSER_PKCE_AUTH_OPTIONS } from "@/features/auth/pkce-flow";
import { readFileSync } from "node:fs";

function callbackRequest(
  url: string,
  headers?: HeadersInit,
): NextRequest {
  return new NextRequest(url, { headers });
}

describe("completeAuthCallback", () => {
  it("code ausente redireciona com erro seguro e não chama exchange", async () => {
    const exchange = vi.fn();
    const logs: Record<string, unknown>[] = [];
    const response = await completeAuthCallback(
      callbackRequest("https://preview.example/auth/callback", {
        "x-forwarded-host": "preview.example",
        "x-forwarded-proto": "https",
      }),
      {
        exchange,
        acceptInvitations: async () => undefined,
        log: (payload) => logs.push(payload),
        randomId: () => "11111111-1111-4111-8111-111111111111",
      },
    );
    expect(exchange).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.example/login?error=auth_callback_failed&diag=11111111-1111-4111-8111-111111111111",
    );
    expect(logs[0]).toMatchObject({
      event: "oauth_callback_missing_code",
      stage: "missing_code",
      hasFlowId: false,
    });
  });

  it("exchange success redireciona para /app na origem pública", async () => {
    const exchange = vi.fn(async () => ({ error: null }));
    const acceptInvitations = vi.fn(async () => undefined);
    const response = await completeAuthCallback(
      callbackRequest("https://internal.example/auth/callback?code=oauth-code-value", {
        "x-forwarded-host": "virginiapsi-git-cursor-transc-137826-claudiobr74-9668s-projects.vercel.app",
        "x-forwarded-proto": "https",
      }),
      {
        exchange,
        acceptInvitations,
        log: () => undefined,
      },
    );
    expect(exchange).toHaveBeenCalledWith({ code: "oauth-code-value" });
    expect(acceptInvitations).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://virginiapsi-git-cursor-transc-137826-claudiobr74-9668s-projects.vercel.app/app",
    );
  });

  it("exchange failure registra metadata segura e correlationId", async () => {
    const logs: Record<string, unknown>[] = [];
    const response = await completeAuthCallback(
      callbackRequest("https://preview.example/auth/callback?code=oauth-code-value", {
        "x-forwarded-host": "preview.example",
        cookie: "sb-ref-auth-token-code-verifier=pkce-secret-verifier",
      }),
      {
        exchange: async () => ({
          error: { name: "AuthApiError", code: "flow_state_not_found", status: 400 },
        }),
        acceptInvitations: async () => undefined,
        log: (payload) => logs.push(payload),
        randomId: () => "diag-id-0000000001",
      },
    );
    expect(response.headers.get("location")).toContain("diag=diag-id-0000000001");
    expect(logs[0]).toMatchObject({
      event: "oauth_callback_exchange_failed",
      stage: "exchange_failed",
      authErrorCode: "flow_state_not_found",
      authErrorStatus: 400,
      authErrorName: "AuthApiError",
      hasPkceCookie: true,
      correlationId: "diag-id-0000000001",
    });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("oauth-code-value");
    expect(serialized).not.toContain("pkce-secret-verifier");
  });

  it("sb_flow_id presente é passado ao exchange", async () => {
    const exchange = vi.fn(async () => ({ error: null }));
    await completeAuthCallback(
      callbackRequest(
        "https://preview.example/auth/callback?code=oauth-code-value&sb_flow_id=flow-abc-123",
      ),
      {
        exchange,
        acceptInvitations: async () => undefined,
        log: () => undefined,
      },
    );
    expect(exchange).toHaveBeenCalledWith({
      code: "oauth-code-value",
      flowId: "flow-abc-123",
    });
  });

  it("x-forwarded-host define o redirect público quando o request.url é outro host", async () => {
    const response = await completeAuthCallback(
      callbackRequest(
        "https://virginiapsi-4ms01cksf-claudiobr74-9668s-projects.vercel.app/auth/callback?code=oauth-code-value",
        {
          "x-forwarded-host":
            "virginiapsi-git-cursor-transc-137826-claudiobr74-9668s-projects.vercel.app",
          "x-forwarded-proto": "https",
        },
      ),
      {
        exchange: async () => ({ error: null }),
        acceptInvitations: async () => undefined,
        log: () => undefined,
      },
    );
    expect(response.headers.get("location")).toBe(
      "https://virginiapsi-git-cursor-transc-137826-claudiobr74-9668s-projects.vercel.app/app",
    );
  });

  it("nenhum code, verifier ou token entra no payload de log", () => {
    const payload = buildOAuthCallbackLog({
      event: "oauth_callback_exchange_failed",
      correlationId: "cid-12345678",
      stage: "exchange_failed",
      hostname: "preview.example",
      forwardedHost: "preview.example",
      hostMismatch: false,
      hasFlowId: true,
      hasPkceCookie: true,
      authError: { name: "AuthApiError", code: "flow_state_not_found", status: 400 },
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/access_token|refresh_token|authorization/i);
    expect(serialized).not.toContain("oauth-code");
    expect(Object.keys(payload).sort()).toEqual(
      [
        "authErrorCode",
        "authErrorName",
        "authErrorStatus",
        "correlationId",
        "event",
        "forwardedHost",
        "hasFlowId",
        "hasPkceCookie",
        "hostMismatch",
        "hostname",
        "stage",
      ].sort(),
    );
  });
});

describe("browser PKCE options", () => {
  it("habilita appendPkceFlowIdToRedirects na versão instalada", () => {
    expect(BROWSER_PKCE_AUTH_OPTIONS.experimental.appendPkceFlowIdToRedirects).toBe(true);
    const source = readFileSync("src/lib/supabase/browser.ts", "utf8");
    expect(source).toContain("BROWSER_PKCE_AUTH_OPTIONS");
  });
});
