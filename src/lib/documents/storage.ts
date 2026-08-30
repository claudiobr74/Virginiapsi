import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SIGNED_URL_TTL_SECONDS,
  buildStoragePath,
  sha256Hex,
} from "@/lib/documents/storage-meta";

export { SIGNED_URL_TTL_SECONDS, buildStoragePath, sha256Hex };

/**
 * clinical-documents/patient-attachments/consents all have zero grants for
 * anon/authenticated in Storage RLS (see the Fase 9 migration header):
 * authorization here depends on the row's `sensitivity`/consent `type`,
 * which either doesn't exist yet at upload time or requires a join RLS
 * can't express cleanly — so every read/write goes through a signed URL
 * this module mints via the service-role client, only after the caller
 * (features/documents, features/consents) has already checked
 * role+sensitivity in TypeScript. Never call this before that check.
 */

export const DOCUMENT_BUCKETS = {
  clinicalDocuments: "clinical-documents",
  patientAttachments: "patient-attachments",
  consents: "consents",
  documentBranding: "document-branding",
} as const;
export type DocumentBucket = (typeof DOCUMENT_BUCKETS)[keyof typeof DOCUMENT_BUCKETS];

/** Uploads bytes generated server-side (PDFs) directly — no signed URL needed since the server already has the content in hand. */
export async function uploadGeneratedFile(
  bucket: DocumentBucket,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`failed to upload ${bucket}/${path}: ${error.message}`);
  }
}

/** For browser-originated uploads (patient attachments) — authorization must already be checked before calling this. */
export async function createSignedUploadUrl(
  bucket: DocumentBucket,
  path: string,
): Promise<{ path: string; token: string; signedUrl: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`failed to create signed upload url: ${error?.message}`);
  }
  return { path, token: data.token, signedUrl: data.signedUrl };
}

export async function createSignedDownloadUrl(
  bucket: DocumentBucket,
  path: string,
): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`failed to create signed download url: ${error?.message}`);
  }
  return data.signedUrl;
}

export async function downloadFile(bucket: DocumentBucket, path: string): Promise<Uint8Array> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`failed to download ${bucket}/${path}: ${error?.message}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeFile(bucket: DocumentBucket, path: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.storage.from(bucket).remove([path]);
}
