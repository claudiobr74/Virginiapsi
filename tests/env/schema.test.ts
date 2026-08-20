import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "../../src/lib/env/schema";
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

  it("aceita o contrato servidor completo", () => {
    expect(parseServerEnv(validServer).SUPABASE_SECRET_KEY).toBe(
      "sb_secret_ci_placeholder",
    );
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
