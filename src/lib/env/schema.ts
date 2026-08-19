import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const httpUrl = z.string().trim().url();

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty.startsWith("sb_publishable_"),
  NEXT_PUBLIC_APP_URL: httpUrl,
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: nonEmpty.startsWith("sb_secret_"),
  GOOGLE_CLIENT_ID: nonEmpty,
  GOOGLE_CLIENT_SECRET: nonEmpty,
  GOOGLE_OAUTH_REDIRECT_URI: httpUrl,
  GOOGLE_TOKEN_ENCRYPTION_KEY: nonEmpty,
  TWILIO_ACCOUNT_SID: nonEmpty,
  TWILIO_AUTH_TOKEN: nonEmpty,
  TWILIO_WHATSAPP_FROM: nonEmpty,
  TWILIO_MESSAGING_SERVICE_SID: nonEmpty,
  DEEPGRAM_API_KEY: nonEmpty,
  GEMINI_API_KEY: nonEmpty,
  GEMINI_MODEL_SESSION: nonEmpty,
  GEMINI_MODEL_SUPERVISOR: nonEmpty,
  GEMINI_MODEL_KNOWLEDGE: nonEmpty,
  GEMINI_EMBEDDING_MODEL: nonEmpty,
  CRON_SECRET: nonEmpty,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

export const SERVER_ONLY_ENV_KEYS = [
  "SUPABASE_SECRET_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "DEEPGRAM_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL_SESSION",
  "GEMINI_MODEL_SUPERVISOR",
  "GEMINI_MODEL_KNOWLEDGE",
  "GEMINI_EMBEDDING_MODEL",
  "CRON_SECRET",
] as const;

export function formatEnvIssues(error: z.ZodError): string {
  const paths = error.issues.map((issue) => issue.path.join(".") || "(root)");
  return `Invalid environment configuration: ${[...new Set(paths)].join(", ")}. Values are not logged. See docs/09-env-contract.md.`;
}

function pick(
  source: NodeJS.ProcessEnv,
  keys: readonly string[],
): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

export function parsePublicEnv(
  source: NodeJS.ProcessEnv = process.env,
): PublicEnv {
  const parsed = publicEnvSchema.safeParse(pick(source, PUBLIC_ENV_KEYS));
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}

export function parseServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const parsed = serverEnvSchema.safeParse(
    pick(source, [...PUBLIC_ENV_KEYS, ...SERVER_ONLY_ENV_KEYS]),
  );
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}
