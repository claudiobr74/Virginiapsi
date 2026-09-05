import { z } from "zod";

export const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const DEFAULT_GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
export const DEFAULT_GROQ_TRANSCRIPTION_TIMEOUT_MS = 30_000;

const groqTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
});

export interface GroqTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export class GroqApiError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    public readonly status: number,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "GroqApiError";
    this.retryable =
      options?.retryable ?? (status === 408 || status === 429 || status >= 500);
  }
}

export class GroqTimeoutError extends GroqApiError {
  constructor() {
    super("Groq transcription timed out", 408, { retryable: true });
    this.name = "GroqTimeoutError";
  }
}

export interface GroqTranscriptionClientOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  endpointUrl?: string;
  fetchImpl?: typeof fetch;
}

export class GroqTranscriptionClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly endpointUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GroqTranscriptionClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_GROQ_TRANSCRIPTION_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GROQ_TRANSCRIPTION_TIMEOUT_MS;
    this.endpointUrl = options.endpointUrl ?? GROQ_TRANSCRIPTION_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async transcribe(
    audio: Blob,
    filename: string,
    options: { language?: string; temperature?: number; signal?: AbortSignal } = {},
  ): Promise<GroqTranscriptionResult> {
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", this.model);
    form.append("response_format", "json");
    form.append("temperature", String(options.temperature ?? 0));
    if (options.language) {
      form.append("language", options.language);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const response = await this.fetchImpl(this.endpointUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new GroqApiError(`Groq transcription failed: ${response.status}`, response.status);
      }

      const parsed = groqTranscriptionResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new GroqApiError("Groq transcription returned an unexpected payload", 502, {
          retryable: true,
        });
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof GroqApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new GroqTimeoutError();
      }
      throw new GroqApiError("Groq transcription request failed", 503, {
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}
