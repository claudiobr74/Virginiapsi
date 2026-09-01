export const CAPTURE_GRANT_FALLBACK_MESSAGE =
  "Não foi possível autorizar a transcrição agora.";

export function messageFromCaptureGrantBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("message" in body)) {
    return null;
  }
  const message = (body as { message: unknown }).message;
  if (typeof message !== "string") {
    return null;
  }
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function readCaptureGrantErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    return messageFromCaptureGrantBody(body) ?? CAPTURE_GRANT_FALLBACK_MESSAGE;
  } catch {
    return CAPTURE_GRANT_FALLBACK_MESSAGE;
  }
}
