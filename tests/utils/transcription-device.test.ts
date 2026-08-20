import { describe, expect, it } from "vitest";
import { detectTranscriptionDevice } from "@/features/sessions/transcription/device-capability";
import { selectLocalModel } from "@/features/sessions/transcription/model-catalog";

describe("detectTranscriptionDevice", () => {
  it("retorna wasm quando não há navigator.gpu", async () => {
    expect(await detectTranscriptionDevice(undefined)).toBe("wasm");
    expect(await detectTranscriptionDevice(null)).toBe("wasm");
  });

  it("retorna wasm quando requestAdapter resolve null (GPU objeto existe, sem GPU real)", async () => {
    const device = await detectTranscriptionDevice({
      requestAdapter: async () => null,
    });
    expect(device).toBe("wasm");
  });

  it("retorna webgpu quando requestAdapter resolve um adapter", async () => {
    const device = await detectTranscriptionDevice({
      requestAdapter: async () => ({ fake: "adapter" }),
    });
    expect(device).toBe("webgpu");
  });

  it("retorna wasm quando requestAdapter rejeita", async () => {
    const device = await detectTranscriptionDevice({
      requestAdapter: async () => {
        throw new Error("boom");
      },
    });
    expect(device).toBe("wasm");
  });
});

describe("selectLocalModel", () => {
  it("escolhe whisper-large-v3-turbo com WebGPU", () => {
    const model = selectLocalModel("webgpu");
    expect(model?.modelId).toBe("onnx-community/whisper-large-v3-turbo");
    expect(model?.dtype).toEqual({ encoder_model: "fp32", decoder_model_merged: "q4" });
  });

  it("escolhe whisper-small com WASM (turbo cairia abaixo do tempo real)", () => {
    const model = selectLocalModel("wasm");
    expect(model?.modelId).toBe("onnx-community/whisper-small");
  });

  it("nunca seleciona quantização q8 (aluciona e é instável — docs/23)", () => {
    for (const device of ["webgpu", "wasm"] as const) {
      const model = selectLocalModel(device);
      expect(model?.dtype.encoder_model).toBe("fp32");
      expect(model?.dtype.decoder_model_merged).toBe("q4");
    }
  });

  it("retorna null para device não suportado", () => {
    expect(selectLocalModel("unsupported")).toBeNull();
  });
});
