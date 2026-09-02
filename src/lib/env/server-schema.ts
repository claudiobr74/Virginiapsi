// No "server-only" guard here on purpose: this module is exercised directly
// by unit tests (which run under plain Node/Vitest, where the "server-only"
// package always throws). Application code must import the schema/parser
// through `src/lib/env/server.ts`, which re-exports this module behind the
// "server-only" guard so accidental client-component imports fail loudly.
import { z } from "zod";
import {
  coalesceAppUrl,
  formatEnvIssues,
  googleCalendarRedirectUri,
  publicEnvSchema,
} from "@/lib/env/schema";

const nonEmpty = z.string().trim().min(1);
const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  nonEmpty.optional(),
);

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: nonEmpty.startsWith("sb_secret_"),
  GOOGLE_CLIENT_ID: nonEmpty,
  GOOGLE_CLIENT_SECRET: nonEmpty,
  GOOGLE_TOKEN_ENCRYPTION_KEY: nonEmpty,
  SESSION_CAPTURE_SECRET: nonEmpty,
  TWILIO_ACCOUNT_SID: nonEmpty,
  TWILIO_AUTH_TOKEN: nonEmpty,
  // Sender *or* Messaging Service — required only at send time.
  TWILIO_WHATSAPP_FROM: optionalNonEmpty,
  TWILIO_MESSAGING_SERVICE_SID: optionalNonEmpty,
  // Optional at boot so Agenda/Settings still load if Groq is not provisioned.
  // Live transcription reads the isolated `groqTranscriptionEnvSchema` instead.
  GROQ_API_KEY: nonEmpty.optional(),
  GROQ_TRANSCRIPTION_MODEL: optionalNonEmpty,
  GROQ_TRANSCRIPTION_TIMEOUT_MS: optionalNonEmpty,
  GEMINI_API_KEY: nonEmpty,
  GEMINI_MODEL_SESSION: nonEmpty,
  GEMINI_MODEL_SUPERVISOR: nonEmpty,
  GEMINI_MODEL_KNOWLEDGE: nonEmpty,
  GEMINI_MODEL_DOCUMENTS: optionalNonEmpty,
  GEMINI_EMBEDDING_MODEL: nonEmpty,
  CRON_SECRET: nonEmpty,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Agenda/Calendar OAuth — independent from Twilio, Gemini and Cron. */
export const googleCalendarEnvSchema = publicEnvSchema
  .pick({ NEXT_PUBLIC_APP_URL: true })
  .extend({
    GOOGLE_CLIENT_ID: nonEmpty,
    GOOGLE_CLIENT_SECRET: nonEmpty,
    GOOGLE_TOKEN_ENCRYPTION_KEY: nonEmpty,
  });

export type GoogleCalendarEnv = z.infer<typeof googleCalendarEnvSchema>;

/** Storage/admin client — independent from Google, Twilio, Gemini and Cron. */
export const supabaseAdminEnvSchema = publicEnvSchema
  .pick({ NEXT_PUBLIC_SUPABASE_URL: true })
  .extend({
    SUPABASE_SECRET_KEY: nonEmpty.startsWith("sb_secret_"),
  });

export type SupabaseAdminEnv = z.infer<typeof supabaseAdminEnvSchema>;

/** Capture grant signing/verification — independent from Twilio, Google, Gemini and Cron. */
export const sessionCaptureEnvSchema = z.object({
  SESSION_CAPTURE_SECRET: nonEmpty,
});

export type SessionCaptureEnv = z.infer<typeof sessionCaptureEnvSchema>;

/** Groq Speech-to-Text — independent from Twilio, Google, Gemini and Cron. */
export const groqTranscriptionEnvSchema = z.object({
  GROQ_API_KEY: nonEmpty,
  GROQ_TRANSCRIPTION_MODEL: optionalNonEmpty,
  GROQ_TRANSCRIPTION_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).optional(),
});

export type GroqTranscriptionEnv = z.infer<typeof groqTranscriptionEnvSchema>;

/** Session AI (DPEP/live/preparation) — independent from Twilio, Calendar, Groq and Cron. */
export const sessionAiEnvSchema = z.object({
  GEMINI_API_KEY: nonEmpty,
  GEMINI_MODEL_SESSION: nonEmpty,
});

export type SessionAiEnv = z.infer<typeof sessionAiEnvSchema>;

export const SERVER_ONLY_ENV_KEYS = [
  "SUPABASE_SECRET_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "SESSION_CAPTURE_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "GROQ_API_KEY",
  "GROQ_TRANSCRIPTION_MODEL",
  "GROQ_TRANSCRIPTION_TIMEOUT_MS",
  "GEMINI_API_KEY",
  "GEMINI_MODEL_SESSION",
  "GEMINI_MODEL_SUPERVISOR",
  "GEMINI_MODEL_KNOWLEDGE",
  "GEMINI_MODEL_DOCUMENTS",
  "GEMINI_EMBEDDING_MODEL",
  "CRON_SECRET",
] as const;

