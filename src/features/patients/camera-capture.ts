export type CameraUiState =
  | "idle"
  | "requesting_permission"
  | "streaming"
  | "capturing"
  | "error";

export function isCameraApiAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function cameraErrorMessage(error: unknown): string {
  const name =
    error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? error.name
        : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "A permissão da câmera foi negada. Você pode enviar um arquivo.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nenhuma câmera foi encontrada neste dispositivo.";
    case "NotReadableError":
    case "TrackStartError":
      return "A câmera está ocupada ou indisponível. Feche outros aplicativos e tente de novo.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Esta câmera não atende aos requisitos. Tente enviar um arquivo.";
    case "SecurityError":
      return "O navegador bloqueou a câmera neste contexto. Use HTTPS ou envie um arquivo.";
    case "TimeoutError":
      return "A câmera demorou para ficar pronta. Tente de novo ou envie um arquivo.";
    case "NotSupportedError":
    case "TypeError":
      return "Este navegador não permite abrir a câmera aqui. Você pode enviar um arquivo.";
    default:
      return "Não foi possível acessar a câmera. Você pode enviar um arquivo.";
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function isVideoFrameReady(video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">): boolean {
  return video.videoWidth > 0 && video.videoHeight > 0;
}

export async function requestCameraStream(): Promise<MediaStream> {
  const preferred: MediaStreamConstraints = {
    video: { facingMode: { ideal: "user" } },
    audio: false,
  };
  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw error;
    }
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "NotFoundError") {
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw error;
  }
}

export async function playCameraVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch {
    // Autoplay can reject even when muted; metadata events still fire.
  }
}

export function waitForVideoReady(
  video: HTMLVideoElement,
  timeoutMs = 8_000,
): Promise<void> {
  if (isVideoFrameReady(video)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      const error = new Error("TimeoutError");
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);

    const onReady = () => {
      if (!isVideoFrameReady(video)) {
        return;
      }
      cleanup();
      resolve();
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
    };

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    onReady();
  });
}

export function captureSquareJpeg(
  video: HTMLVideoElement,
  quality = 0.86,
): Promise<Blob> {
  if (!isVideoFrameReady(video)) {
    return Promise.reject(new Error("VideoNotReady"));
  }
  const side = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - side) / 2;
  const sy = (video.videoHeight - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("CanvasUnavailable"));
  }
  context.drawImage(video, sx, sy, side, side, 0, 0, 720, 720);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("BlobNull"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}
