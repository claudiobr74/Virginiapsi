import { describe, expect, it, vi } from "vitest";
import {
  persistSessionSegment,
  SEGMENT_PERSISTENCE_WARNING,
} from "@/features/sessions/transcription/persist-session-segment";

const input = {
  grant: "fake-grant.sig",
  sessionId: "11111111-1111-4111-8111-111111111111",
  patientId: "22222222-2222-4222-8222-222222222222",
  sequence: 0,
  text: "Trecho no dispositivo.",
  isFinal: true as const,
  startMs: 0,
  endMs: 1500,
  provider: "local-webgpu" as const,
};

describe("persistSessionSegment", () => {
  it("trata 200 como persistido", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(persistSessionSegment(input, fetchImpl)).resolves.toEqual({
      ok: true,
      duplicate: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("trata duplicate: true como sucesso", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 }),
    );
    await expect(persistSessionSegment(input, fetchImpl)).resolves.toEqual({
      ok: true,
      duplicate: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reexecuta uma vez em 5xx e sucede no retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "persist_failed" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(persistSessionSegment(input, fetchImpl)).resolves.toEqual({
      ok: true,
      duplicate: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("não retenta 403", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 403 }),
    );
    await expect(persistSessionSegment(input, fetchImpl)).resolves.toEqual({ ok: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("não retenta 400 nem 404", async () => {
    const badRequest = vi.fn(
      async () => new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 }),
    );
    await expect(persistSessionSegment(input, badRequest)).resolves.toEqual({ ok: false });
    expect(badRequest).toHaveBeenCalledTimes(1);

    const notFound = vi.fn(
      async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
    );
    await expect(persistSessionSegment(input, notFound)).resolves.toEqual({ ok: false });
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("reexecuta uma vez em falha de rede e para no segundo throw", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network");
    });
    await expect(persistSessionSegment(input, fetchImpl)).resolves.toEqual({ ok: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reexecuta uma vez em falha de rede e sucede no retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 }));

    await expect(persistSessionSegment(input, fetchImpl)).resolves.toEqual({
      ok: true,
      duplicate: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("expõe o aviso canônico de persistência", () => {
    expect(SEGMENT_PERSISTENCE_WARNING).toBe(
      "Um trecho não pôde ser salvo. A transcrição continua.",
    );
  });
});
