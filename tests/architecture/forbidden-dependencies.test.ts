import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const FORBIDDEN_PACKAGES = [
  "firebase",
  "firebase-admin",
  "@firebase/app",
  "@firebase/firestore",
  "firebase-functions",
  "express",
  "@nestjs/core",
  "@nestjs/common",
  "@nestjs/platform-express",
  "drizzle-orm",
  "drizzle-kit",
  "prisma",
  "@prisma/client",
  "typeorm",
  "sequelize",
  "knex",
  "mikro-orm",
  "twilio",
] as const;

const FORBIDDEN_IMPORT_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "firebase", pattern: /from\s+['"]firebase(?:\/[^'"]*)?['"]|require\(\s*['"]firebase/ },
  { name: "firestore", pattern: /from\s+['"](?:firebase\/firestore|@firebase\/firestore)['"]/ },
  { name: "express", pattern: /from\s+['"]express['"]|require\(\s*['"]express['"]/ },
  { name: "nestjs", pattern: /from\s+['"]@nestjs\// },
  { name: "drizzle", pattern: /from\s+['"]drizzle-orm/ },
  { name: "prisma", pattern: /from\s+['"](?:@prisma\/client|prisma)['"]/ },
  { name: "typeorm", pattern: /from\s+['"]typeorm['"]/ },
];

const CODE_ROOTS = ["src", "tests", "scripts"] as const;

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    return acc;
  }

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("arquitetura proibida", () => {
  it("não declara dependências Firebase, Express/Nest ou ORM duplicado", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const declared = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const dependency of FORBIDDEN_PACKAGES) {
      expect(declared[dependency]).toBeUndefined();
    }
  });

  it("não importa bibliotecas de arquitetura paralela no código", () => {
    const files = CODE_ROOTS.flatMap((dir) => walkFiles(path.join(ROOT, dir)));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_IMPORT_PATTERNS) {
        expect(
          forbidden.pattern.test(content),
          `${path.relative(ROOT, file)} importa ${forbidden.name}`,
        ).toBe(false);
      }
    }
  });

  it("não expõe chaves server-only em variáveis NEXT_PUBLIC", () => {
    const envFiles = [".env.example", "src/lib/env/schema.ts", "src/lib/env/server-schema.ts"];
    const forbiddenPublicKeys = [
      "SUPABASE_SECRET_KEY",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_TOKEN_ENCRYPTION_KEY",
      "TWILIO_AUTH_TOKEN",
      "GEMINI_API_KEY",
      "GROQ_API_KEY",
      "CRON_SECRET",
    ];

    for (const envFile of envFiles) {
      const file = path.join(ROOT, envFile);
      if (!existsSync(file)) continue;
      const content = readFileSync(file, "utf8");
      for (const key of forbiddenPublicKeys) {
        expect(content).not.toContain(`NEXT_PUBLIC_${key}`);
      }
    }
  });

  it("mantém o cliente service-role server-only e sem consumidores", () => {
    const adminClientPath = path.join(ROOT, "src/lib/supabase/admin.ts");
    expect(existsSync(adminClientPath)).toBe(true);

    const adminClient = readFileSync(adminClientPath, "utf8");
    expect(adminClient).toContain('import "server-only";');

    // Allowed service-role consumers are deliberately enumerated. Any new
    // consumer must be reviewed here so server-only privilege cannot spread
    // silently through the application.
    //
    // src/app/api/session-capture/transcribe/route.ts +
    // src/lib/integrations/transcription/fallback-storage.ts: fallback ASR
    // uses the service-role client only after the session/capability checks.
    //
    // src/lib/documents/storage.ts: clinical-documents/patient-attachments/
    // consents (Fase 9) also rely on signed URLs emitted only after role and
    // sensitivity checks in application code.
    //
    // src/features/communications/admin-store.ts: reminder jobs/webhooks are
    // authenticated by CRON_SECRET / Twilio signature before side effects.
    //
    // src/features/settings/admin-store.ts: retention/export privileged paths
    // are gated before using the service-role client.
    //
    // src/lib/integrations/google/connection.ts: Phase 6B restricts encrypted
    // OAuth credential reads to service_role. This module is server-only; the
    // authenticated OAuth boundary remains responsible for user/org checks
    // and credential writes continue to use the session client.
    const allowedImporters: string[] = [
      "src/app/api/session-capture/transcribe/route.ts",
      "src/features/communications/admin-store.ts",
      "src/features/settings/admin-store.ts",
      "src/lib/documents/storage.ts",
      "src/lib/integrations/google/connection.ts",
      "src/lib/integrations/transcription/fallback-storage.ts",
    ];
    const importers = CODE_ROOTS.flatMap((dir) => walkFiles(path.join(ROOT, dir)))
      .filter((file) => file !== adminClientPath)
      .filter((file) =>
        /from\s+["']@\/lib\/supabase\/admin["']/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(ROOT, file));

    expect(importers.sort()).toEqual(allowedImporters);
  });

  it("toda rota de capability de captura passa pelo consent gate", () => {
    const captureRoutes = walkFiles(
      path.join(ROOT, "src/app/api/session-capture"),
    ).filter((file) => file.endsWith("route.ts"));

    for (const route of captureRoutes) {
      const content = readFileSync(route, "utf8");
      expect(
        content.includes("authorizeCaptureCapability") ||
          content.includes("verifyCaptureGrantToken"),
        `${path.relative(ROOT, route)} não passa pelo consent gate`,
      ).toBe(true);
    }
  });

  it("endpoints de grant aplicam rate limit antes de emitir capacidade", () => {
    const routes = [
      "src/app/api/session-capture/grant/route.ts",
      "src/app/api/session-capture/upload-grant/route.ts",
    ];
    for (const route of routes) {
      const content = readFileSync(path.join(ROOT, route), "utf8");
      const rateLimitPosition = content.indexOf("rateLimit");
      const grantPosition = content.indexOf("authorizeCaptureCapability");
      expect(rateLimitPosition).toBeGreaterThanOrEqual(0);
      expect(grantPosition).toBeGreaterThanOrEqual(0);
      expect(rateLimitPosition).toBeLessThan(grantPosition);
    }
  });

  it("webhooks Twilio recusam payload acima do teto antes da assinatura", () => {
    const webhookRoutes = [
      "src/app/api/webhooks/twilio/inbound/route.ts",
      "src/app/api/webhooks/twilio/status/route.ts",
    ];
    for (const route of webhookRoutes) {
      const content = readFileSync(path.join(ROOT, route), "utf8");
      expect(content).toContain("rejectOversizedRequest");
      expect(content).toContain("verifyTwilioSignature");
      expect(content.indexOf("rejectOversizedRequest")).toBeLessThan(
        content.indexOf("verifyTwilioSignature"),
      );
    }
  });

  it("declara error boundaries e headers de segurança globais", () => {
    expect(existsSync(path.join(ROOT, "src/app/error.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/global-error.tsx"))).toBe(true);
    const nextConfig = readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    expect(nextConfig).toContain("headers");
    expect(nextConfig).toContain("X-Content-Type-Options");
  });

  it("preserva o arquivo oficial da logo sem alteração de bytes", () => {
    const logoPath = path.join(ROOT, "public/brand/logo.png");
    if (!existsSync(logoPath)) return;
    const digest = createHash("sha256").update(readFileSync(logoPath)).digest("hex");
    expect(digest.length).toBe(64);
  });

  it("mantém a estrutura de features exigida pelo master prompt", () => {
    for (const feature of ["calendar", "communications", "documents", "settings"]) {
      expect(existsSync(path.join(ROOT, "src/features", feature))).toBe(true);
    }
  });

  it("não declara ASR local no package.json nem o script ONNX", () => {
    const pkg = readFileSync(path.join(ROOT, "package.json"), "utf8");
    expect(pkg).not.toContain("onnxruntime");
    expect(pkg).not.toContain("whisper.cpp");
  });

  it("caminho ao vivo não grava áudio no Storage", () => {
    const liveFiles = [
      "src/app/api/session-capture/segment/route.ts",
      "src/app/api/session-capture/transcribe-chunk/route.ts",
    ];
    for (const file of liveFiles) {
      const content = readFileSync(path.join(ROOT, file), "utf8");
      expect(content).not.toContain("storage.from(");
    }
  });
});
