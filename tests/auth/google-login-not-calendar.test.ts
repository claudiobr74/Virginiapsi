import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GOOGLE_SIGNIN_QUERY_PARAMS, oauthCallbackRedirectTo } from "@/features/auth/oauth-redirect";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/integrations/google/oauth";

const ROOT = path.resolve(__dirname, "../..");

describe("login Google ≠ Google Agenda", () => {
  it("o login só pede seletor de conta, sem scopes de Calendar", () => {
    expect(GOOGLE_SIGNIN_QUERY_PARAMS).toEqual({ prompt: "select_account" });
    expect("scope" in GOOGLE_SIGNIN_QUERY_PARAMS).toBe(false);
  });

  it("o callback de login aponta para /auth/callback, não para a Agenda", () => {
    expect(oauthCallbackRedirectTo("https://virginiapsi.example")).toBe(
      "https://virginiapsi.example/auth/callback",
    );
    expect(oauthCallbackRedirectTo("https://virginiapsi.example")).not.toMatch(
      /integrations\/google/,
    );
  });

  it("o botão de login não importa scopes nem o client da Agenda", () => {
    const source = readFileSync(
      path.join(ROOT, "src/features/auth/components/google-auth-button.tsx"),
      "utf8",
    );
    expect(source).toContain("signInWithOAuth");
    expect(source).not.toContain("GOOGLE_CALENDAR_SCOPES");
    expect(source).not.toContain("completeGoogleConnection");
    expect(source).not.toContain("google_calendar_connections");
    expect(GOOGLE_CALENDAR_SCOPES.join(" ")).toMatch(/calendar/);
  });

  it("o callback de Auth não persiste tokens da Agenda", () => {
    const source = readFileSync(path.join(ROOT, "src/app/auth/callback/route.ts"), "utf8");
    expect(source).toContain("exchangeCodeForSession");
    expect(source).not.toContain("completeGoogleConnection");
    expect(source).not.toContain("google_calendar");
  });

  it("GET /api/integrations/google/connect é alias de /start", () => {
    const source = readFileSync(
      path.join(ROOT, "src/app/api/integrations/google/connect/route.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+\{\s*GET\s*\}\s+from\s+["']\.\.\/start\/route["']/);
  });
});
