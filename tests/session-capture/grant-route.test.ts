import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CONSENT_DENIAL_MESSAGES } from "@/features/consents/contracts";
import { captureGrantLimiter } from "@/lib/security/rate-limit";

vi.mock("@/lib/consent/capability-gate", () => ({
  authorizeCaptureCapability: vi.fn(),
  issueCaptureGrant: vi.fn(),
}));

import { POST } from "@/app/api/session-capture/grant/route";
import {
  authorizeCaptureCapability,
  issueCaptureGrant,
} from "@/lib/consent/capability-gate";

const authorize = vi.mocked(authorizeCaptureCapability);
const issue = vi.mocked(issueCaptureGrant);

const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

function grantRequest(body: unknown, headers?: HeadersInit): NextRequest {
  return new NextRequest("http://localhost/api/session-capture/grant", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/session-capture/grant", () => {
  beforeEach(() => {
    captureGrantLimiter.reset();
    authorize.mockReset();
    issue.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emite grant quando o gate autoriza", async () => {
    authorize.mockResolvedValue({
      allowed: true,
      organizationId: ORGANIZATION_ID,
      patientId: PATIENT_ID,
      sessionId: SESSION_ID,
      state: {
        aiProcessingAllowed: true,
        recordingAllowed: true,
        transcriptionAllowed: true,
      },
    });
    issue.mockReturnValue("signed-grant.signature");

    const response = await POST(
      grantRequest({ patientId: PATIENT_ID, sessionId: SESSION_ID }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { grant: string; expiresInMs: number };
    expect(body.grant).toBe("signed-grant.signature");
    expect(body.expiresInMs).toBeGreaterThan(0);
    expect(issue).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledWith(
      PATIENT_ID,
      SESSION_ID,
      "session_remote_transcription_grant",
    );
    expect(issue).toHaveBeenCalledWith(expect.anything(), "session_remote_transcription_grant");
  });

  it("nega consentimento ausente com mensagem específica", async () => {
    authorize.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "consent_missing",
      message: CONSENT_DENIAL_MESSAGES.consent_missing,
    });

    const response = await POST(
      grantRequest({ patientId: PATIENT_ID, sessionId: SESSION_ID }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("consent_missing");
    expect(body.message).toBe("Consentimento não registrado para este paciente.");
    expect(issue).not.toHaveBeenCalled();
  });

  it("retorna 404 quando a sessão não pertence ao paciente", async () => {
    authorize.mockResolvedValue({
      allowed: false,
      status: 404,
      reason: "session_not_found",
      message: "Sessão clínica não encontrada para este paciente.",
    });

    const response = await POST(
      grantRequest({ patientId: PATIENT_ID, sessionId: SESSION_ID }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("session_not_found");
    expect(issue).not.toHaveBeenCalled();
  });

  it("retorna 403 para papel sem permissão clínica", async () => {
    authorize.mockResolvedValue({
      allowed: false,
      status: 403,
      reason: "forbidden_role",
      message: "Somente a psicóloga responsável conduz sessão clínica.",
    });

    const response = await POST(
      grantRequest({ patientId: PATIENT_ID, sessionId: SESSION_ID }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("forbidden_role");
    expect(body.message).toContain("psicóloga responsável");
    expect(issue).not.toHaveBeenCalled();
  });

  it("ignora capability enviada pelo browser", async () => {
    authorize.mockResolvedValue({
      allowed: true,
      organizationId: ORGANIZATION_ID,
      patientId: PATIENT_ID,
      sessionId: SESSION_ID,
      state: {
        aiProcessingAllowed: true,
        recordingAllowed: true,
        transcriptionAllowed: true,
      },
    });
    issue.mockReturnValue("signed-grant.signature");

    const response = await POST(
      grantRequest({
        patientId: PATIENT_ID,
        sessionId: SESSION_ID,
        capability: "audio_fallback_upload_grant",
      }),
    );
    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith(
      PATIENT_ID,
      SESSION_ID,
      "session_remote_transcription_grant",
    );
    expect(issue).toHaveBeenCalledWith(expect.anything(), "session_remote_transcription_grant");
  });

  it("retorna 400 para payload inválido", async () => {
    const response = await POST(grantRequest({ patientId: "not-a-uuid", sessionId: SESSION_ID }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("não mascara redirect de autenticação como 500", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    authorize.mockRejectedValue(redirectError);

    await expect(
      POST(grantRequest({ patientId: PATIENT_ID, sessionId: SESSION_ID })),
    ).rejects.toBe(redirectError);
    expect(issue).not.toHaveBeenCalled();
  });

  it("sanitiza erro interno sem vazar segredo, token ou mensagem crua", async () => {
    authorize.mockResolvedValue({
      allowed: true,
      organizationId: ORGANIZATION_ID,
      patientId: PATIENT_ID,
      sessionId: SESSION_ID,
      state: {
        aiProcessingAllowed: true,
        recordingAllowed: true,
        transcriptionAllowed: true,
      },
    });
    const secretLeak = new Error("SESSION_CAPTURE_SECRET super-secret-value leaked");
    (secretLeak as Error & { code: string }).code = "ENV_INVALID";
    issue.mockImplementation(() => {
      throw secretLeak;
    });

    const response = await POST(
      grantRequest(
        { patientId: PATIENT_ID, sessionId: SESSION_ID },
        { "x-vercel-id": "corr-grant-1" },
      ),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; message: string; grant?: string };
    expect(body).toEqual({
      error: "capture_grant_failed",
      message: "Não foi possível autorizar a transcrição agora.",
    });
    expect(body.grant).toBeUndefined();

    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("issue_capture_grant");
    expect(logged).toContain("/api/session-capture/grant");
    expect(logged).toContain("corr-grant-1");
    expect(logged).toContain("ENV_INVALID");
    expect(logged).not.toContain("super-secret-value");
    expect(logged).not.toContain("SESSION_CAPTURE_SECRET super-secret-value leaked");
    expect(logged).not.toContain("signed-grant");
  });
});
