// Thin REST adapter over the Gemini embeddings endpoint. Same rationale as
// src/lib/integrations/gemini/client.ts.
//
// Verified against ai.google.dev/gemini-api/docs/embeddings and
// ai.google.dev/api/embeddings on 2026-08-20: `embedContent`/
// `batchEmbedContents` take `outputDimensionality` (int, 128-3072,
// recommended 768/1536/3072) and `taskType` (RETRIEVAL_DOCUMENT for
// indexed chunks, RETRIEVAL_QUERY for the search query — using the right
// one measurably improves retrieval quality per Google's docs).
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Matches knowledge_embeddings.embedding's fixed vector(768) column. */
export const EMBEDDING_DIMENSIONS = 768;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export class GeminiEmbeddingsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GeminiEmbeddingsApiError";
  }
}

export interface GeminiEmbeddingsClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class GeminiEmbeddingsClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiEmbeddingsClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embedTexts(
    model: string,
    texts: string[],
    taskType: EmbeddingTaskType,
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.fetchImpl(
      `${GEMINI_BASE_URL}/models/${model}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
      },
    );

    if (!response.ok) {
      throw new GeminiEmbeddingsApiError(
        `Gemini embeddings request failed: ${response.status}`,
        response.status,
      );
    }

    const body = (await response.json()) as { embeddings?: { values?: number[] }[] };
    const embeddings = body.embeddings;
    if (!embeddings || embeddings.length !== texts.length) {
      throw new GeminiEmbeddingsApiError(
        "Gemini embeddings response did not match request count",
        response.status,
      );
    }

    return embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length !== EMBEDDING_DIMENSIONS) {
        throw new GeminiEmbeddingsApiError(
          `Gemini embedding ${index} had unexpected dimensionality`,
          response.status,
        );
      }
      return values;
    });
  }
}
