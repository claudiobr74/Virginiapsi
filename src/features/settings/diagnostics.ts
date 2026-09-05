export const INTEGRATION_KEYS = [
  "google",
  "twilio",
  "transcription",
  "gemini",
] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export type IntegrationHealth = "ok" | "attention" | "missing" | "error";

export interface IntegrationStatus {
  key: IntegrationKey;
  label: string;
  configured: boolean;
  health: IntegrationHealth;
  summary: string;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface IntegrationDiagnostics {
  generatedAt: string;
  integrations: IntegrationStatus[];
}

export interface DiagnosticsInput {
  generatedAt?: string;
  google: {
    oauthConfigured: boolean;
    connectionStatus: "connected" | "disconnected" | "error" | null;
    accountEmail: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
  };
  twilio: {
    accountConfigured: boolean;
    senderConfigured: boolean;
    lastError: string | null;
  };
  transcription: {
    groqConfigured: boolean;
  };
  gemini: {
    configured: boolean;
  };
}

const SECRET_LIKE =
  /(sb_secret_|sk-|AIza|AC[0-9a-f]{32}|TWILIO_|GEMINI_API|GROQ_API|CRON_SECRET|GOOGLE_CLIENT_SECRET|TOKEN|Bearer\s)/i;

export function sanitizeDiagnosticText(
  value: string | null | undefined,
  maxLength = 160,
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return null;
  }
  const redacted = SECRET_LIKE.test(trimmed)
    ? "erro registrado (detalhe omitido)"
    : trimmed;
  return redacted.slice(0, maxLength);
}

export function buildIntegrationDiagnostics(
  input: DiagnosticsInput,
): IntegrationDiagnostics {
  const googleHealth: IntegrationHealth = !input.google.oauthConfigured
    ? "missing"
    : input.google.connectionStatus === "connected"
      ? "ok"
      : input.google.connectionStatus === "error"
        ? "error"
        : "attention";

  const twilioHealth: IntegrationHealth = !input.twilio.accountConfigured
    ? "missing"
    : input.twilio.senderConfigured
      ? "ok"
      : "attention";

  const transcriptionHealth: IntegrationHealth = input.transcription.groqConfigured
    ? "ok"
    : "missing";

  const geminiHealth: IntegrationHealth = input.gemini.configured ? "ok" : "missing";

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    integrations: [
      {
        key: "google",
        label: "Google Calendar",
        configured: input.google.oauthConfigured,
        health: googleHealth,
        summary: !input.google.oauthConfigured
          ? "OAuth do Calendar não está provisionado neste ambiente."
          : input.google.connectionStatus === "connected"
            ? `Conectado${input.google.accountEmail ? ` (${input.google.accountEmail})` : ""}.`
            : input.google.connectionStatus === "error"
              ? `Conexão com erro${input.google.accountEmail ? ` (${input.google.accountEmail})` : ""} — reconecte pela Agenda.`
              : "OAuth pronto; o consultório ainda não conectou um calendário.",
        lastSuccessAt: input.google.lastSyncedAt,
        lastError: sanitizeDiagnosticText(input.google.lastError),
      },
      {
        key: "twilio",
        label: "Twilio WhatsApp",
        configured: input.twilio.accountConfigured && input.twilio.senderConfigured,
        health: twilioHealth,
        summary: !input.twilio.accountConfigured
          ? "Conta Twilio não provisionada neste ambiente."
          : input.twilio.senderConfigured
            ? "Conta e remetente prontos para envio."
            : "Conta presente; remetente WhatsApp ainda não provisionado.",
        lastSuccessAt: null,
        lastError: sanitizeDiagnosticText(input.twilio.lastError),
      },
      {
        key: "transcription",
        label: "Transcrição",
        configured: input.transcription.groqConfigured,
        health: transcriptionHealth,
        summary: input.transcription.groqConfigured
          ? "Transcrição em tempo real via Groq configurada neste ambiente."
          : "Chave Groq ausente — a transcrição ao vivo não está disponível neste ambiente.",
        lastSuccessAt: null,
        lastError: null,
      },
      {
        key: "gemini",
        label: "Gemini",
        configured: input.gemini.configured,
        health: geminiHealth,
        summary: input.gemini.configured
          ? "Chave de apoio clínico configurada neste ambiente."
          : "Apoio clínico de IA não provisionado neste ambiente.",
        lastSuccessAt: null,
        lastError: null,
      },
    ],
  };
}

export function diagnosticsLeakSecrets(
  diagnostics: IntegrationDiagnostics,
  forbidden: string[],
): string[] {
  const serialized = JSON.stringify(diagnostics);
  return forbidden.filter((value) => value && serialized.includes(value));
}
