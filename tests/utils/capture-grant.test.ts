import { describe, expect, it } from "vitest";
import {
  CAPTURE_GRANT_TTL_MS,
  signCaptureGrant,
  verifyCaptureGrant,
} from "@/lib/consent/capture-grant";

const SECRET = "capture-grant-secret";
const SCOPE = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  sessionId: "33333333-3333-4333-8333-333333333333",
  capability: "session_capture_grant" as const,
};

function issue(
  overrides: Partial<{
    organizationId: string;
    sessionId: string;
    capability: "session_capture_grant" | "session_remote_transcription_grant" | "audio_fallback_upload_grant";
  }> = {},
  now?: number,
) {
  return signCaptureGrant(
    { ...SCOPE, ...overrides, patientId: "22222222-2222-4222-8222-222222222222" },
    SECRET,
    now,
  );
}

describe("signCaptureGrant / verifyCaptureGrant", () => {
  it("emite um grant válido para o escopo esperado", () => {
    const token = issue();
    const result = verifyCaptureGrant(token, SECRET, SCOPE);
    expect(result.valid).toBe(true);
    expect(result.payload?.organizationId).toBe(SCOPE.organizationId);
    expect(result.payload?.sessionId).toBe(SCOPE.sessionId);
  });

  it("cada grant tem um nonce novo, mesmo para o mesmo escopo", () => {
    const first = issue();
    const second = issue();
    expect(first).not.toBe(second);
  });

  it("rejeita assinatura adulterada", () => {
    const token = issue();
    const result = verifyCaptureGrant(token, "chave-errada", SCOPE);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejeita payload alterado sem re-assinar", () => {
    const token = issue();
    const [, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...SCOPE,
        patientId: "forjado",
        nonce: "x",
        issuedAt: Date.now(),
        expiresAt: Date.now() + CAPTURE_GRANT_TTL_MS,
      }),
      "utf8",
    ).toString("base64url");

    const result = verifyCaptureGrant(`${tamperedPayload}.${signature}`, SECRET, SCOPE);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejeita grant expirado", () => {
    const issuedAt = Date.now() - CAPTURE_GRANT_TTL_MS - 1000;
    const token = issue({}, issuedAt);
    const result = verifyCaptureGrant(token, SECRET, SCOPE, Date.now());
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("aceita um grant perto de expirar, mas ainda dentro do TTL", () => {
    const issuedAt = Date.now() - CAPTURE_GRANT_TTL_MS + 1000;
    const token = issue({}, issuedAt);
    const result = verifyCaptureGrant(token, SECRET, SCOPE, Date.now());
    expect(result.valid).toBe(true);
  });

  it("rejeita grant emitido para outra sessão", () => {
    const token = issue();
    const result = verifyCaptureGrant(token, SECRET, {
      ...SCOPE,
      sessionId: "99999999-9999-4999-8999-999999999999",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("scope_mismatch");
  });

  it("rejeita grant emitido para outra organização", () => {
    const token = issue();
    const result = verifyCaptureGrant(token, SECRET, {
      ...SCOPE,
      organizationId: "99999999-9999-4999-8999-999999999999",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("scope_mismatch");
  });

  it("um grant de session_capture_grant não serve para session_remote_transcription_grant", () => {
    const token = issue();
    const result = verifyCaptureGrant(token, SECRET, {
      ...SCOPE,
      capability: "session_remote_transcription_grant",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("scope_mismatch");
  });

  it("um grant remoto não serve para audio_fallback_upload_grant", () => {
    const token = issue({ capability: "session_remote_transcription_grant" });
    const result = verifyCaptureGrant(token, SECRET, {
      ...SCOPE,
      capability: "audio_fallback_upload_grant",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("scope_mismatch");
  });

  it("um grant de session_capture_grant não serve para audio_fallback_upload_grant", () => {
    const token = issue();
    const result = verifyCaptureGrant(token, SECRET, {
      ...SCOPE,
      capability: "audio_fallback_upload_grant",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("scope_mismatch");
  });

  it("rejeita token malformado", () => {
    expect(verifyCaptureGrant("not-a-real-token", SECRET, SCOPE).valid).toBe(false);
    expect(verifyCaptureGrant("", SECRET, SCOPE).valid).toBe(false);
  });
});
