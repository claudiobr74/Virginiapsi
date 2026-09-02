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

export const LIVE_TRANSCRIPTION_HINT =
  "Áudio enviado com segurança. Sem conexão, o pendente fica criptografado neste dispositivo.";

export const SECURE_SPOOL_UNAVAILABLE_MESSAGE =
  "Não foi possível ativar a gravação local de segurança. A transcrição segue com conexão.";

export const SECURE_SPOOLING_MESSAGE =
  "Sem conexão. Trechos pendentes ficam criptografados neste dispositivo.";

export const UNPRESERVED_STOP_MESSAGE =
  "Sessão encerrada. Alguns trechos não enviados não puderam ser preservados.";

export const LOW_STORAGE_WARNING =
  "Pouco espaço neste dispositivo. A cópia local pode falhar.";

export const BACKGROUND_CAPTURE_WARNING =
  "Mantenha esta aba visível durante a transcrição.";

export const EMPTY_TRANSCRIPT_HINT = "Nenhum trecho ainda.";

export const PENDING_RECOVERY_HINT = "Há trechos pendentes de transcrição.";

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
