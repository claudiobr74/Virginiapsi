export function mapGetUserMediaError(error: unknown): { code: string; message: string } {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return {
      code: "permission_denied",
      message:
        "O VirgíniaPsi não conseguiu acessar o microfone. Verifique a permissão do navegador e tente novamente.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      code: "no_input_devices",
      message: "Nenhum microfone foi encontrado neste dispositivo.",
    };
  }
  if (name === "NotReadableError" || name === "AbortError" || name === "InvalidStateError") {
    return {
      code: "device_unavailable",
      message: "O microfone está indisponível neste momento. Tente novamente.",
    };
  }
  return {
    code: "microphone_error",
    message: "Não foi possível iniciar a captura de áudio.",
  };
}

export const MEDIA_RECORDER_UNSUPPORTED_MESSAGE =
  "Este navegador não oferece os recursos necessários para a transcrição em tempo real. Você ainda pode importar uma gravação da sessão.";
