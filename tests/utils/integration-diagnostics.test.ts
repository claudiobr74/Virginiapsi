import { describe, expect, it } from "vitest";
import {
  buildIntegrationDiagnostics,
  diagnosticsLeakSecrets,
} from "@/features/settings/diagnostics";

describe("diagnósticos de integração", () => {
  it("não inclui nomes nem valores de secrets no DTO", () => {
    const diagnostics = buildIntegrationDiagnostics({
      google: {
        oauthConfigured: true,
        connectionStatus: "error",
        accountEmail: "agenda@consultorio.test",
        lastSyncedAt: "2026-08-20T10:00:00.000Z",
        lastError: "Bearer ya29.secret-refresh-token falhou",
      },
      twilio: {
        accountConfigured: true,
        senderConfigured: false,
        lastError: "TWILIO_AUTH_TOKEN rejected AC00000000000000000000000000000000",
      },
      transcription: { localDefault: true, fallbackConfigured: false },
      gemini: { configured: true },
    });

    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toMatch(/TWILIO_AUTH_TOKEN/);
    expect(serialized).not.toMatch(/GEMINI_API_KEY/);
    expect(serialized).not.toMatch(/GROQ_API_KEY/);
    expect(serialized).not.toMatch(/CRON_SECRET/);
    expect(serialized).not.toMatch(/sb_secret_/);
    expect(serialized).not.toMatch(/ya29\./);
    expect(serialized).not.toMatch(/AC00000000000000000000000000000000/);

    const twilio = diagnostics.integrations.find((item) => item.key === "twilio");
    expect(twilio?.configured).toBe(false);
    expect(twilio?.health).toBe("attention");
    expect(twilio?.summary).toMatch(/remetente/i);
    expect(twilio?.lastError).toBe("erro registrado (detalhe omitido)");

    const google = diagnostics.integrations.find((item) => item.key === "google");
    expect(google?.lastError).toBe("erro registrado (detalhe omitido)");
    expect(google?.summary).toContain("agenda@consultorio.test");

    expect(
      diagnosticsLeakSecrets(diagnostics, [
        "TWILIO_AUTH_TOKEN",
        "sb_secret_ci_placeholder",
        "ya29.secret-refresh-token",
      ]),
    ).toEqual([]);
  });
});
