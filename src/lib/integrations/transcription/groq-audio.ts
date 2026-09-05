/**
 * Formats documented by Groq Speech-to-Text
 * (https://console.groq.com/docs/speech-to-text): flac, mp3, mp4, mpeg,
 * mpga, m4a, ogg, wav, webm. Do not invent extra containers.
 */
export const GROQ_AUDIO_EXTENSIONS = [
  "flac",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "ogg",
  "wav",
  "webm",
] as const;

export type GroqAudioExtension = (typeof GROQ_AUDIO_EXTENSIONS)[number];

const MIME_TO_EXTENSION: Record<string, GroqAudioExtension> = {
  "audio/flac": "flac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mp4a-latm": "m4a",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "video/webm": "webm",
};

export function normalizeAudioMime(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isGroqSupportedAudioMime(mimeType: string): boolean {
  const normalized = normalizeAudioMime(mimeType);
  return normalized in MIME_TO_EXTENSION;
}

export function extensionForAudioMime(mimeType: string): GroqAudioExtension | null {
  const normalized = normalizeAudioMime(mimeType);
  return MIME_TO_EXTENSION[normalized] ?? null;
}

export function filenameForAudioMime(mimeType: string, stem = "chunk"): string {
  const extension = extensionForAudioMime(mimeType) ?? "webm";
  return `${stem}.${extension}`;
}

export function extensionFromFilename(filename: string): GroqAudioExtension | null {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename.trim());
  if (!match) {
    return null;
  }
  const extension = match[1].toLowerCase();
  return (GROQ_AUDIO_EXTENSIONS as readonly string[]).includes(extension)
    ? (extension as GroqAudioExtension)
    : null;
}
