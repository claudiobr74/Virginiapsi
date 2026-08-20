// "unsupported" is reserved for when even the WASM pipeline fails to load
// (e.g. no WebAssembly at all) — that failure can only be observed by trying
// to load the model, not predicted in advance, so callers set it themselves
// after a failed load rather than getting it from detectTranscriptionDevice().
export type TranscriptionDevice = "webgpu" | "wasm" | "unsupported";

export interface GpuLike {
  requestAdapter: () => Promise<unknown>;
}

/**
 * `navigator.gpu` existing does NOT mean WebGPU is usable: on a machine
 * without a real GPU the object exists and `requestAdapter()` resolves to
 * `null`, which then breaks model initialization later if not checked here
 * first (found the hard way in the spike — docs/23-transcription-spike-results.md
 * §4). The only reliable check is requesting the adapter.
 */
export async function detectTranscriptionDevice(
  gpu: GpuLike | undefined | null,
): Promise<"webgpu" | "wasm"> {
  if (!gpu) {
    return "wasm";
  }
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}
