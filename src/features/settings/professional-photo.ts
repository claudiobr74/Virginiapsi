import { randomUUID } from "node:crypto";

export const PROFESSIONAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const PROFESSIONAL_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type ProfessionalPhotoMimeType = (typeof PROFESSIONAL_PHOTO_MIME_TYPES)[number];

const MIME_EXTENSION: Record<ProfessionalPhotoMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isProfessionalPhotoMimeType(
  value: string,
): value is ProfessionalPhotoMimeType {
  return (PROFESSIONAL_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

export function professionalPhotoFilename(mimeType: ProfessionalPhotoMimeType): string {
  return `portrait-${randomUUID()}.${MIME_EXTENSION[mimeType]}`;
}

/**
 * A professional portrait must live under this tenant. The service-role
 * signer must not follow a photo_path that points at another org.
 */
export function isProfessionalPhotoStoragePath(
  organizationId: string,
  path: string,
): boolean {
  const prefix = `${organizationId}/`;
  if (!path.startsWith(prefix) || path.includes("..")) {
    return false;
  }
  const rest = path.slice(prefix.length);
  if (!rest) {
    return false;
  }
  return /\.(jpe?g|png|webp)$/i.test(rest);
}
