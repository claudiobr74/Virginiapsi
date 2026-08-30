/**
 * Content-Security-Policy builder. Nonce is per-request (see `src/proxy.ts`).
 * Never use `script-src *`. In-memory / instance-local concerns do not apply here.
 */

export interface CspOptions {
  nonce: string;
  supabaseOrigin: string | null;
  isDev: boolean;
}

function originFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function supabaseOriginFromUrl(value: string | undefined): string | null {
  return originFromUrl(value);
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    "'wasm-unsafe-eval'",
  ];
  if (options.isDev) {
    // Next.js dev overlay / HMR still eval in development.
    scriptSrc.push("'unsafe-eval'");
  }

  const connectSrc = ["'self'"];
  if (options.supabaseOrigin) {
    connectSrc.push(options.supabaseOrigin);
    if (options.supabaseOrigin.startsWith("https://")) {
      connectSrc.push(options.supabaseOrigin.replace(/^https:/, "wss:"));
    } else if (options.supabaseOrigin.startsWith("http://")) {
      connectSrc.push(options.supabaseOrigin.replace(/^http:/, "ws:"));
    }
  }
  connectSrc.push(
    "https://huggingface.co",
    "https://cdn-lfs.huggingface.co",
    "https://cas-bridge.xethub.hf.co",
  );
  if (options.isDev) {
    connectSrc.push("ws:", "wss:");
  }

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connectSrc],
    ["worker-src", ["'self'", "blob:"]],
    ["child-src", ["'self'", "blob:"]],
    ["media-src", ["'self'", "blob:"]],
    ["frame-src", ["'none'"]],
  ];

  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export function createCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64url");
}
