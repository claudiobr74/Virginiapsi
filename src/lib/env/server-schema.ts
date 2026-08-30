// No "server-only" guard here on purpose: this module is exercised directly
// by unit tests (which run under plain Node/Vitest, where the "server-only"
// package always throws). Application code must import the schema/parser
// through `src/lib/env/server.ts`, which re-exports this module behind the
// "server-only" guard so accidental client-component imports fail loudly.
import { z } from "zod";
import {
  coalesceAppUrl,
  formatEnvIssues,
  normalizeGoogleOAuthRedirectUri,
  publicEnvSchema,
  resolveGoogleCalendarRedirectUri,
} from "@/lib/env/schema";

const nonEmpty = z.string().trim().min(1);
const httpUrl = z.string().trim().url();
const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  nonEmpty.optional(),
);

const booleanFromEnv = z.preprocess((value) => {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0" || value === "" || value == null) {
    return false;
  }
  return value;
}, z.boolean());

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: nonEmpty.startsWith("sb_secret_"),
  GOOGLE_CLIENT_ID: nonEmpty,
  GOOGLE_CLIENT_SECRET: nonEmpty,
  GOOGLE_OAUTH_REDIRECT_URI: z.preprocess(normalizeGoogleOAuthRedirectUri, httpUrl),
  GOOGLE_TOKEN_ENCRYPTION_KEY: nonEmpty,
  SESSION_CAPTURE_SECRET: nonEmpty,
  // WhatsApp is optional. Default off — credentials are required only when enabled.
  TWILIO_ENABLED: booleanFromEnv.default(false),
  TWILIO_ACCOUNT_SID: optionalNonEmpty,
  TWILIO_AUTH_TOKEN: optionalNonEmpty,
  // Sender *or* Messaging Service — required only at send time.
  TWILIO_WHATSAPP_FROM: optionalNonEmpty,
  TWILIO_MESSAGING_SERVICE_SID: optionalNonEmpty,
  // Optional on purpose: transcription runs on-device by default, so the app
  // is fully functional without a transcription provider. This key only exists
  // for organizations that enable the fallback
  // (docs/22-transcription-provider-decision.md).
  GROQ_API_KEY: nonEmpty.optional(),
  GEMINI_API_KEY: nonEmpty,
  GEMINI_MODEL_SESSION: nonEmpty,
  GEMINI_MODEL_SUPERVISOR: nonEmpty,
  GEMINI_MODEL_KNOWLEDGE: nonEmpty,
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
    GOOGLE_OAUTH_REDIRECT_URI: z.preprocess(
      normalizeGoogleOAuthRedirectUri,
      httpUrl,
    ),
    GOOGLE_TOKEN_ENCRYPTION_KEY: nonEmpty,
  });

export type GoogleCalendarEnv = z.infer<typeof googleCalendarEnvSchema>;

export const SERVER_ONLY_ENV_KEYS = [
  "SUPABASE_SECRET_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "SESSION_CAPTURE_SECRET",
  "TWILIO_ENABLED",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL_SESSION",
  "GEMINI_MODEL_SUPERVISOR",
  "GEMINI_MODEL_KNOWLEDGE",
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
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  SESSION_CAPTURE_SECRET: process.env.SESSION_CAPTURE_SECRET,
  TWILIO_ENABLED: process.env.TWILIO_ENABLED,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL_SESSION: process.env.GEMINI_MODEL_SESSION,
    GEMINI_MODEL_SUPERVISOR: process.env.GEMINI_MODEL_SUPERVISOR,
    GEMINI_MODEL_KNOWLEDGE: process.env.GEMINI_MODEL_KNOWLEDGE,
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
    GOOGLE_OAUTH_REDIRECT_URI: resolveGoogleCalendarRedirectUri(
      source.GOOGLE_OAUTH_REDIRECT_URI,
      appUrl,
    ),
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  if (parsed.data.TWILIO_ENABLED) {
    const missing: string[] = [];
    if (!parsed.data.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
    if (!parsed.data.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment configuration: ${missing.join(", ")}. Values are not logged. See docs/09-env-contract.md.`,
      );
    }
  }
  return parsed.data;
}

export function parseGoogleCalendarEnv(
  source: EnvSource = readServerEnvFromProcess(),
): GoogleCalendarEnv {
  const appUrl = coalesceAppUrl(source.NEXT_PUBLIC_APP_URL, source.VERCEL_URL);
  const parsed = googleCalendarEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: appUrl,
    GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: resolveGoogleCalendarRedirectUri(
      source.GOOGLE_OAUTH_REDIRECT_URI,
      appUrl,
    ),
    GOOGLE_TOKEN_ENCRYPTION_KEY: source.GOOGLE_TOKEN_ENCRYPTION_KEY,
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}

/** Resolves the Calendar OAuth callback without requiring the full server env. */
export function peekGoogleCalendarRedirectUri(
  source: EnvSource = readServerEnvFromProcess(),
): string | undefined {
  const appUrl = coalesceAppUrl(source.NEXT_PUBLIC_APP_URL, source.VERCEL_URL);
  return resolveGoogleCalendarRedirectUri(
    source.GOOGLE_OAUTH_REDIRECT_URI,
    appUrl,
  );
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
    twilioEnabled:
      source.TWILIO_ENABLED === true ||
      source.TWILIO_ENABLED === "true" ||
      source.TWILIO_ENABLED === "1",
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
