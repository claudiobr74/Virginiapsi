import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  extensionFromFilename,
  type GroqAudioExtension,
} from "@/lib/integrations/transcription/groq-audio";

export const FALLBACK_AUDIO_BUCKET = "session-audio-fallback";

export interface FallbackUploadGrant {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
}

function safeExtension(filename?: string): GroqAudioExtension {
  return extensionFromFilename(filename ?? "") ?? "webm";
}

/**
 * Mints a one-time signed upload URL for the external-recording import path.
 * `session-audio-fallback` has zero storage.objects grants for
 * anon/authenticated — the service-role client is the only way to mint this,
 * and only after `authorizeCaptureCapability()`.
 *
 * Live transcription does not use this bucket: chunks go request → Groq →
 * text, then the Blob is discarded.
 */
export async function createFallbackUploadGrant(
  organizationId: string,
  sessionId: string,
  options?: { filename?: string },
): Promise<FallbackUploadGrant> {
  const extension = safeExtension(options?.filename);
  const path = `${organizationId}/${sessionId}/${randomUUID()}.${extension}`;
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.storage
    .from(FALLBACK_AUDIO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`failed to create fallback upload grant: ${error?.message}`);
  }

  return {
    bucket: FALLBACK_AUDIO_BUCKET,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}

export async function deleteImportedAudioObject(storagePath: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(FALLBACK_AUDIO_BUCKET).remove([storagePath]);
  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        operation: "delete_imported_audio",
        errorClass: error.name ?? "StorageError",
      }),
    );
  }
}
