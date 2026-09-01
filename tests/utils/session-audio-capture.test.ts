import { describe, expect, it } from "vitest";
import { SessionAudioCapture } from "@/features/sessions/transcription/session-audio-capture";

class FakeRecorder {
  mimeType = "audio/webm";
  state: RecordingState = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
    });
    this.onstop?.();
  }
}

describe("SessionAudioCapture", () => {
  it("emite o chunk final ao parar, sem esperar o Groq", async () => {
    const slices: { mimeType: string; startMs: number; endMs: number }[] = [];
    let now = 0;
    const capture = new SessionAudioCapture({
      stream: {} as MediaStream,
      chunkMs: 15_000,
      now: () => now,
      createRecorder: () => new FakeRecorder() as unknown as MediaRecorder,
      onChunk: (slice) => slices.push(slice),
      onError: () => undefined,
    });

    capture.start();
    now = 1_200;
    await capture.stop();

    expect(slices).toHaveLength(1);
    expect(slices[0]?.mimeType).toBe("audio/webm");
    expect(slices[0]?.endMs).toBeGreaterThanOrEqual(slices[0]?.startMs ?? 0);
  });
});
