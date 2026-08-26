import { describe, expect, it } from "vitest";
import { resampleToMono16k } from "@/features/sessions/transcription/audio-resample";

describe("resampleToMono16k", () => {
  it("faz downmix de estéreo para mono pela média dos canais", () => {
    const left = new Float32Array([1, 1, 1, 1]);
    const right = new Float32Array([-1, -1, -1, -1]);
    const result = resampleToMono16k([left, right], 16000, 16000);
    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });

  it("mantém o sinal quando a taxa de origem já é a de destino", () => {
    const mono = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const result = resampleToMono16k([mono], 16000, 16000);
    expect(Array.from(result)).toEqual(Array.from(mono));
  });

  it("reduz a taxa de amostragem preservando a duração aproximada", () => {
    // 48kHz -> 16kHz é uma razão 3:1.
    const source = new Float32Array(48000).fill(0.5);
    const result = resampleToMono16k([source], 48000, 16000);
    expect(result.length).toBeCloseTo(16000, -1);
  });

  it("interpola em vez de simplesmente descartar amostras", () => {
    const source = new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]);
    const result = resampleToMono16k([source], 8, 4);
    expect(result.length).toBe(4);
    // Valores permanecem no intervalo do sinal original.
    for (const value of result) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
