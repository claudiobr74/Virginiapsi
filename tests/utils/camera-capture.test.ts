import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cameraErrorMessage,
  captureSquareJpeg,
  isCameraApiAvailable,
  isVideoFrameReady,
  requestCameraStream,
} from "@/features/patients/camera-capture";

describe("captura de câmera do retrato", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detecta API ausente ou contexto inseguro", () => {
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("navigator", {});
    expect(isCameraApiAvailable()).toBe(false);
  });

  it("traduz NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError e SecurityError", () => {
    expect(cameraErrorMessage(new DOMException("denied", "NotAllowedError"))).toMatch(
      /permissão da câmera foi negada/i,
    );
    expect(cameraErrorMessage(new DOMException("missing", "NotFoundError"))).toMatch(
      /nenhuma câmera/i,
    );
    expect(cameraErrorMessage(new DOMException("busy", "NotReadableError"))).toMatch(
      /ocupada/i,
    );
    expect(cameraErrorMessage(new DOMException("constraint", "OverconstrainedError"))).toMatch(
      /não atende/i,
    );
    expect(cameraErrorMessage(new DOMException("secure", "SecurityError"))).toMatch(/HTTPS/i);
  });

  it("recusa capturar antes do vídeo ter dimensões", async () => {
    const video = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    expect(isVideoFrameReady(video)).toBe(false);
    await expect(captureSquareJpeg(video)).rejects.toThrow("VideoNotReady");
  });

  it("não tenta fallback quando a permissão foi negada", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await expect(requestCameraStream()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("faz fallback para video:true quando a constraint é rejeitada", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("constraint", "OverconstrainedError"))
      .mockResolvedValueOnce(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await expect(requestCameraStream()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      video: { facingMode: { ideal: "user" } },
      audio: false,
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { video: true, audio: false });
  });

  it("rejeita blob nulo depois do vídeo estar pronto", async () => {
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (blob: Blob | null) => void) => cb(null),
    };
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }
      return original(tag);
    });
    await expect(captureSquareJpeg(video)).rejects.toThrow("BlobNull");
  });

  it("produz JPEG depois do vídeo estar pronto", async () => {
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (next: Blob | null) => void) => cb(blob),
    };
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }
      return original(tag);
    });
    await expect(captureSquareJpeg(video)).resolves.toBe(blob);
  });
});
