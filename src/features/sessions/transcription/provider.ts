// The `TranscriptionProvider` port (docs/08-implementation-phases.md Fase 6,
// docs/22-transcription-provider-decision.md). Both adapters fulfill this
// contract conceptually, not as a single polymorphic TS interface swapped
// at runtime: `local-webgpu`/`local-wasm` run entirely client-side inside
// `useLocalTranscription` (browser mic + on-device model), while
// `groq-batch` runs server-side (`/api/session-capture/transcribe`,
// triggered only after the fallback's own consent-gated signed upload).
// They cannot share one runtime call site because they operate in
// different execution contexts by design — the whole point of local-first
// is that the server is never in the loop for the default path. What they
// share is this output shape and the invariants every provider must honor.
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
  /** 0-1, when the provider exposes one. Never fabricated. */
  confidence?: number;
  /**
   * Set only when the provider actually offers diarization. Absence must
   * never be filled in with a guessed speaker — the port itself has no
   * default speaker label.
   */
  speakerLabel?: string;
}

/**
 * Invariants every adapter of this port must uphold, enforced across the
 * codebase rather than by a shared base class:
 * - `local-webgpu`/`local-wasm`: zero network requests carry audio bytes
 *   (tests/utils/local-transcription-no-audio-egress.test.ts) — only the
 *   transcribed text reaches `/api/session-capture/segment`.
 * - `groq-batch`: audio only ever leaves the device after
 *   `authorizeCaptureCapability()` issues a fallback grant AND the upload
 *   goes through the signed URL that grant authorizes — never a bare POST
 *   with the org's Groq key on the client.
 * - Every final segment is idempotent by `(session_id, sequence)` — a
 *   resumed capture upserts, never duplicates
 *   (session_transcript_segments_unique_sequence).
 * - No adapter invents a speaker label when it has no diarization signal.
 */
export type TranscriptionProviderPort = "see module-level invariants above";
