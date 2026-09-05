import { describe, expect, it } from "vitest";
import { selectSupportedRecordingMimeType } from "@/features/sessions/transcription/mime-negotiation";
import { buildProgressiveAudioConstraints } from "@/features/sessions/transcription/audio-constraints";

describe("MIME negotiation for Chrome-family Android recorders", () => {
  it("aceita audio/mp4 quando o browser anuncia só esse container", () => {
    expect(
      selectSupportedRecordingMimeType(
        (type) => type === "audio/mp4" || type === "audio/ogg",
      ),
    ).toBe("audio/mp4");
  });

  it("não assume webm quando o browser não declara suporte", () => {
    expect(selectSupportedRecordingMimeType(() => false)).toBeUndefined();
  });
});

describe("progressive audio constraints", () => {
  it("nunca usa exact em propriedades opcionais", () => {
    const constraints = buildProgressiveAudioConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(JSON.stringify(constraints)).not.toContain("exact");
    expect(constraints.echoCancellation).toEqual({ ideal: true });
  });
});
