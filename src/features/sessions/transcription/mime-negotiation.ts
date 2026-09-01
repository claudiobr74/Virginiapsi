/**
 * Capability negotiation for MediaRecorder. Never branch on user-agent.
 * Order matches observed Chromium (webm/opus) then Safari-family (mp4).
 */
export const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export function isMediaRecorderAvailable(
  recorder: unknown = typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
): recorder is typeof MediaRecorder {
  return typeof recorder === "function";
}

export function selectSupportedRecordingMimeType(
  isTypeSupported: (type: string) => boolean = (type) =>
    isMediaRecorderAvailable() && MediaRecorder.isTypeSupported(type),
): string | undefined {
  return RECORDING_MIME_CANDIDATES.find((type) => isTypeSupported(type));
}

export function createSessionMediaRecorder(stream: MediaStream): MediaRecorder {
  if (!isMediaRecorderAvailable()) {
    throw new Error("media_recorder_unavailable");
  }

  const mimeType = selectSupportedRecordingMimeType();
  try {
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    return new MediaRecorder(stream);
  }
}
