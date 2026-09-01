export const SEGMENT_PERSISTENCE_WARNING =
  "Um trecho não pôde ser salvo. A transcrição continua.";

export type PersistSessionSegmentInput = {
  grant: string;
  sessionId: string;
  patientId: string;
  sequence: number;
  text: string;
  isFinal: true;
  startMs: number;
  endMs: number;
  provider: "local-webgpu" | "local-wasm";
};

export type PersistSessionSegmentResult =
  | { ok: true; duplicate: boolean }
  | { ok: false };

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

async function readDuplicateFlag(response: Response): Promise<boolean> {
  try {
    const body = (await response.clone().json()) as { duplicate?: unknown };
    return body.duplicate === true;
  } catch {
    return false;
  }
}

async function postSegment(
  input: PersistSessionSegmentInput,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl("/api/session-capture/segment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/**
 * Persists one transcribed chunk. Retries at most once, and only for network
 * failure or 5xx. 400/403/404 are never retried. A server `duplicate: true`
 * is success (idempotent session_id + sequence).
 */
export async function persistSessionSegment(
  input: PersistSessionSegmentInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PersistSessionSegmentResult> {
  let response: Response | undefined;
  let networkFailure = false;

  try {
    response = await postSegment(input, fetchImpl);
  } catch {
    networkFailure = true;
  }

  if (networkFailure || (response !== undefined && isRetryableStatus(response.status))) {
    try {
      response = await postSegment(input, fetchImpl);
    } catch {
      return { ok: false };
    }
  }

  if (!response || !response.ok) {
    return { ok: false };
  }

  return { ok: true, duplicate: await readDuplicateFlag(response) };
}
