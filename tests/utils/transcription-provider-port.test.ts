import { describe, expect, it } from "vitest";
import { TRANSCRIPTION_PROVIDER_IDS } from "@/features/sessions/transcription/provider";
import { TRANSCRIPT_PROVIDER_VALUES } from "@/features/sessions/contracts";

describe("TranscriptionProvider port — vocabulário consistente", () => {
  it("os IDs do port batem com o enum de provider aceito pelo banco (session_transcript_segments)", () => {
    expect([...TRANSCRIPTION_PROVIDER_IDS].sort()).toEqual(
      [...TRANSCRIPT_PROVIDER_VALUES].sort(),
    );
  });
});
