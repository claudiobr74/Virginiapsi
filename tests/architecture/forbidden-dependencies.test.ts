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

    const found = FORBIDDEN_PACKAGES.filter((name) => name in declared);
    expect(found).toEqual([]);
  });

  it("não importa bibliotecas de arquitetura paralela no código", () => {
    const files = CODE_ROOTS.flatMap((dir) => walkFiles(path.join(ROOT, dir)));
    const hits: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const rule of FORBIDDEN_IMPORT_PATTERNS) {
        if (rule.pattern.test(source)) {
          hits.push(`${path.relative(ROOT, file)}:${rule.name}`);
        }
      }
    }

    expect(hits).toEqual([]);
  });

  it("não expõe chaves server-only em variáveis NEXT_PUBLIC", () => {
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    const publicKeys = example
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("NEXT_PUBLIC_"))
      .map((line) => line.split("=")[0] ?? "");

    expect(publicKeys).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_APP_URL",
    ]);

    const forbiddenPublic = publicKeys.filter((key) =>
      /SECRET|TOKEN|SERVICE_ROLE|PRIVATE/i.test(key),
    );
    expect(forbiddenPublic).toEqual([]);
  });

  it("preserva o arquivo oficial da logo sem alteração de bytes", () => {
    const logoPath = path.join(
      ROOT,
      "public/brand/Logo SerenaPsi em Gradiente Sereno(2).png",
    );
    const digest = createHash("sha256")
      .update(readFileSync(logoPath))
      .digest("hex");
    expect(digest).toBe(
      "1242982de9808cf82f1e2d24c69b4636789796268eb4f1c5ba1467fee73068e6",
    );
  });

  it("mantém a estrutura de features exigida pelo master prompt", () => {
    const features = [
      "auth",
      "dashboard",
      "patients",
      "calendar",
      "sessions",
      "finance",
      "documents",
      "supervisor",
      "knowledge",
      "settings",
      "communications",
    ];

    for (const feature of features) {
      expect(existsSync(path.join(ROOT, "src/features", feature))).toBe(true);
    }

    expect(existsSync(path.join(ROOT, "src/lib/supabase"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/lib/integrations"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/lib/security"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/lib/audit"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/lib/contracts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/lib/ai/prompts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/lib/ai/contracts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/components/ui"))).toBe(true);
    expect(existsSync(path.join(ROOT, "supabase/migrations"))).toBe(true);
  });
});
