import type { LocalModelConfig } from "@/features/sessions/transcription/model-catalog";

// Thin wrapper around @huggingface/transformers so the rest of the feature
// never imports it directly — swapping the on-device runtime later costs
// this one file, not a search-and-replace across the feature
// (docs/22-transcription-provider-decision.md §5, TranscriptionProvider port).
export interface LocalTranscriber {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{ text: string }>;
}

export interface LoadLocalTranscriberOptions {
  /** Reports 0-100 as each required file downloads (model + WASM runtime). */
  onProgress?: (progress: { file: string; percent: number }) => void;
}

export async function loadLocalTranscriber(
  model: LocalModelConfig,
  options: LoadLocalTranscriberOptions = {},
): Promise<LocalTranscriber> {
  const { pipeline, env } = await import("@huggingface/transformers");
  // Never resolve models from a local path — always the published weights,
  // fetched over HTTPS and cached by the browser (docs/23 §5: this is the
  // exact traffic the no-audio-egress check allowlists).
  env.allowLocalModels = false;

  // Self-hosted, same-origin ONNX Runtime Web assets (scripts/copy-onnx-wasm.mjs)
  // — required for /session's Cross-Origin-Embedder-Policy: require-corp to
  // not break WASM worker construction, since the CDN default doesn't send
  // Cross-Origin-Resource-Policy (confirmed against this pinned
  // onnxruntime-web version, see the script's header comment).
  if (env.backends.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = "/ort/";
  }

  const transcriber = await pipeline("automatic-speech-recognition", model.modelId, {
    dtype: model.dtype,
    device: model.device,
    progress_callback: options.onProgress
      ? (event: { status: string; file?: string; progress?: number }) => {
          if (event.status === "progress" && event.file && event.progress !== undefined) {
            options.onProgress?.({ file: event.file, percent: Math.round(event.progress) });
          }
        }
      : undefined,
  });

  return (audio, generateOptions) =>
    transcriber(audio, generateOptions) as unknown as Promise<{ text: string }>;
}
