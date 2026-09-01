/** Live capture window. Capture continues while a previous chunk is in flight. */
export const DEFAULT_TRANSCRIPTION_CHUNK_MS = 15_000;

export const SPOOL_CRYPTO_VERSION = 1;

/** Stay under the Vercel serverless request body limit for live chunks. */
export const LIVE_CHUNK_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Documented Speech-to-Text upload cap on the provider free tier.
 * Live chunks stay far below this; import uses it as a hard file limit.
 */
export const IMPORT_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

export const TRANSCRIPTION_BACKPRESSURE = [
  "normal",
  "degraded",
  "spooling",
  "critical",
] as const;
export type TranscriptionBackpressure = (typeof TRANSCRIPTION_BACKPRESSURE)[number];

export const SECURE_SPOOL_UNAVAILABLE_MESSAGE =
  "Não foi possível ativar a gravação local de segurança neste navegador. A transcrição pode continuar enquanto houver conexão.";

export const SECURE_SPOOLING_MESSAGE =
  "A conexão com a transcrição está indisponível. Os trechos ainda não processados estão sendo preservados de forma criptografada neste dispositivo.";

export const UNPRESERVED_STOP_MESSAGE =
  "Sessão encerrada. Trechos já transcritos permanecem no prontuário. Alguns trechos ainda não enviados não puderam ser preservados com segurança neste dispositivo.";

export const SESSION_CAPTURE_STATES = [
  "idle",
  "authorizing",
  "requesting_microphone",
  "recording",
  "connection_degraded",
  "local_backup",
  "recovering",
  "stopping",
  "completed",
  "error",
] as const;
export type SessionCaptureState = (typeof SESSION_CAPTURE_STATES)[number];
