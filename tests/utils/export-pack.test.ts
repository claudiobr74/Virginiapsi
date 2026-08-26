import { describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { sha256Hex } from "@/lib/documents/storage-meta";
import { buildZipStore, listZipStoreEntries } from "@/lib/export/zip-store";
import { patientsToCsv, packLogicalExport } from "@/features/settings/export-pack";

describe("ZIP store + hashes", () => {
  it("gera um zip PK válido com CRC e tamanho de cada arquivo", () => {
    const files = [
      { name: "manifest.json", data: Buffer.from('{"ok":true}\n') },
      { name: "data/patients.csv", data: Buffer.from("public_code\nPAC-001\n") },
    ];
    const zip = buildZipStore(files, new Date("2026-08-20T12:00:00Z"));
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    const entries = listZipStoreEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual([
      "manifest.json",
      "data/patients.csv",
    ]);
    for (const file of files) {
      const entry = entries.find((item) => item.name === file.name);
      expect(entry?.size).toBe(file.data.length);
      expect(entry?.crc).toBe(crc32(file.data) >>> 0);
    }
  });
});

describe("exportação lógica", () => {
  it("CSV administrativo e hashes do manifesto batem com os bytes", async () => {
    const csv = patientsToCsv([
      {
        public_code: "PAC-001",
        preferred_name: "Beatriz",
        full_name: "Beatriz Lima",
        email: "beatriz@example.com",
        phone: "11988887777",
        status: "active",
        elimination_status: "active",
      },
    ]);
    expect(csv).toContain("PAC-001");
    expect(csv).toContain("Beatriz Lima");

    const tables: Record<string, unknown[]> = {
      organizations: [{ id: "11111111-1111-4111-8111-111111111111", name: "Consultório" }],
      practice_settings: [{ organization_id: "11111111-1111-4111-8111-111111111111" }],
      patients: [{ id: "22222222-2222-4222-8222-222222222222", public_code: "PAC-001" }],
    };
    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              async eq() {
                return { data: tables[table] ?? [], error: null };
              },
            };
          },
        };
      },
    };

    const packed = await packLogicalExport({
      supabase,
      organizationId: "11111111-1111-4111-8111-111111111111",
      organizationName: "Consultório",
      actorUserId: "33333333-3333-4333-8333-333333333333",
      scope: "organization",
      patientId: null,
      patientPublicCode: null,
      exportedAt: "2026-08-20T12:00:00.000Z",
    });

    expect(packed.manifest.schema_version).toBe("tesseli-export-v1");
    expect(packed.manifest.files.length).toBeGreaterThan(2);
    expect(packed.packageSha256).toBe(sha256Hex(packed.zip));
    expect(packed.manifestSha256).toBe(sha256Hex(packed.manifestBytes));
    for (const file of packed.manifest.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes).toBeGreaterThan(0);
    }
    const entries = listZipStoreEntries(packed.zip);
    expect(entries.some((entry) => entry.name === "manifest.json")).toBe(true);
    expect(entries.some((entry) => entry.name === "data/patients.csv")).toBe(true);
  });
});
