/**
 * Progressive getUserMedia constraints. Optional keys use `ideal`, never
 * `exact`, so a device that lacks echoCancellation still opens.
 */
export function buildProgressiveAudioConstraints(
  supported: Record<string, boolean> | MediaTrackSupportedConstraints = {},
): MediaTrackConstraints {
  const flags = supported as Record<string, boolean | undefined>;
  const audio: MediaTrackConstraints = {};

  if (flags.echoCancellation) {
    audio.echoCancellation = { ideal: true };
  }
  if (flags.noiseSuppression) {
    audio.noiseSuppression = { ideal: true };
  }
  if (flags.autoGainControl) {
    audio.autoGainControl = { ideal: true };
  }
  if (flags.channelCount) {
    audio.channelCount = { ideal: 1 };
  }

  return audio;
}

export function readSupportedAudioConstraints(
  mediaDevices: Pick<MediaDevices, "getSupportedConstraints"> | undefined,
): MediaTrackSupportedConstraints {
  try {
    return mediaDevices?.getSupportedConstraints() ?? {};
  } catch {
    return {};
  }
}
