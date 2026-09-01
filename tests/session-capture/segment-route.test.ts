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

import { POST } from "@/app/api/session-capture/segment/route";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { verifyCaptureGrantToken } from "@/lib/consent/capability-gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requireOrg = vi.mocked(requireOrgContext);
const verifyGrant = vi.mocked(verifyCaptureGrantToken);
const createClient = vi.mocked(createSupabaseServerClient);

const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const validBody = {
  grant: "signed-grant.signature",
  sessionId: SESSION_ID,
  patientId: PATIENT_ID,
  sequence: 0,
  text: "Trecho persistido.",
  isFinal: true,
  startMs: 0,
  endMs: 1500,
  provider: "local-webgpu" as const,
};

function segmentRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/session-capture/segment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/session-capture/segment", () => {
  const insert = vi.fn();

  beforeEach(() => {
    requireOrg.mockReset();
    verifyGrant.mockReset();
    createClient.mockReset();
    insert.mockReset();
    requireOrg.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      organizationName: "Clínica",
      timezone: "America/Sao_Paulo",
      role: "psychologist",
      user: { id: USER_ID } as Awaited<ReturnType<typeof requireOrgContext>>["user"],
      memberships: [],
    });
    createClient.mockResolvedValue({
      from: () => ({ insert }),
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it("persiste segmento com grant válido", async () => {
    verifyGrant.mockImplementation((_token, expected) => {
      if (expected.capability === "session_capture_grant") {
        return {
          valid: true,
          payload: {
            organizationId: ORGANIZATION_ID,
            patientId: PATIENT_ID,
            sessionId: SESSION_ID,
            capability: "session_capture_grant",
            nonce: "n",
            issuedAt: 1,
            expiresAt: 2,
          },
        };
      }
      return { valid: false, reason: "scope_mismatch" };
    });
    insert.mockResolvedValue({ error: null });

    const response = await POST(segmentRequest(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("recusa grant inválido com 403 e não persiste", async () => {
    verifyGrant.mockReturnValue({ valid: false, reason: "signature_mismatch" });

    const response = await POST(segmentRequest(validBody));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "signature_mismatch" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("trata duplicate de sequence como sucesso idempotente", async () => {
    verifyGrant.mockImplementation((_token, expected) => {
      if (expected.capability === "session_capture_grant") {
        return {
          valid: true,
          payload: {
            organizationId: ORGANIZATION_ID,
            patientId: PATIENT_ID,
            sessionId: SESSION_ID,
            capability: "session_capture_grant",
            nonce: "n",
            issuedAt: 1,
            expiresAt: 2,
          },
        };
      }
      return { valid: false, reason: "scope_mismatch" };
    });
    insert.mockResolvedValue({ error: { code: "23505" } });

    const response = await POST(segmentRequest(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
  });
});
