import "server-only";

import { settingsAdmin } from "@/features/settings/admin-store";

export interface AudioRetentionResult {
  purgedAudioObjects: number;
  expiredExports: number;
}

export async function runAudioRetentionJob(): Promise<AudioRetentionResult> {
  const admin = settingsAdmin();
  const { data: purged, error: purgeError } = await admin.rpc(
    "purge_expired_fallback_audio",
  );
  if (purgeError) {
    throw new Error("audio retention purge failed");
  }
  const { data: expired, error: expireError } = await admin.rpc(
    "expire_stale_logical_exports",
  );
  if (expireError) {
    throw new Error("export expiry failed");
  }
  return {
    purgedAudioObjects: Number(purged ?? 0),
    expiredExports: Number(expired ?? 0),
  };
}
