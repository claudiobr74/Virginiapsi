import "server-only";

import { settingsAdmin, EXPORT_BUCKET, FALLBACK_AUDIO_BUCKET } from "@/features/settings/admin-store";
import { DOCUMENT_BUCKETS } from "@/lib/documents/storage";

const BUCKET_MAP: Record<string, string> = {
  "patient-attachments": DOCUMENT_BUCKETS.patientAttachments,
  "clinical-documents": DOCUMENT_BUCKETS.clinicalDocuments,
  consents: DOCUMENT_BUCKETS.consents,
  "session-audio-fallback": FALLBACK_AUDIO_BUCKET,
  "tesseli-exports": EXPORT_BUCKET,
};

export async function purgeEliminationStorage(
  objects: Array<{ bucket?: string; path?: string }>,
): Promise<void> {
  const admin = settingsAdmin();
  const grouped = new Map<string, string[]>();
  for (const item of objects) {
    if (!item.bucket || !item.path) continue;
    const bucket = BUCKET_MAP[item.bucket] ?? item.bucket;
    const paths = grouped.get(bucket) ?? [];
    paths.push(item.path);
    grouped.set(bucket, paths);
  }
  for (const [bucket, paths] of grouped) {
    if (paths.length === 0) continue;
    try {
      await admin.storage.from(bucket).remove(paths);
    } catch {
      // Verification RPC reports leftover classes; do not throw mid-plan.
    }
  }
}
