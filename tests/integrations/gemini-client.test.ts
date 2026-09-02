import { describe, expect, it } from "vitest";
import { GeminiApiError, GeminiClient, GeminiTimeoutError } from "@/lib/integrations/gemini/client";
import { mockFetch } from "./support/mock-fetch";

const SCHEMA = { type: "object", properties: { text: { type: "string" } } };

function successResponse(text: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200 },
  );
}

describe("GeminiClient.generateStructured", () => {
  it("chama generateContent com o modelo na URL, o header de auth e o schema no generationConfig", async () => {
    const fetchImpl = mockFetch(async () => successResponse(JSON.stringify({ ok: true })));
    const client = new GeminiClient({ apiKey: "gemini-key", fetchImpl });

    const result = await client.generateStructured({
      model: "gemini-2.5-flash",
      systemInstruction: "system prompt",
      userContent: "user content",
      responseJsonSchema: SCHEMA,
    });

    expect(result).toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("gemini-key");
    const body = JSON.parse(init?.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("system prompt");
    expect(body.contents[0].parts[0].text).toBe("user content");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toEqual(SCHEMA);
  });

  it("nunca envia a API key na URL", async () => {
    const fetchImpl = mockFetch(async () => successResponse("{}"));
    const client = new GeminiClient({ apiKey: "super-secret", fetchImpl });
    await client.generateStructured({
      model: "gemini-2.5-flash",
      systemInstruction: "s",
      userContent: "u",
      responseJsonSchema: SCHEMA,
    });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).not.toContain("super-secret");
  });

  it("lança GeminiApiError em resposta HTTP não-ok", async () => {
    const fetchImpl = mockFetch(async () => new Response("error", { status: 500 }));
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(
      client.generateStructured({
        model: "m",
        systemInstruction: "s",
        userContent: "u",
        responseJsonSchema: SCHEMA,
      }),
    ).rejects.toBeInstanceOf(GeminiApiError);
  });

  it("falha fechado quando não há texto nos candidates", async () => {
    const fetchImpl = mockFetch(
      async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    );
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(
      client.generateStructured({
        model: "m",
        systemInstruction: "s",
        userContent: "u",
        responseJsonSchema: SCHEMA,
      }),
    ).rejects.toBeInstanceOf(GeminiApiError);
  });

  it("falha fechado quando o texto retornado não é JSON válido", async () => {
    const fetchImpl = mockFetch(async () => successResponse("not json { at all"));
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(
      client.generateStructured({
        model: "m",
        systemInstruction: "s",
        userContent: "u",
        responseJsonSchema: SCHEMA,
      }),
    ).rejects.toBeInstanceOf(GeminiApiError);
  });

  it("aceita JSON envolto em cerca markdown", async () => {
    const fetchImpl = mockFetch(
      async () => successResponse("```json\n{\"ok\":true}\n```"),
    );
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(
      client.generateStructured({
        model: "m",
        systemInstruction: "s",
        userContent: "u",
        responseJsonSchema: SCHEMA,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("estoura GeminiTimeoutError quando o provider não responde", async () => {
    const fetchImpl = mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(
      client.generateStructured({
        model: "m",
        systemInstruction: "s",
        userContent: "u",
        responseJsonSchema: SCHEMA,
        timeoutMs: 30,
      }),
    ).rejects.toBeInstanceOf(GeminiTimeoutError);
  });
});
