import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

/**
 * Short-lived on purpose (docs/05: "Links de download são signed URLs de
 * curta duração"). Two minutes is long enough to start a download and short
 * enough that a leaked URL is useless minutes later. Keep this module free of
 * `server-only` so the TTL and path rules are unit-testable.
 */
export const SIGNED_URL_TTL_SECONDS = 120;

export function buildStoragePath(
  organizationId: string,
  resourceId: string,
  filename: string,
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.\./g, "_");
  return `${organizationId}/${resourceId}/${randomUUID()}-${safeName}`;
}

/** Branding/PDF object keys must stay inside the caller's tenant prefix. */
export function isOrgScopedStoragePath(
  organizationId: string,
  storagePath: string | null | undefined,
): boolean {
  if (!storagePath) return true;
  return storagePath.startsWith(`${organizationId}/`) && !storagePath.includes("..");
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
