import { describe, expect, it } from "vitest";
import {
  isProfessionalPhotoMimeType,
  isProfessionalPhotoStoragePath,
  professionalPhotoFilename,
} from "@/features/settings/professional-photo";

const orgId = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";

describe("foto profissional", () => {
  it("aceita JPEG/PNG/WebP e monta o nome do arquivo", () => {
    expect(isProfessionalPhotoMimeType("image/jpeg")).toBe(true);
    expect(isProfessionalPhotoMimeType("image/gif")).toBe(false);
    expect(professionalPhotoFilename("image/png")).toBe("portrait.png");
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
