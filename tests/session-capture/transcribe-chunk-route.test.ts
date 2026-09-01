import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-org-context", () => ({
  requireOrgContext: vi.fn(),
}));

vi.mock("@/lib/consent/capability-gate", () => ({
  verifyCaptureGrantToken: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/integrations/transcription/create-groq-client", () => ({
  createGroqTranscriptionClient: vi.fn(),
}));

import { POST } from "@/app/api/session-capture/transcribe-chunk/route";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { verifyCaptureGrantToken } from "@/lib/consent/capability-gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGroqTranscriptionClient } from "@/lib/integrations/transcription/create-groq-client";
import { transcribeChunkLimiter } from "@/lib/security/rate-limit";

const requireOrg = vi.mocked(requireOrgContext);
const verifyGrant = vi.mocked(verifyCaptureGrantToken);
const createClient = vi.mocked(createSupabaseServerClient);
const createGroq = vi.mocked(createGroqTranscriptionClient);

const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const CHUNK_ID = "55555555-5555-4555-8555-555555555555";

function chunkRequest(overrides: Record<string, string | Blob> = {}): NextRequest {
  const form = new FormData();
  form.set("grant", "signed-grant.signature");
  form.set("patientId", PATIENT_ID);
  form.set("sessionId", SESSION_ID);
  form.set("chunkId", CHUNK_ID);
  form.set("sequence", "0");
  form.set("startMs", "0");
  form.set("endMs", "15000");
  form.set("audio", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }));
  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }
  return {
    headers: new Headers(),
    formData: async () => form,
  } as unknown as NextRequest;
}

describe("POST /api/session-capture/transcribe-chunk", () => {
  const insert = vi.fn();
  const maybeSingle = vi.fn();
  const sessionMaybeSingle = vi.fn();
  const transcribe = vi.fn();

  beforeEach(() => {
    transcribeChunkLimiter.reset();
    requireOrg.mockReset();
    verifyGrant.mockReset();
    createClient.mockReset();
    createGroq.mockReset();
    insert.mockReset();
    maybeSingle.mockReset();
    sessionMaybeSingle.mockReset();
    transcribe.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    requireOrg.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      organizationName: "Clínica",
      timezone: "America/Sao_Paulo",
      role: "psychologist",
      user: { id: USER_ID } as Awaited<ReturnType<typeof requireOrgContext>>["user"],
      memberships: [],
    });
    verifyGrant.mockReturnValue({
      valid: true,
      payload: {
        organizationId: ORGANIZATION_ID,
        patientId: PATIENT_ID,
        sessionId: SESSION_ID,
        capability: "session_capture_grant",
        nonce: "nonce",
        issuedAt: 1,
        expiresAt: Date.now() + 60_000,
      },
    });
    createClient.mockResolvedValue({
      from: (table: string) => {
        if (table === "clinical_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: sessionMaybeSingle }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle }),
            }),
          }),
          insert,
        };
      },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    createGroq.mockReturnValue({ transcribe } as never);
    sessionMaybeSingle.mockResolvedValue({
      data: { id: SESSION_ID, patient_id: PATIENT_ID, organization_id: ORGANIZATION_ID },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    insert.mockResolvedValue({ error: null });
    transcribe.mockResolvedValue({ text: "Trecho confirmado.", language: "pt" });
  });

  it("persiste texto só depois do Groq e devolve ACK", async () => {
    const response = await POST(chunkRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      already_processed: boolean;
      segment: { text: string; provider: string };
    };
    expect(body.ok).toBe(true);
    expect(body.already_processed).toBe(false);
    expect(body.segment.text).toBe("Trecho confirmado.");
    expect(body.segment.provider).toBe("groq-batch");
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("replay de lost ACK não duplica", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        sequence: 0,
        text: "Já persistido.",
        start_ms: 0,
        end_ms: 15000,
        provider: "groq-batch",
      },
    });
    const response = await POST(chunkRequest());
    const body = (await response.json()) as { already_processed: boolean; segment: { text: string } };
    expect(body.already_processed).toBe(true);
    expect(body.segment.text).toBe("Já persistido.");
    expect(transcribe).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("recusa grant inválido", async () => {
    verifyGrant.mockReturnValue({ valid: false, reason: "malformed" });
    const response = await POST(chunkRequest());
    expect(response.status).toBe(403);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("recusa sessão de outro paciente", async () => {
    sessionMaybeSingle.mockResolvedValue({
      data: { id: SESSION_ID, patient_id: "99999999-9999-4999-8999-999999999999", organization_id: ORGANIZATION_ID },
    });
    const response = await POST(chunkRequest());
    expect(response.status).toBe(403);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("propaga 429 do Groq como retryable", async () => {
    const { GroqApiError } = await import("@/lib/integrations/transcription/groq-client");
    transcribe.mockRejectedValue(new GroqApiError("rate", 429));
    const response = await POST(chunkRequest());
    expect(response.status).toBe(429);
    expect(insert).not.toHaveBeenCalled();
  });
});
