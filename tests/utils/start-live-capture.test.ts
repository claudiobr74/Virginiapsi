import { describe, expect, it, vi } from "vitest";
import {
  fetchLiveTranscriptionGrant,
  startLiveCaptureSession,
} from "@/features/sessions/transcription/start-live-capture";
import { MEDIA_RECORDER_UNSUPPORTED_MESSAGE } from "@/features/sessions/transcription/microphone-errors";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";

function stream(): MediaStream {
  return { getTracks: () => [] } as unknown as MediaStream;
}

describe("startLiveCaptureSession — ordem lock → grant → getUserMedia", () => {
  it("grant 403 não chama getUserMedia e libera o lock", async () => {
    const events: string[] = [];
    const release = vi.fn(async () => undefined);
    const getUserMedia = vi.fn(async () => stream());
    const result = await startLiveCaptureSession({
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      isMediaRecorderAvailable: () => true,
      acquireLock: async () => {
        events.push("lock");
        return { release };
      },
      requestGrant: async () => {
        events.push("grant");
        return { ok: false, status: 403, message: "consent_outdated" };
      },
      getUserMedia,
      onState: () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(events).toEqual(["lock", "grant"]);
    expect(getUserMedia).toHaveBeenCalledTimes(0);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("grant 404 não chama getUserMedia", async () => {
    const getUserMedia = vi.fn(async () => stream());
    const result = await startLiveCaptureSession({
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      isMediaRecorderAvailable: () => true,
      acquireLock: async () => ({ release: async () => undefined }),
      requestGrant: async () => ({ ok: false, status: 404, message: "session_not_found" }),
      getUserMedia,
      onState: () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(0);
  });

  it("grant 500 não chama getUserMedia", async () => {
    const getUserMedia = vi.fn(async () => stream());
    const result = await startLiveCaptureSession({
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      isMediaRecorderAvailable: () => true,
      acquireLock: async () => ({ release: async () => undefined }),
      requestGrant: async () => ({ ok: false, status: 500, message: "internal" }),
      getUserMedia,
      onState: () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(0);
  });

  it("grant 200 chama getUserMedia uma vez, depois do grant", async () => {
    const events: string[] = [];
    const getUserMedia = vi.fn(async () => {
      events.push("gum");
      return stream();
    });
    const result = await startLiveCaptureSession({
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      isMediaRecorderAvailable: () => true,
      acquireLock: async () => {
        events.push("lock");
        return { release: async () => undefined };
      },
      requestGrant: async () => {
        events.push("grant");
        return { ok: true, status: 200, grant: "signed.grant" };
      },
      getUserMedia,
      onState: () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(events).toEqual(["lock", "grant", "gum"]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("lock indisponível não pede grant nem microfone", async () => {
    const requestGrant = vi.fn();
    const getUserMedia = vi.fn(async () => stream());
    const result = await startLiveCaptureSession({
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      isMediaRecorderAvailable: () => true,
      acquireLock: async () => null,
      requestGrant,
      getUserMedia,
      onState: () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(requestGrant).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(0);
  });

  it("grant OK e getUserMedia denied libera o lock e não captura", async () => {
    const release = vi.fn(async () => undefined);
    const result = await startLiveCaptureSession({
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      isMediaRecorderAvailable: () => true,
      acquireLock: async () => ({ release }),
      requestGrant: async () => ({ ok: true, status: 200, grant: "signed.grant" }),
      getUserMedia: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
      onState: () => undefined,
    });
    expect(result.ok).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
    if (!result.ok) {
      expect(result.message).toContain("microfone");
    }
  });

  it("MediaRecorder ausente não pede lock, grant nem microfone", async () => {
    const acquireLock = vi.fn();
    const requestGrant = vi.fn();
    const getUserMedia = vi.fn(async () => stream());
    const result = await startLiveCaptureSession({
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      isMediaRecorderAvailable: () => false,
      acquireLock,
      requestGrant,
      getUserMedia,
      onState: () => undefined,
    });
    expect(result).toEqual({ ok: false, message: MEDIA_RECORDER_UNSUPPORTED_MESSAGE });
    expect(acquireLock).not.toHaveBeenCalled();
    expect(requestGrant).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(0);
  });
});

describe("fetchLiveTranscriptionGrant", () => {
  it("propaga 403 sem inventar grant", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "consent_outdated", message: "outdated" }), {
          status: 403,
        }),
    ) as unknown as typeof fetch;
    const result = await fetchLiveTranscriptionGrant(PATIENT_ID, SESSION_ID, fetchImpl);
    expect(result).toEqual({ ok: false, status: 403, message: "outdated" });
  });
});
