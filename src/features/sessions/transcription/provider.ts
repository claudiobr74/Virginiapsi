// The `TranscriptionProvider` port. Live ASR is Groq (`groq-batch`) via
// `/api/session-capture/transcribe-chunk`. Historical segments may still
// carry `local-webgpu` / `local-wasm` from the retired on-device path.
export const TRANSCRIPTION_PROVIDER_IDS = [
  "local-webgpu",
  "local-wasm",
  "groq-batch",
] as const;
export type TranscriptionProviderId = (typeof TRANSCRIPTION_PROVIDER_IDS)[number];

export interface TranscriptSegmentOutput {
  sequence: number;
  text: string;
  startMs: number;
  endMs: number;
  provider: TranscriptionProviderId;
  confidence?: number;
  speakerLabel?: string;
}

/**
 * Invariants:
 * - Browser never holds the Groq server key and never calls Groq directly.
 * - Live audio is request memory → Groq → text persist → ACK; not Storage.
 * - Import may use private temporary Storage and must delete after persist.
 * - Segments are idempotent by (session_id, sequence).
 * - No adapter invents a speaker label.
 */
export type TranscriptionProviderPort = "see module-level invariants above";
