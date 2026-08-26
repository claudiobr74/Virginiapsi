import { describe, expect, it } from "vitest";
import {
  GOOGLE_SIGNIN_QUERY_PARAMS,
  oauthCallbackRedirectTo,
  oauthCodeCallbackPath,
} from "@/features/auth/oauth-redirect";

describe("oauthCallbackRedirectTo", () => {
  it("aponta só para /auth/callback, sem query", () => {
    expect(oauthCallbackRedirectTo("https://preview.vercel.app")).toBe(
      "https://preview.vercel.app/auth/callback",
    );
    expect(oauthCallbackRedirectTo("https://preview.vercel.app/")).toBe(
      "https://preview.vercel.app/auth/callback",
    );
  });
});

describe("GOOGLE_SIGNIN_QUERY_PARAMS", () => {
  it("pede o seletor de contas do Google", () => {
    expect(GOOGLE_SIGNIN_QUERY_PARAMS.prompt).toBe("select_account");
  });
});

describe("oauthCodeCallbackPath", () => {
  it("encaminha code que caiu na raiz (Site URL sem path)", () => {
    expect(oauthCodeCallbackPath({ code: "abc-123" })).toBe(
      "/auth/callback?code=abc-123",
    );
  });

  it("preserva next interno seguro", () => {
    expect(
      oauthCodeCallbackPath({ code: "abc-123", next: "/app/agenda" }),
    ).toBe("/auth/callback?code=abc-123&next=%2Fapp%2Fagenda");
  });

  it("ignora next aberto", () => {
    expect(
      oauthCodeCallbackPath({ code: "abc-123", next: "//evil.example" }),
    ).toBe("/auth/callback?code=abc-123");
  });

  it("não encaminha sem code", () => {
    expect(oauthCodeCallbackPath({})).toBeNull();
    expect(oauthCodeCallbackPath({ next: "/app" })).toBeNull();
  });
});
