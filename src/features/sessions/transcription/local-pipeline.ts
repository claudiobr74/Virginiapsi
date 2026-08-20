import type { LocalModelConfig } from "@/features/sessions/transcription/model-catalog";

// Thin wrapper around @huggingface/transformers so the rest of the feature
// never imports it directly — swapping the on-device runtime later costs
// this one file, not a search-and-replace across the feature
// (docs/22-transcription-provider-decision.md §5, TranscriptionProvider port).
export interface LocalTranscriber {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{ text: string }>;
}

export async function loadLocalTranscriber(
  model: LocalModelConfig,
): Promise<LocalTranscriber> {
  const { pipeline, env } = await import("@huggingface/transformers");
  // Never resolve models from a local path — always the published weights,
  // fetched over HTTPS and cached by the browser (docs/23 §5: this is the
  // exact traffic the no-audio-egress check allowlists).
  env.allowLocalModels = false;

  const transcriber = await pipeline("automatic-speech-recognition", model.modelId, {
    dtype: model.dtype,
    device: model.device,
  });

  return (audio, options) =>
    transcriber(audio, options) as unknown as Promise<{ text: string }>;
}
