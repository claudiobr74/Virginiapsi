import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/require-org-context", () => ({
  requireOrgContext: vi.fn(),
}));

vi.mock("@/lib/consent/capability-gate", () => ({
  verifyCaptureGrantToken: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createAdmin,
}));

vi.mock("@/lib/integrations/transcription/create-groq-client", () => ({
  createGroqTranscriptionClient: vi.fn(),
}));

vi.mock("@/lib/integrations/transcription/fallback-storage", () => ({
  FALLBACK_AUDIO_BUCKET: "session-audio-fallback",
  deleteImportedAudioObject: vi.fn(),
}));

import { POST } from "@/app/api/session-capture/transcribe/route";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { verifyCaptureGrantToken } from "@/lib/consent/capability-gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGroqTranscriptionClient } from "@/lib/integrations/transcription/create-groq-client";
import { deleteImportedAudioObject } from "@/lib/integrations/transcription/fallback-storage";

const requireOrg = vi.mocked(requireOrgContext);
const verifyGrant = vi.mocked(verifyCaptureGrantToken);
const createClient = vi.mocked(createSupabaseServerClient);
const createGroq = vi.mocked(createGroqTranscriptionClient);
const deleteObject = vi.mocked(deleteImportedAudioObject);

const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const STORAGE_PATH = `${ORGANIZATION_ID}/${SESSION_ID}/file.webm`;

function request(): NextRequest {
  return new NextRequest("http://localhost/api/session-capture/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant: "grant.token",
      sessionId: SESSION_ID,
      patientId: PATIENT_ID,
      storagePath: STORAGE_PATH,
      sequence: 0,
      startMs: 0,
      filename: "file.webm",
    }),
  });
}

function audioFile() {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  return {
    type: "audio/webm",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  };
}

describe("POST /api/session-capture/transcribe (import)", () => {
  const insert = vi.fn();
  const download = vi.fn();
  const transcribe = vi.fn();

  beforeEach(() => {
    requireOrg.mockReset();
    verifyGrant.mockReset();
    createClient.mockReset();
    createAdmin.mockReset();
    createGroq.mockReset();
    deleteObject.mockReset();
    insert.mockReset();
    download.mockReset();
    transcribe.mockReset();
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
        capability: "audio_fallback_upload_grant",
        nonce: "n",
        issuedAt: 1,
        expiresAt: Date.now() + 60_000,
      },
    });
    insert.mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      from: () => ({ insert }),
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    download.mockResolvedValue({
      data: audioFile(),
      error: null,
    });
    createAdmin.mockReturnValue({
      storage: {
        from: () => ({ download }),
      },
    });
    createGroq.mockReturnValue({ transcribe } as never);
    transcribe.mockResolvedValue({ text: "Importado.", language: "pt", duration: 12 });
  });

  it("apaga o objeto temporário só depois de persistir o texto", async () => {
    const order: string[] = [];
    insert.mockImplementation(async () => {
      order.push("insert");
      return { error: null };
    });
    deleteObject.mockImplementation(async () => {
      order.push("delete");
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe("delete");
    expect(order.includes("insert")).toBe(true);
  });

  it("mantém o arquivo quando o Groq falha", async () => {
    transcribe.mockRejectedValue(new Error("fail"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
