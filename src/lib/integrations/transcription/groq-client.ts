// Thin REST adapter over Groq's OpenAI-compatible transcription endpoint.
// Same rationale as src/lib/integrations/google/calendar-client.ts: no SDK,
// just fetch with an injectable implementation for tests
// (docs/07-test-strategy.md "adapters com HTTP mocks estritos").
const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

export interface GroqTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export class GroqApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GroqApiError";
  }
}

export interface GroqTranscriptionClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class GroqTranscriptionClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GroqTranscriptionClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async transcribe(
    audio: Blob,
    filename: string,
    options: { language?: string } = {},
  ): Promise<GroqTranscriptionResult> {
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", GROQ_TRANSCRIPTION_MODEL);
    form.append("response_format", "json");
    if (options.language) {
      form.append("language", options.language);
    }

    const response = await this.fetchImpl(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      throw new GroqApiError(`Groq transcription failed: ${response.status}`, response.status);
    }

    return (await response.json()) as GroqTranscriptionResult;
  }
}
