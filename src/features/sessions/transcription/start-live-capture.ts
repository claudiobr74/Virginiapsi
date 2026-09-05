import type { CaptureLock } from "@/features/sessions/transcription/capture-lock";
import type { SessionCaptureState } from "@/features/sessions/transcription/constants";
import {
  CAPTURE_GRANT_FALLBACK_MESSAGE,
  readCaptureGrantErrorMessage,
} from "@/features/sessions/transcription/grant-error-message";
import {
  MEDIA_RECORDER_UNSUPPORTED_MESSAGE,
  mapGetUserMediaError,
} from "@/features/sessions/transcription/microphone-errors";
import { isMediaRecorderAvailable } from "@/features/sessions/transcription/mime-negotiation";
import {
  buildProgressiveAudioConstraints,
  readSupportedAudioConstraints,
} from "@/features/sessions/transcription/audio-constraints";

export const SESSION_LOCKED_ELSEWHERE_MESSAGE =
  "Esta sessão já está sendo transcrita em outra aba.";

export type LiveGrantRequestResult =
  | { ok: true; status: number; grant: string }
  | { ok: false; status: number; message: string };

export type StartLiveCaptureSuccess = {
  ok: true;
  grant: string;
  stream: MediaStream;
  lock: CaptureLock;
};

export type StartLiveCaptureFailure = {
  ok: false;
  message: string;
};

export type StartLiveCaptureResult = StartLiveCaptureSuccess | StartLiveCaptureFailure;

export interface StartLiveCaptureDeps {
  sessionId: string;
  patientId: string;
  isMediaRecorderAvailable?: () => boolean;
  acquireLock: (sessionId: string) => Promise<CaptureLock | null>;
  requestGrant: (input: { patientId: string; sessionId: string }) => Promise<LiveGrantRequestResult>;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  mediaDevices?: Pick<MediaDevices, "getSupportedConstraints">;
  onState: (state: SessionCaptureState) => void;
}

export async function fetchLiveTranscriptionGrant(
  patientId: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveGrantRequestResult> {
  try {
    const response = await fetchImpl("/api/session-capture/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, sessionId }),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await readCaptureGrantErrorMessage(response),
      };
    }
    const body = (await response.json()) as { grant?: unknown };
    if (typeof body.grant !== "string" || body.grant.length === 0) {
      return { ok: false, status: response.status, message: CAPTURE_GRANT_FALLBACK_MESSAGE };
    }
    return { ok: true, status: response.status, grant: body.grant };
  } catch {
    return { ok: false, status: 0, message: CAPTURE_GRANT_FALLBACK_MESSAGE };
  }
}

/**
 * Lock → grant (auth/RBAC/consent) → getUserMedia.
 * getUserMedia is never called unless the grant succeeded.
 */
export async function startLiveCaptureSession(
  deps: StartLiveCaptureDeps,
): Promise<StartLiveCaptureResult> {
  const mediaRecorderOk = deps.isMediaRecorderAvailable ?? isMediaRecorderAvailable;
  if (!mediaRecorderOk()) {
    return { ok: false, message: MEDIA_RECORDER_UNSUPPORTED_MESSAGE };
  }

  deps.onState("authorizing");
  const lock = await deps.acquireLock(deps.sessionId);
  if (!lock) {
    return { ok: false, message: SESSION_LOCKED_ELSEWHERE_MESSAGE };
  }

  const grantResult = await deps.requestGrant({
    patientId: deps.patientId,
    sessionId: deps.sessionId,
  });
  if (!grantResult.ok) {
    await lock.release().catch(() => undefined);
    return { ok: false, message: grantResult.message };
  }

  deps.onState("requesting_microphone");
  try {
    const supported = readSupportedAudioConstraints(deps.mediaDevices);
    const stream = await deps.getUserMedia({
      audio: buildProgressiveAudioConstraints(supported),
      video: false,
    });
    return { ok: true, grant: grantResult.grant, stream, lock };
  } catch (error) {
    await lock.release().catch(() => undefined);
    return { ok: false, message: mapGetUserMediaError(error).message };
  }
}
