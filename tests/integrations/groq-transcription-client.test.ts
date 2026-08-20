import { describe, expect, it } from "vitest";
import {
  GROQ_TRANSCRIPTION_MODEL,
  GroqApiError,
  GroqTranscriptionClient,
} from "@/lib/integrations/transcription/groq-client";
import { mockFetch } from "./support/mock-fetch";

describe("GroqTranscriptionClient", () => {
  it("envia multipart com o modelo Whisper turbo e o Bearer token", async () => {
    const fetchImpl = mockFetch(
      async () => new Response(JSON.stringify({ text: "Olá, tudo bem?" }), { status: 200 }),
    );
    const client = new GroqTranscriptionClient({ apiKey: "groq-key", fetchImpl });

    const result = await client.transcribe(new Blob(["audio"]), "chunk.webm", {
      language: "pt",
    });

    expect(result.text).toBe("Olá, tudo bem?");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer groq-key");
    const form = init?.body as FormData;
    expect(form.get("model")).toBe(GROQ_TRANSCRIPTION_MODEL);
    expect(form.get("language")).toBe("pt");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("lança GroqApiError em resposta de erro", async () => {
    const fetchImpl = mockFetch(async () => new Response("bad request", { status: 400 }));
    const client = new GroqTranscriptionClient({ apiKey: "groq-key", fetchImpl });

    await expect(client.transcribe(new Blob(["x"]), "a.webm")).rejects.toBeInstanceOf(
      GroqApiError,
    );
  });

  it("não envia o parâmetro language quando não informado", async () => {
    const fetchImpl = mockFetch(async () => new Response(JSON.stringify({ text: "" }), { status: 200 }));
    const client = new GroqTranscriptionClient({ apiKey: "groq-key", fetchImpl });

    await client.transcribe(new Blob(["x"]), "a.webm");

    const [, init] = fetchImpl.mock.calls[0];
    const form = init?.body as FormData;
    expect(form.get("language")).toBeNull();
  });
});
