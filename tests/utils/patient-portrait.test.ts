import { describe, expect, it } from "vitest";
import {
  PORTRAIT_MAX_BYTES,
  isPortraitMimeType,
  isPortraitStoragePath,
  portraitFilename,
} from "@/features/patients/portrait";
import { buildStoragePath } from "@/lib/documents/storage-meta";

describe("retrato de identificação", () => {
  const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const patientId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("aceita JPEG, PNG e WebP e recusa o resto", () => {
    expect(isPortraitMimeType("image/jpeg")).toBe(true);
    expect(isPortraitMimeType("image/png")).toBe(true);
    expect(isPortraitMimeType("image/webp")).toBe(true);
    expect(isPortraitMimeType("image/gif")).toBe(false);
    expect(isPortraitMimeType("application/pdf")).toBe(false);
  });

  it("cada retrato recebe um object key único mesmo com o mesmo MIME", () => {
    const firstName = portraitFilename("image/jpeg");
    const secondName = portraitFilename("image/jpeg");
    expect(firstName).toMatch(/^portrait-[0-9a-f-]{36}\.jpg$/);
    expect(firstName).not.toBe(secondName);
    const first = buildStoragePath(orgId, patientId, firstName);
    const second = buildStoragePath(orgId, patientId, secondName);
    expect(first).not.toBe(second);
    expect(isPortraitStoragePath(orgId, patientId, first)).toBe(true);
    expect(isPortraitStoragePath(orgId, patientId, second)).toBe(true);
  });

  it("substituição JPEG→PNG e JPEG sobre JPEG não colidem no mesmo object key", () => {
    const jpegA = portraitFilename("image/jpeg");
    const jpegB = portraitFilename("image/jpeg");
    const png = portraitFilename("image/png");
    expect(new Set([jpegA, jpegB, png]).size).toBe(3);
  });

  it("só aceita path deste tenant e deste paciente, com extensão de imagem", () => {
    expect(
      isPortraitStoragePath(
        orgId,
        patientId,
        `${orgId}/${patientId}/c0ffee00-portrait.jpg`,
      ),
    ).toBe(true);
    expect(
      isPortraitStoragePath(orgId, patientId, `${orgId}/other-patient/file.jpg`),
    ).toBe(false);
    expect(
      isPortraitStoragePath("other-org", patientId, `${orgId}/${patientId}/file.jpg`),
    ).toBe(false);
    expect(
      isPortraitStoragePath(orgId, patientId, `${orgId}/${patientId}/../escape.jpg`),
    ).toBe(false);
    expect(
      isPortraitStoragePath(orgId, patientId, `${orgId}/${patientId}/notes.pdf`),
    ).toBe(false);
  });

  it("limita o retrato a 5 MB", () => {
    expect(PORTRAIT_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
