import { describe, expect, it } from "vitest";
import { resolveTcleStatus } from "@/features/consents/tcle";
import { TCLE_BODY_TEMPLATE, TCLE_VERSION } from "@/features/consents/tcle-content";
import type { ConsentRow } from "@/features/consents/contracts";

function row(overrides: Partial<ConsentRow> = {}): ConsentRow {
  return {
    id: "id-1",
    organization_id: "org-1",
    patient_id: "patient-1",
    type: "psychotherapy",
    title: "TCLE",
    version: TCLE_VERSION,
    status: "accepted",
    accepted_at: "2026-08-01T00:00:00.000Z",
    expires_at: null,
    guardian_authorization: false,
    guardian_name: null,
    patient_assent: false,
    revoked_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveTcleStatus", () => {
  it("never_accepted quando não há registro do tipo", () => {
    const result = resolveTcleStatus([], "psychotherapy", TCLE_VERSION);
    expect(result.status).toBe("never_accepted");
    expect(result.latest).toBeNull();
  });

  it("current quando o aceite mais recente bate com a versão vigente", () => {
    const result = resolveTcleStatus([row()], "psychotherapy", TCLE_VERSION);
    expect(result.status).toBe("current");
  });

  it("outdated quando o aceite é de uma versão anterior à vigente", () => {
    const result = resolveTcleStatus(
      [row({ version: "tcle-2026-01-v1" })],
      "psychotherapy",
      TCLE_VERSION,
    );
    expect(result.status).toBe("outdated");
  });

  it("revoked quando o aceite mais recente foi revogado, mesmo que a versão seja a vigente", () => {
    const result = resolveTcleStatus(
      [row({ status: "revoked", revoked_at: "2026-08-05T00:00:00.000Z" })],
      "psychotherapy",
      TCLE_VERSION,
    );
    expect(result.status).toBe("revoked");
  });

  it("considera apenas o registro mais recente do tipo pedido, ignorando outros tipos", () => {
    const older = row({
      id: "older",
      created_at: "2026-01-01T00:00:00.000Z",
      version: "tcle-2026-01-v1",
    });
    const newer = row({ id: "newer", created_at: "2026-08-10T00:00:00.000Z" });
    const otherType = row({
      id: "other-type",
      type: "service_terms",
      created_at: "2026-08-15T00:00:00.000Z",
    });
    const result = resolveTcleStatus([older, newer, otherType], "psychotherapy", TCLE_VERSION);
    expect(result.latest?.id).toBe("newer");
    expect(result.status).toBe("current");
  });

  it("never_accepted quando o registro mais recente está pending (nunca foi de fato aceito)", () => {
    const result = resolveTcleStatus(
      [row({ status: "pending", accepted_at: null })],
      "psychotherapy",
      TCLE_VERSION,
    );
    expect(result.status).toBe("never_accepted");
  });

  it("informa a redação assistida de documentos como finalidade do Gemini", () => {
    expect(TCLE_BODY_TEMPLATE).toContain("redação assistida de documentos");
    expect(TCLE_VERSION).toBe("tcle-2026-08-v2");
  });
});
