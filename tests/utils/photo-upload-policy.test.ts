import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPortraitMimeType,
  isPortraitStoragePath,
  PORTRAIT_MAX_BYTES,
} from "@/features/patients/portrait";
import {
  isProfessionalPhotoMimeType,
  isProfessionalPhotoStoragePath,
  PROFESSIONAL_PHOTO_MAX_BYTES,
} from "@/features/settings/professional-photo";

const ROOT = path.resolve(__dirname, "../..");
const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherOrg = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const patientId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("política de upload de foto", () => {
  it("recusa MIME inválido no retrato e na foto profissional", () => {
    expect(isPortraitMimeType("image/gif")).toBe(false);
    expect(isPortraitMimeType("application/pdf")).toBe(false);
    expect(isProfessionalPhotoMimeType("image/gif")).toBe(false);
    expect(isPortraitMimeType("image/jpeg")).toBe(true);
    expect(isProfessionalPhotoMimeType("image/webp")).toBe(true);
  });

  it("rejeita path de outro tenant", () => {
    expect(
      isPortraitStoragePath(orgId, patientId, `${otherOrg}/${patientId}/portrait.jpg`),
    ).toBe(false);
    expect(
      isProfessionalPhotoStoragePath(orgId, `${otherOrg}/professional/portrait.jpg`),
    ).toBe(false);
  });

  it("rejeita arquivo acima de 5 MB", () => {
    expect(PORTRAIT_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(PROFESSIONAL_PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(6 * 1024 * 1024).toBeGreaterThan(PORTRAIT_MAX_BYTES);
  });

  it("buckets de foto permanecem privados no contrato de código", () => {
    const storage = readFileSync(path.join(ROOT, "src/lib/documents/storage.ts"), "utf8");
    expect(storage).toMatch(/patientAttachments:\s*"patient-attachments"/);
    expect(storage).toMatch(/practiceAssets:\s*"practice-assets"/);
    expect(storage).not.toMatch(/public:\s*true/);
  });

  it("confirma o DB antes de apagar o objeto anterior (paciente)", () => {
    const source = readFileSync(path.join(ROOT, "src/features/patients/actions.ts"), "utf8");
    const start = source.indexOf("export async function confirmPortraitUploadAction");
    const end = source.indexOf("export async function clearPortraitAction");
    const confirm = source.slice(start, end);
    expect(confirm.indexOf("photo_path: input.storagePath")).toBeGreaterThan(-1);
    expect(confirm.indexOf("if (error)")).toBeGreaterThan(-1);
    expect(confirm.indexOf("photo_path: input.storagePath")).toBeLessThan(
      confirm.indexOf("removeFile"),
    );
    expect(confirm).toMatch(/previousPath !== input\.storagePath/);
  });

  it("confirma o DB antes de apagar o objeto anterior (profissional)", () => {
    const source = readFileSync(path.join(ROOT, "src/features/settings/actions.ts"), "utf8");
    const start = source.indexOf("export async function confirmProfessionalPhotoUploadAction");
    const end = source.indexOf("export async function clearProfessionalPhotoAction");
    const confirm = source.slice(start, end);
    expect(confirm.indexOf("photo_path: input.storagePath")).toBeLessThan(
      confirm.indexOf("removeFile"),
    );
    expect(confirm).toMatch(/previousPath !== input\.storagePath/);
  });

  it("clear zera o DB antes de remover o objeto", () => {
    const patient = readFileSync(path.join(ROOT, "src/features/patients/actions.ts"), "utf8");
    const clear = patient.slice(patient.indexOf("export async function clearPortraitAction"));
    expect(clear.indexOf("photo_path: null")).toBeLessThan(clear.indexOf("removeFile"));
  });
});