type EnvSource = Record<string, string | undefined>;

function readServerEnvFromProcess(): EnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
    SESSION_CAPTURE_SECRET: process.env.SESSION_CAPTURE_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_TRANSCRIPTION_MODEL: process.env.GROQ_TRANSCRIPTION_MODEL,
    GROQ_TRANSCRIPTION_TIMEOUT_MS: process.env.GROQ_TRANSCRIPTION_TIMEOUT_MS,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL_SESSION: process.env.GEMINI_MODEL_SESSION,
    GEMINI_MODEL_SUPERVISOR: process.env.GEMINI_MODEL_SUPERVISOR,
    GEMINI_MODEL_KNOWLEDGE: process.env.GEMINI_MODEL_KNOWLEDGE,
    GEMINI_MODEL_DOCUMENTS: process.env.GEMINI_MODEL_DOCUMENTS,
    GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL,
    CRON_SECRET: process.env.CRON_SECRET,
  };
}

export function parseServerEnv(
  source: EnvSource = readServerEnvFromProcess(),
): ServerEnv {
  const appUrl = coalesceAppUrl(source.NEXT_PUBLIC_APP_URL, source.VERCEL_URL);
  const parsed = serverEnvSchema.safeParse({
    ...source,
    NEXT_PUBLIC_APP_URL: appUrl,
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}

function canonicalCalendarAppUrl(source: EnvSource): string | undefined {
  const raw = source.NEXT_PUBLIC_APP_URL;
  if (typeof raw !== "string" || raw.trim() === "") {
    return undefined;
  }
  return raw;
}

export function parseSupabaseAdminEnv(
  source: EnvSource = readServerEnvFromProcess(),
): SupabaseAdminEnv {
  const parsed = supabaseAdminEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY,
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}

export function parseGoogleCalendarEnv(
  source: EnvSource = readServerEnvFromProcess(),
): GoogleCalendarEnv {
  const parsed = googleCalendarEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: canonicalCalendarAppUrl(source),
    GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
    GOOGLE_TOKEN_ENCRYPTION_KEY: source.GOOGLE_TOKEN_ENCRYPTION_KEY,
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  // Validates the callback can be derived and never uses a tesseli hostname.
  googleCalendarRedirectUri(parsed.data.NEXT_PUBLIC_APP_URL);
  return parsed.data;
}

export function parseSessionCaptureEnv(
  source: EnvSource = readServerEnvFromProcess(),
): SessionCaptureEnv {
  const parsed = sessionCaptureEnvSchema.safeParse({
    SESSION_CAPTURE_SECRET: source.SESSION_CAPTURE_SECRET,
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}

export function parseGroqTranscriptionEnv(
  source: EnvSource = readServerEnvFromProcess(),
): GroqTranscriptionEnv {
  const parsed = groqTranscriptionEnvSchema.safeParse({
    GROQ_API_KEY: source.GROQ_API_KEY,
    GROQ_TRANSCRIPTION_MODEL: source.GROQ_TRANSCRIPTION_MODEL,
    GROQ_TRANSCRIPTION_TIMEOUT_MS: source.GROQ_TRANSCRIPTION_TIMEOUT_MS,
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}

export function parseSessionAiEnv(
  source: EnvSource = readServerEnvFromProcess(),
): SessionAiEnv {
  const parsed = sessionAiEnvSchema.safeParse({
    GEMINI_API_KEY: source.GEMINI_API_KEY,
    GEMINI_MODEL_SESSION: source.GEMINI_MODEL_SESSION,
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}

function presentEnvValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Presence flags for Settings diagnostics — never throws, never logs values. */
export function readIntegrationEnvFlags(
  source: EnvSource = readServerEnvFromProcess(),
) {
  return {
    googleOAuth:
      presentEnvValue(source.GOOGLE_CLIENT_ID) &&
      presentEnvValue(source.GOOGLE_CLIENT_SECRET),
    twilioAccount:
      presentEnvValue(source.TWILIO_ACCOUNT_SID) &&
      presentEnvValue(source.TWILIO_AUTH_TOKEN),
    twilioSender:
      presentEnvValue(source.TWILIO_WHATSAPP_FROM) ||
      presentEnvValue(source.TWILIO_MESSAGING_SERVICE_SID),
    groq: presentEnvValue(source.GROQ_API_KEY),
    gemini: presentEnvValue(source.GEMINI_API_KEY),
  };
}
