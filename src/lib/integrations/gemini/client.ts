// Thin REST adapter over the Gemini API generateContent endpoint — no SDK,
// same rationale as the Google Calendar/Groq clients: an injectable fetch
// keeps this testable with strict HTTP mocks instead of hitting a real
// model in unit tests (docs/07-test-strategy.md).
//
// Endpoint/auth verified against ai.google.dev/api/generate-content and
// ai.google.dev/gemini-api/docs/generate-content/get-started on 2026-08-20:
// `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
// with the API key in the `x-goog-api-key` header (not the `?key=` query
// param, which would leak into access logs).
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_GEMINI_TIMEOUT_MS = 45_000;

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

export class GeminiTimeoutError extends GeminiApiError {
  constructor() {
    super("Gemini request timed out", 408);
    this.name = "GeminiTimeoutError";
  }
}

export interface GeminiStructuredRequest {
  model: string;
  systemInstruction: string;
  userContent: string;
  responseJsonSchema: unknown;
  timeoutMs?: number;
}

export interface GeminiClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface GeminiTextRequest {
  model: string;
  systemInstruction: string;
  userContent: string;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

/** Accepts raw JSON or a markdown-fenced JSON payload from the model. */
export function parseGeminiJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const payload = (fence ? fence[1] : trimmed).trim();
  return JSON.parse(payload);
}

export class GeminiClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Calls generateContent with structured output and returns the raw parsed
   * JSON body — callers must still run it through the mirrored Zod
   * validator before trusting it (docs/15-runtime-ai-test-matrix.md
   * "Resposta malformada falha fechada").
   */
  async generateStructured(request: GeminiStructuredRequest): Promise<unknown> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchImpl(
        `${GEMINI_BASE_URL}/models/${request.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: request.userContent }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: request.responseJsonSchema,
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new GeminiApiError(`Gemini request failed: ${response.status}`, response.status);
      }

      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new GeminiApiError("Gemini response had no text part", response.status);
      }

      try {
        return parseGeminiJsonText(text);
      } catch {
        throw new GeminiApiError("Gemini response was not valid JSON", response.status);
      }
    } catch (error) {
      if (error instanceof GeminiApiError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new GeminiTimeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Plain-text generateContent (document studio drafting — still parsed by the caller). */
  async generateText(request: GeminiTextRequest): Promise<string> {
    const response = await this.fetchImpl(
      `${GEMINI_BASE_URL}/models/${request.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: request.userContent }] }],
        }),
      },
    );

    if (!response.ok) {
      throw new GeminiApiError(`Gemini request failed: ${response.status}`, response.status);
    }

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new GeminiApiError("Gemini response had no text part", response.status);
    }
    return text;
  }
}
