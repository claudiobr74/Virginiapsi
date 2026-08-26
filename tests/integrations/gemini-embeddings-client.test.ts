import { describe, expect, it } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  GeminiEmbeddingsApiError,
  GeminiEmbeddingsClient,
} from "@/lib/integrations/gemini/embeddings-client";
import { mockFetch } from "./support/mock-fetch";

function fakeEmbedding(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (seed + i) / 1000);
}

describe("GeminiEmbeddingsClient.embedTexts", () => {
  it("chama batchEmbedContents com taskType e outputDimensionality corretos", async () => {
    const fetchImpl = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            embeddings: [{ values: fakeEmbedding(1) }, { values: fakeEmbedding(2) }],
          }),
          { status: 200 },
        ),
    );
    const client = new GeminiEmbeddingsClient({ apiKey: "gemini-key", fetchImpl });

    const result = await client.embedTexts("gemini-embedding-2", ["a", "b"], "RETRIEVAL_DOCUMENT");

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(EMBEDDING_DIMENSIONS);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents",
    );
    const body = JSON.parse(init?.body as string);
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0].taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(body.requests[0].outputDimensionality).toBe(768);
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("gemini-key");
  });

  it("retorna array vazio sem chamar a API quando não há textos", async () => {
    const fetchImpl = mockFetch(async () => new Response("{}", { status: 200 }));
    const client = new GeminiEmbeddingsClient({ apiKey: "k", fetchImpl });
    const result = await client.embedTexts("model", [], "RETRIEVAL_QUERY");
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falha fechado quando a API retorna erro HTTP", async () => {
    const fetchImpl = mockFetch(async () => new Response("error", { status: 500 }));
    const client = new GeminiEmbeddingsClient({ apiKey: "k", fetchImpl });
    await expect(client.embedTexts("model", ["x"], "RETRIEVAL_QUERY")).rejects.toBeInstanceOf(
      GeminiEmbeddingsApiError,
    );
  });

  it("falha fechado quando o número de embeddings não bate com o número de textos", async () => {
    const fetchImpl = mockFetch(
      async () => new Response(JSON.stringify({ embeddings: [{ values: fakeEmbedding(1) }] }), {
        status: 200,
      }),
    );
    const client = new GeminiEmbeddingsClient({ apiKey: "k", fetchImpl });
    await expect(client.embedTexts("model", ["a", "b"], "RETRIEVAL_QUERY")).rejects.toBeInstanceOf(
      GeminiEmbeddingsApiError,
    );
  });

  it("falha fechado quando a dimensionalidade retornada é inesperada", async () => {
    const fetchImpl = mockFetch(
      async () =>
        new Response(JSON.stringify({ embeddings: [{ values: [0.1, 0.2] }] }), { status: 200 }),
    );
    const client = new GeminiEmbeddingsClient({ apiKey: "k", fetchImpl });
    await expect(client.embedTexts("model", ["a"], "RETRIEVAL_QUERY")).rejects.toBeInstanceOf(
      GeminiEmbeddingsApiError,
    );
  });
});
