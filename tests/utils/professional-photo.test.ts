import { describe, expect, it } from "vitest";
import {
  isProfessionalPhotoMimeType,
  isProfessionalPhotoStoragePath,
  professionalPhotoFilename,
  PROFESSIONAL_PHOTO_MAX_BYTES,
} from "@/features/settings/professional-photo";

const orgId = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";

describe("foto profissional", () => {
  it("aceita JPEG/PNG/WebP e monta um object key único", () => {
    expect(isProfessionalPhotoMimeType("image/jpeg")).toBe(true);
    expect(isProfessionalPhotoMimeType("image/gif")).toBe(false);
    const first = professionalPhotoFilename("image/png");
    const second = professionalPhotoFilename("image/png");
    expect(first).toMatch(/^portrait-[0-9a-f-]{36}\.png$/);
    expect(second).toMatch(/^portrait-[0-9a-f-]{36}\.png$/);
    expect(first).not.toBe(second);
  });

  it("limita a foto profissional a 5 MB", () => {
    expect(PROFESSIONAL_PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("exige prefixo do tenant e rejeita path traversal", () => {
    expect(
      isProfessionalPhotoStoragePath(orgId, `${orgId}/professional/c0ffee00-portrait.jpg`),
    ).toBe(true);
    expect(
      isProfessionalPhotoStoragePath(orgId, `${otherOrg}/professional/c0ffee00-portrait.jpg`),
    ).toBe(false);
    expect(
      isProfessionalPhotoStoragePath(orgId, `${orgId}/../${otherOrg}/portrait.jpg`),
    ).toBe(false);
    expect(isProfessionalPhotoStoragePath(orgId, `${orgId}/professional`)).toBe(false);
    expect(
      isProfessionalPhotoStoragePath(orgId, `${orgId}/professional/notes.txt`),
    ).toBe(false);
  });
});
