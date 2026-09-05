import { randomUUID } from "node:crypto";

export const PORTRAIT_MAX_BYTES = 5 * 1024 * 1024;

export const PORTRAIT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PortraitMimeType = (typeof PORTRAIT_MIME_TYPES)[number];

export const PORTRAIT_MIME_EXTENSION: Record<PortraitMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isPortraitMimeType(value: string): value is PortraitMimeType {
  return (PORTRAIT_MIME_TYPES as readonly string[]).includes(value);
}

export function portraitFilename(mimeType: PortraitMimeType): string {
  return `portrait-${randomUUID()}.${PORTRAIT_MIME_EXTENSION[mimeType]}`;
}

/**
 * A portrait object must live under this tenant and this patient, and be an
 * image we actually accept. The service-role signer must not follow a
 * photo_path that points at another org or another patient's file.
 */
export function isPortraitStoragePath(
  organizationId: string,
  patientId: string,
  path: string,
): boolean {
  const prefix = `${organizationId}/${patientId}/`;
  if (!path.startsWith(prefix)) {
    return false;
  }
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes("..")) {
    return false;
  }
  return /\.(jpe?g|png|webp)$/i.test(rest);
}
