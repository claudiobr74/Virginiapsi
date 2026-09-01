import { describe, expect, it, vi } from "vitest";
import { pickSupportedRecorderMimeType } from "@/features/sessions/transcription/chunked-mic-capture";
import { unlockAudioContext } from "@/features/sessions/transcription/unlock-audio-context";

describe("pickSupportedRecorderMimeType", () => {
  it("escolhe o primeiro tipo suportado, incluindo audio/mp4 do Chrome Android", () => {
    expect(
      pickSupportedRecorderMimeType(
        (type) => type === "audio/mp4" || type === "audio/ogg",
      ),
    ).toBe("audio/mp4");
  });

  it("cai no default do browser quando nenhum candidato é suportado", () => {
    expect(pickSupportedRecorderMimeType(() => false)).toBeUndefined();
  });
});

describe("unlockAudioContext", () => {
  it("resume o contexto suspenso criado no gesto do usuário", async () => {
    const resume = vi.fn(async () => undefined);
    const context = {
      state: "suspended" as AudioContextState,
      resume,
    };
    const unlocked = await unlockAudioContext(
      () => context as unknown as AudioContext,
    );
    expect(resume).toHaveBeenCalledTimes(1);
    expect(unlocked).toBe(context);
  });

  it("não chama resume quando o contexto já está running", async () => {
    const resume = vi.fn(async () => undefined);
    await unlockAudioContext(
      () =>
        ({
          state: "running",
          resume,
        }) as unknown as AudioContext,
    );
    expect(resume).not.toHaveBeenCalled();
  });
});
