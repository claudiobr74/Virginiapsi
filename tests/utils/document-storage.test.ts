import { describe, expect, it } from "vitest";
import {
  SIGNED_URL_TTL_SECONDS,
  buildStoragePath,
  isOrgScopedStoragePath,
  sha256Hex,
} from "@/lib/documents/storage-meta";

describe("SIGNED_URL_TTL_SECONDS", () => {
  it("é curto o bastante para um link vazado perder utilidade rápido (docs/05)", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(120);
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
  });
});

describe("buildStoragePath", () => {
  it("prefixa com organizationId/resourceId e sanitiza o nome do arquivo", () => {
    const path = buildStoragePath(
      "org-abc",
      "patient-1",
      "../laudo clínico (v1).pdf",
    );
    expect(path.startsWith("org-abc/patient-1/")).toBe(true);
    expect(path).not.toContain("..");
    expect(path).not.toContain(" ");
    expect(path).not.toContain("(");
    expect(path.endsWith(".pdf")).toBe(true);
  });

  it("gera um path único a cada chamada (UUID no segmento final)", () => {
    const first = buildStoragePath("org", "res", "a.txt");
    const second = buildStoragePath("org", "res", "a.txt");
    expect(first).not.toBe(second);
  });
});

describe("isOrgScopedStoragePath", () => {
  it("aceita prefixo do tenant e rejeita path de outro org ou traversal", () => {
    expect(isOrgScopedStoragePath("org-a", "org-a/logos/x.png")).toBe(true);
    expect(isOrgScopedStoragePath("org-a", null)).toBe(true);
    expect(isOrgScopedStoragePath("org-a", "org-b/logos/x.png")).toBe(false);
    expect(isOrgScopedStoragePath("org-a", "org-a/../org-b/x.png")).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("é determinístico para os mesmos bytes", () => {
    const bytes = Buffer.from("Tesseli documento");
    expect(sha256Hex(bytes)).toBe(sha256Hex(bytes));
    expect(sha256Hex(bytes)).toHaveLength(64);
  });

  it("muda quando o conteúdo muda (prova de integridade do PDF/anexo)", () => {
    expect(sha256Hex(Buffer.from("a"))).not.toBe(sha256Hex(Buffer.from("b")));
  });
});
