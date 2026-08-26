import type { TranscriptionDevice } from "@/features/sessions/transcription/device-capability";

export interface LocalModelConfig {
  device: "webgpu" | "wasm";
  modelId: string;
  /** Hybrid quantization (encoder fp32 + decoder q4). q8 hallucinates in
   * loops with unstable WER between runs on pt-BR audio — see
   * docs/23-transcription-spike-results.md §4.1. Never use q8 here. */
  dtype: { encoder_model: "fp32"; decoder_model_merged: "q4" };
  /** WER measured against the pt-BR spike corpus (docs/23), for UI copy. */
  approxWerLabel: string;
}

const HYBRID_DTYPE = { encoder_model: "fp32", decoder_model_merged: "q4" } as const;

/**
 * Model selection is capability-based, not fixed: `turbo` needs WebGPU to
 * stay above real-time (docs/23 §3 extrapolates ~0.6x on WASM, i.e. it falls
 * behind a live session), so the WASM fallback uses `small`, which the spike
 * measured at 1.44x real-time / 15.1% WER even on 4 vCPU with no GPU.
 */
export function selectLocalModel(device: TranscriptionDevice): LocalModelConfig | null {
  if (device === "webgpu") {
    return {
      device: "webgpu",
      modelId: "onnx-community/whisper-large-v3-turbo",
      dtype: HYBRID_DTYPE,
      approxWerLabel: "~6%",
    };
  }
  if (device === "wasm") {
    return {
      device: "wasm",
      modelId: "onnx-community/whisper-small",
      dtype: HYBRID_DTYPE,
      approxWerLabel: "~15%",
    };
  }
  return null;
}
