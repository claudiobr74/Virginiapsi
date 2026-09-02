import { describe, expect, it } from "vitest";
import {
  AUTH_CALLBACK_FAILED,
  AUTH_GENERIC_ERROR,
  GOOGLE_AUTH_REDIRECT_DENIED,
  GOOGLE_AUTH_UNAVAILABLE,
  toAuthQueryErrorMessage,
  toGoogleAuthErrorMessage,
} from "@/features/auth/messages";

describe("toGoogleAuthErrorMessage", () => {
  it("mapeia provider desligado", () => {
    expect(toGoogleAuthErrorMessage("Provider google is not enabled")).toBe(
      GOOGLE_AUTH_UNAVAILABLE,
    );
    expect(toGoogleAuthErrorMessage("provider is not enabled")).toBe(
      GOOGLE_AUTH_UNAVAILABLE,
    );
    expect(toGoogleAuthErrorMessage("Unsupported provider")).toBe(
      GOOGLE_AUTH_UNAVAILABLE,
    );
  });

  it("mapeia redirect recusado pelo allow list", () => {
    expect(
      toGoogleAuthErrorMessage("Redirect URL not allowed on the allow list"),
    ).toBe(GOOGLE_AUTH_REDIRECT_DENIED);
  });

  it("não ecoa a mensagem bruta do provedor", () => {
    expect(toGoogleAuthErrorMessage("secret internals xyz")).toBe(
      AUTH_GENERIC_ERROR,
    );
  });
});

describe("toAuthQueryErrorMessage", () => {
  it("explica falha do callback OAuth sem culpar o Google Cloud", () => {
    expect(toAuthQueryErrorMessage("auth_callback_failed")).toBe(
      AUTH_CALLBACK_FAILED,
    );
    expect(toAuthQueryErrorMessage("auth_callback_failed")).not.toMatch(/Google Cloud/i);
    expect(
      toAuthQueryErrorMessage("auth_callback_failed", "abcde123-diag-01"),
    ).toBe(`${AUTH_CALLBACK_FAILED} Código de diagnóstico: abcde123-diag-01`);
  });

  it("ignora diagnóstico inseguro na query", () => {
    expect(
      toAuthQueryErrorMessage("auth_callback_failed", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aa.bb"),
    ).toBe(AUTH_CALLBACK_FAILED);
  });

  it("ignora ausência de código", () => {
    expect(toAuthQueryErrorMessage(null)).toBeNull();
  });
});
