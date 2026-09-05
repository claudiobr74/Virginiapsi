import { describe, expect, it } from "vitest";
import {
  CAPTURE_GRANT_FALLBACK_MESSAGE,
  messageFromCaptureGrantBody,
  readCaptureGrantErrorMessage,
} from "@/features/sessions/transcription/grant-error-message";

describe("mensagem de erro do capture grant", () => {
  it("usa a message do JSON quando existe", async () => {
    const response = new Response(
      JSON.stringify({
        error: "consent_missing",
        message: "Consentimento não registrado para este paciente.",
      }),
      { status: 403 },
    );
    await expect(readCaptureGrantErrorMessage(response)).resolves.toBe(
      "Consentimento não registrado para este paciente.",
    );
  });

  it("cai no fallback quando o JSON é inválido", async () => {
    const response = new Response("<html>nope</html>", { status: 500 });
    await expect(readCaptureGrantErrorMessage(response)).resolves.toBe(
      CAPTURE_GRANT_FALLBACK_MESSAGE,
    );
  });

  it("cai no fallback quando message está vazia", () => {
    expect(messageFromCaptureGrantBody({ error: "capture_grant_failed", message: "  " })).toBeNull();
    expect(CAPTURE_GRANT_FALLBACK_MESSAGE).toBe(
      "Não foi possível autorizar a transcrição agora.",
    );
  });
});
