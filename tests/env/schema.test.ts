import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLoopbackHttpUrl,
  normalizeGoogleOAuthRedirectUri,
  normalizePublicAppUrl,
  parsePublicEnv,
} from "../../src/lib/env/schema";
import {
  parseServerEnv,
  SERVER_ONLY_ENV_KEYS,
} from "../../src/lib/env/server-schema";

const ROOT = path.resolve(__dirname, "../..");

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci_placeholder",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

const validServer = {
  ...validPublic,
  SUPABASE_SECRET_KEY: "sb_secret_ci_placeholder",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GOOGLE_OAUTH_REDIRECT_URI:
    "http://localhost:3000/api/integrations/google/callback",
  GOOGLE_TOKEN_ENCRYPTION_KEY: "token-encryption-key-placeholder",
  SESSION_CAPTURE_SECRET: "session-capture-secret-placeholder",
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_AUTH_TOKEN: "twilio-auth-token",
  TWILIO_WHATSAPP_FROM: "whatsapp:+5500000000000",
  TWILIO_MESSAGING_SERVICE_SID: "MG00000000000000000000000000000000",
  GEMINI_API_KEY: "gemini-key",
  GEMINI_MODEL_SESSION: "gemini-session-model",
  GEMINI_MODEL_SUPERVISOR: "gemini-supervisor-model",
  GEMINI_MODEL_KNOWLEDGE: "gemini-knowledge-model",
  GEMINI_EMBEDDING_MODEL: "gemini-embedding-model",
  CRON_SECRET: "cron-secret",
};

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("contrato de ambiente", () => {
  it("aceita o contrato público válido", () => {
    expect(parsePublicEnv(validPublic).NEXT_PUBLIC_APP_URL).toBe(
      "http://localhost:3000",
    );
  });

  it("normaliza NEXT_PUBLIC_APP_URL colado como host ou entre aspas", () => {
    expect(normalizePublicAppUrl("serena-psi-beta.vercel.app")).toBe(
      "https://serena-psi-beta.vercel.app",
    );
    expect(normalizePublicAppUrl('"https://example.com"')).toBe(
      "https://example.com",
    );
    expect(
      parsePublicEnv({
        ...validPublic,
        NEXT_PUBLIC_APP_URL: "tesseli-git-preview.vercel.app",
      }).NEXT_PUBLIC_APP_URL,
    ).toBe("https://tesseli-git-preview.vercel.app");
  });

  it("explica NEXT_PUBLIC_APP_URL inválida sem vazar o valor", () => {
    const bad = "not a host";
    expect(() =>
      parsePublicEnv({ ...validPublic, NEXT_PUBLIC_APP_URL: bad }),
    ).toThrow(/must be a full URL including http:\/\/ or https:\/\//);
    try {
      parsePublicEnv({ ...validPublic, NEXT_PUBLIC_APP_URL: bad });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(bad);
    }
  });

  it("rejeita chave publishable no formato legado", () => {
    expect(() =>
      parsePublicEnv({
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-legacy-jwt",
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it("falha de forma explícita sem vazar valores quando o env servidor está incompleto", () => {
    const source = {
      ...validPublic,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_secret_value_must_not_leak",
    };

    expect(() => parseServerEnv(source)).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => parseServerEnv(source)).toThrow(/Values are not logged/);

    try {
      parseServerEnv(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("sb_publishable_secret_value_must_not_leak");
    }
  });

  it("normaliza o redirect URI da Agenda (origem, login ou aspas)", () => {
    expect(normalizeGoogleOAuthRedirectUri("preview.vercel.app")).toBe(
      "https://preview.vercel.app/api/integrations/google/callback",
    );
    expect(
      normalizeGoogleOAuthRedirectUri("https://preview.vercel.app/auth/callback"),
    ).toBe("https://preview.vercel.app/api/integrations/google/callback");
    expect(
      parseServerEnv({
        ...validServer,
        GOOGLE_OAUTH_REDIRECT_URI: "https://preview.vercel.app",
      }).GOOGLE_OAUTH_REDIRECT_URI,
    ).toBe("https://preview.vercel.app/api/integrations/google/callback");
  });

  it("reconhece localhost no redirect URI", () => {
    expect(isLoopbackHttpUrl("http://localhost:3000/api/integrations/google/callback")).toBe(
      true,
    );
    expect(
      isLoopbackHttpUrl(
        "https://preview.vercel.app/api/integrations/google/callback",
      ),
    ).toBe(false);
  });

  it("aceita o contrato servidor completo", () => {
    expect(parseServerEnv(validServer).SUPABASE_SECRET_KEY).toBe(
      "sb_secret_ci_placeholder",
    );
  });

  it("aceita o contrato servidor sem remetente Twilio (exigido só no envio)", () => {
    const parsed = parseServerEnv({
      ...validServer,
      TWILIO_WHATSAPP_FROM: "",
      TWILIO_MESSAGING_SERVICE_SID: "",
    });
    expect(parsed.TWILIO_WHATSAPP_FROM).toBeUndefined();
    expect(parsed.TWILIO_MESSAGING_SERVICE_SID).toBeUndefined();
  });

  it("aceita o contrato servidor sem GROQ_API_KEY", () => {
    // A transcrição padrão roda no dispositivo: sem provider de fallback
    // configurado o app continua completo (docs/22).
    expect(parseServerEnv(validServer).GROQ_API_KEY).toBeUndefined();
    expect(
      parseServerEnv({ ...validServer, GROQ_API_KEY: "groq-key" }).GROQ_API_KEY,
    ).toBe("groq-key");
  });

  it("rejeita service_role legado no lugar da secret key", () => {
    expect(() =>
      parseServerEnv({
        ...validServer,
        SUPABASE_SECRET_KEY: "service_role_legacy_jwt",
      }),
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("não importa env servidor em módulos client", () => {
    const files = walkFiles(path.join(ROOT, "src"));
    const leaks: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const isClient = /['"]use client['"]/.test(source);
      if (!isClient) {
        continue;
      }
      if (
        source.includes("@/lib/env/server") ||
        source.includes("@/lib/supabase/admin") ||
        SERVER_ONLY_ENV_KEYS.some((key) => source.includes(key))
      ) {
        leaks.push(path.relative(ROOT, file));
      }
    }

    expect(leaks).toEqual([]);
  });
});
