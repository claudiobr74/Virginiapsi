import { describe, expect, it } from "vitest";
import {
  googleOAuthCallbackMessage,
  googleOAuthReturnPath,
  parseGoogleOAuthReturnTo,
} from "@/features/calendar/oauth-callback";

describe("parseGoogleOAuthReturnTo", () => {
  it("só aceita a superfície da whitelist", () => {
    expect(parseGoogleOAuthReturnTo("settings")).toBe("settings");
    expect(parseGoogleOAuthReturnTo("agenda")).toBe("agenda");
    expect(parseGoogleOAuthReturnTo("https://evil.example")).toBe("agenda");
    expect(parseGoogleOAuthReturnTo(undefined)).toBe("agenda");
  });
});

describe("googleOAuthReturnPath", () => {
  it("devolve Configurações na aba Integrações quando a conexão começou lá", () => {
    expect(googleOAuthReturnPath("settings", "connected")).toBe(
      "/app/settings?tab=integrations&google=connected",
    );
    expect(googleOAuthReturnPath("settings", "error", "token_exchange_failed")).toBe(
      "/app/settings?tab=integrations&google=error&google_detail=token_exchange_failed",
    );
  });

  it("devolve a Agenda por padrão", () => {
    expect(googleOAuthReturnPath("agenda", "connected")).toBe(
      "/app/agenda?google=connected",
    );
  });
});

describe("googleOAuthCallbackMessage", () => {
  it("não culpa o URI de retorno em falha de troca de token", () => {
    expect(googleOAuthCallbackMessage("error", "token_exchange_failed")).toMatch(
      /Client ID/,
    );
    expect(googleOAuthCallbackMessage("error", "token_exchange_failed")).not.toMatch(
      /localhost/,
    );
  });

  it("explica mismatch de usuário", () => {
    expect(googleOAuthCallbackMessage("error", "state_user_mismatch")).toMatch(
      /mesma que iniciou/,
    );
  });

  it("confirma sucesso", () => {
    expect(googleOAuthCallbackMessage("connected", undefined)).toMatch(/sucesso/);
  });
});
