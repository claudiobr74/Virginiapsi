/**
 * Downmixes to mono (channel average) and resamples to the target rate via
 * linear interpolation. This is not audiophile-grade resampling, but it is
 * more than sufficient for speech going into an ASR model — the same
 * tradeoff typical browser-based Whisper demos make when they don't pull in
 * a dedicated resampler library.
 */
export function resampleToMono16k(
  channelData: Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = 16000,
): Float32Array {
  const channels = channelData.length;
  const sourceLength = channelData[0]?.length ?? 0;

  const mono = new Float32Array(sourceLength);
  for (let i = 0; i < sourceLength; i += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += channelData[channel][i];
    }
    mono[i] = sum / channels;
  }

  if (sourceSampleRate === targetSampleRate) {
    return mono;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.round(sourceLength / ratio);
  const resampled = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i += 1) {
    const sourceIndex = i * ratio;
    const lower = Math.floor(sourceIndex);
    const upper = Math.min(lower + 1, sourceLength - 1);
    const weight = sourceIndex - lower;
    resampled[i] = mono[lower] * (1 - weight) + mono[upper] * weight;
  }

  return resampled;
}
