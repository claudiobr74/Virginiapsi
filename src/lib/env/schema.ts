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

export const GOOGLE_CALENDAR_OAUTH_CALLBACK_PATH =
  "/api/integrations/google/callback";

/**
 * Calendar OAuth callback is always `{NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`.
 * Never derived from VERCEL_URL, Preview hostnames, or a separate env var.
 */
export function googleCalendarRedirectUri(appUrl: string): string {
  const coerced = normalizePublicAppUrl(appUrl);
  if (typeof coerced !== "string" || !coerced) {
    throw new Error(
      "Invalid environment configuration: NEXT_PUBLIC_APP_URL. Values are not logged. See docs/09-env-contract.md.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(coerced);
  } catch {
    throw new Error(
      "Invalid environment configuration: NEXT_PUBLIC_APP_URL. Values are not logged. See docs/09-env-contract.md.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      "Invalid environment configuration: NEXT_PUBLIC_APP_URL. Values are not logged. See docs/09-env-contract.md.",
    );
  }

  if (parsed.hostname.toLowerCase().includes("tesseli")) {
    throw new Error(
      "Invalid environment configuration: NEXT_PUBLIC_APP_URL. Values are not logged. See docs/09-env-contract.md.",
    );
  }

  return `${parsed.origin}${GOOGLE_CALENDAR_OAUTH_CALLBACK_PATH}`;
}

export function httpOriginOf(value: string): string | null {
  try {
    const coerced = normalizePublicAppUrl(value);
    if (typeof coerced !== "string" || !coerced) {
      return null;
    }
    const parsed = new URL(coerced);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isLoopbackHttpUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function isUsableHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Preview/Production on Vercel often have an empty, host-only, or
 * localhost `NEXT_PUBLIC_APP_URL` (copied from `.env`) while `VERCEL_URL`
 * is the real HTTPS host. Prefer a public APP_URL; otherwise use Vercel.
 */
export function coalesceAppUrl(
  appUrl: string | undefined,
  vercelUrl: string | undefined,
): string | undefined {
  const normalized = normalizePublicAppUrl(appUrl);
  const fromApp =
    typeof normalized === "string" && isUsableHttpUrl(normalized)
      ? normalized
      : undefined;

  const host = vercelUrl?.trim();
  let fromVercel: string | undefined;
  if (host) {
    const candidate = /^https?:\/\//i.test(host)
      ? host
      : `https://${host.replace(/^\/\//, "")}`;
    fromVercel = isUsableHttpUrl(candidate) ? candidate : undefined;
  }

  if (fromApp && !isLoopbackHttpUrl(fromApp)) {
    return fromApp;
  }
  if (fromVercel && !isLoopbackHttpUrl(fromVercel)) {
    return fromVercel;
  }
  return fromApp ?? fromVercel;
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

/** Key names only — never values — for operator-facing Calendar errors. */
export function envIssueKeyNames(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Invalid environment configuration: ([^.]+)/);
  if (!match) {
    return [];
  }
  return [
    ...new Set(
      match[1]
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && part !== "(root)"),
    ),
  ];
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
    VERCEL_URL: process.env.VERCEL_URL,
  };
}

export function parsePublicEnv(
  source: EnvSource = readPublicEnvFromProcess(),
): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: coalesceAppUrl(
      source.NEXT_PUBLIC_APP_URL,
      source.VERCEL_URL,
    ),
  });
  if (!parsed.success) {
    throw new Error(formatEnvIssues(parsed.error));
  }
  return parsed.data;
}
