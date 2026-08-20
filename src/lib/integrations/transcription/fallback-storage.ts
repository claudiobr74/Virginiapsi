import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const FALLBACK_AUDIO_BUCKET = "session-audio-fallback";

export interface FallbackUploadGrant {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
}

/**
 * Mints a one-time signed upload URL for the optional Groq fallback path.
 * `session-audio-fallback` has zero storage.objects grants for
 * anon/authenticated (docs/05-security-rbac-rls.md §Áudio/transcrição: "não
 * pode ter INSERT genérico baseado apenas em membership") — the service-role
 * client is the only way to mint this, and it is only ever called from
 * `authorizeCaptureCapability()`'s allowed branch, i.e. strictly after the
 * same consent gate as the on-device capture grant.
 */
export async function createFallbackUploadGrant(
  organizationId: string,
  sessionId: string,
): Promise<FallbackUploadGrant> {
  const path = `${organizationId}/${sessionId}/${randomUUID()}.webm`;
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
