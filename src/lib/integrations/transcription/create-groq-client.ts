import "server-only";

import {
  DEFAULT_GROQ_TRANSCRIPTION_MODEL,
  DEFAULT_GROQ_TRANSCRIPTION_TIMEOUT_MS,
  GroqTranscriptionClient,
} from "@/lib/integrations/transcription/groq-client";
import { getGroqTranscriptionEnv } from "@/lib/env/server";

export function createGroqTranscriptionClient(
  fetchImpl?: typeof fetch,
): GroqTranscriptionClient {
  const env = getGroqTranscriptionEnv();
  const stubUrl = process.env.GROQ_TRANSCRIPTION_STUB_URL?.trim();
  return new GroqTranscriptionClient({
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_TRANSCRIPTION_MODEL ?? DEFAULT_GROQ_TRANSCRIPTION_MODEL,
    timeoutMs: env.GROQ_TRANSCRIPTION_TIMEOUT_MS ?? DEFAULT_GROQ_TRANSCRIPTION_TIMEOUT_MS,
    endpointUrl: stubUrl || undefined,
    fetchImpl,
  });
}
