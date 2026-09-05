import { describe, expect, it } from "vitest";
import {
  isMediaRecorderAvailable,
  selectSupportedRecordingMimeType,
} from "@/features/sessions/transcription/mime-negotiation";
import { buildProgressiveAudioConstraints } from "@/features/sessions/transcription/audio-constraints";
import { nextTranscriptSequence } from "@/features/sessions/transcription/audio-chunk";

describe("selectSupportedRecordingMimeType", () => {
  it("escolhe webm opus quando o Chromium declara suporte", () => {
    expect(
      selectSupportedRecordingMimeType((type) => type === "audio/webm;codecs=opus"),
    ).toBe("audio/webm;codecs=opus");
  });

  it("escolhe mp4 no estilo Safari quando webm não é suportado", () => {
    expect(
      selectSupportedRecordingMimeType((type) => type === "audio/mp4"),
    ).toBe("audio/mp4");
  });

  it("não assume um MIME quando nenhum candidato é suportado", () => {
    expect(selectSupportedRecordingMimeType(() => false)).toBeUndefined();
  });
});

describe("isMediaRecorderAvailable", () => {
  it("é falso quando a API não existe", () => {
    expect(isMediaRecorderAvailable(undefined)).toBe(false);
  });
});

describe("buildProgressiveAudioConstraints", () => {
  it("só inclui propriedades anunciadas e nunca usa exact", () => {
    const constraints = buildProgressiveAudioConstraints({
      echoCancellation: true,
      channelCount: true,
    });
    expect(constraints.echoCancellation).toEqual({ ideal: true });
    expect(constraints.channelCount).toEqual({ ideal: 1 });
    expect(constraints.noiseSuppression).toBeUndefined();
    expect(JSON.stringify(constraints)).not.toContain("exact");
  });
});

describe("nextTranscriptSequence", () => {
  it("não recomeça em 0 quando já existem segmentos", () => {
    expect(nextTranscriptSequence([0, 2, 1])).toBe(3);
    expect(nextTranscriptSequence([])).toBe(0);
  });
});
