import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const httpUrl = z.string().trim().url();

/**
 * Dashboard pastes often omit `https://` or wrap the value in quotes.
 * Either form fails `z.string().url()` and, during `next build`, the
 * throw happens before `cookies()` — Next then treats `/app/*` as a
 * static page and dies on `/app/agenda`. Values are never logged.
 */
export function normalizePublicAppUrl(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  let next = value.trim();
  if (next.length >= 2) {
    const first = next[0];
    const last = next[next.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      next = next.slice(1, -1).trim();
    }
  }

  if (!next) {
    return next;
  }

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(next)) {
    next = `https://${next.replace(/^\/\//, "")}`;
  }

  return next;
}

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty.startsWith("sb_publishable_"),
  NEXT_PUBLIC_APP_URL: z.preprocess(normalizePublicAppUrl, httpUrl),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

export function formatEnvIssues(error: z.ZodError): string {
  const paths = [
    ...new Set(
      error.issues.map((issue) => issue.path.join(".") || "(root)"),
    ),
  ];
  let message = `Invalid environment configuration: ${paths.join(", ")}. Values are not logged. See docs/09-env-contract.md.`;
  if (paths.includes("NEXT_PUBLIC_APP_URL")) {
    message +=
      " NEXT_PUBLIC_APP_URL must be a full URL including http:// or https://.";
  }
  return message;
}

type EnvSource = Record<string, string | undefined>;

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` into the client bundle only
 * when the fully-qualified member expression appears literally in the
 * source. Reading through a variable/array (`source[key]`) defeats that
 * static analysis, so every public var is accessed by its literal path here
 * — do not refactor this into a loop or a shared "pick by key" helper.
 *
 * This module must stay free of server-only env names: it is imported by
 * `src/lib/env/public.ts`, which client components use directly. Server-only
 * schema/parsing lives in `src/lib/env/server.ts` behind `import "server-only"`.
 */
function readPublicEnvFromProcess(): EnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

export function parsePublicEnv(
  source: EnvSource = readPublicEnvFromProcess(),
): PublicEnv {
  const parsed = publicEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}
