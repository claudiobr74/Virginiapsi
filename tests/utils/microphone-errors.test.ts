import { describe, expect, it } from "vitest";
import { mapGetUserMediaError, MEDIA_RECORDER_UNSUPPORTED_MESSAGE } from "@/features/sessions/transcription/microphone-errors";

describe("mapGetUserMediaError", () => {
  it("mapeia permissão negada sem ensinar um navegador específico", () => {
    const mapped = mapGetUserMediaError(new DOMException("denied", "NotAllowedError"));
    expect(mapped.code).toBe("permission_denied");
    expect(mapped.message).toContain("microfone");
    expect(mapped.message).not.toMatch(/Safari|Chrome|Android/i);
  });
});

describe("MEDIA_RECORDER_UNSUPPORTED_MESSAGE", () => {
  it("oferece importação quando não há MediaRecorder", () => {
    expect(MEDIA_RECORDER_UNSUPPORTED_MESSAGE).toMatch(/importe uma gravação/i);
  });
});
