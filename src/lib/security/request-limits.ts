export const BODY_LIMIT_BYTES = {
  twilioWebhook: 32 * 1024,
  jsonCapture: 64 * 1024,
  jsonTranscribeMetadata: 16 * 1024,
  multipartAudioChunk: 4 * 1024 * 1024,
} as const;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function contentLengthExceeds(headers: Headers, maxBytes: number): boolean {
  const raw = headers.get("content-length");
  if (raw === null) {
    return false;
  }

  const length = Number.parseInt(raw, 10);
  return !Number.isFinite(length) || length < 0 || length > maxBytes;
}

export async function readLimitedText(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; status: 413 }> {
  if (contentLengthExceeds(request.headers, maxBytes)) {
    return { ok: false, status: 413 };
  }

  const text = await request.text();
  if (utf8ByteLength(text) > maxBytes) {
    return { ok: false, status: 413 };
  }

  return { ok: true, text };
}

export async function readLimitedJson(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const limited = await readLimitedText(request, maxBytes);
  if (!limited.ok) {
    return limited;
  }

  if (limited.text.trim() === "") {
    return { ok: true, value: null };
  }

  try {
    return { ok: true, value: JSON.parse(limited.text) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}
