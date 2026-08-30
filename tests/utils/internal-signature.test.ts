import { describe, expect, it } from "vitest";
import {
  buildInternalSignaturePdfLines,
  hashCanonicalSignatureContent,
  INTERNAL_SIGNATURE_DISCLAIMER,
  INTERNAL_SIGNATURE_METHOD,
} from "@/features/documents/internal-signature";

describe("assinatura profissional interna", () => {
  const payload = {
    organizationId: "11111111-1111-1111-1111-111111111111",
    documentId: "22222222-2222-2222-2222-222222222222",
    documentVersion: 2,
    body: "Atesto comparecimento.",
    professionalUserId: "33333333-3333-3333-3333-333333333333",
    professionalName: "Ana",
    professionalRegistration: "06/12345",
    professionalRegistrationState: "SP",
    signedAt: "2026-08-30T12:00:00.000Z",
  };

  it("gera SHA-256 estável do conteúdo canônico", () => {
    const first = hashCanonicalSignatureContent(payload);
    const second = hashCanonicalSignatureContent(payload);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(
      hashCanonicalSignatureContent({ ...payload, body: "outro texto" }),
    ).not.toBe(first);
  });

  it("não usa linguagem de ICP-Brasil no bloco do PDF", () => {
    const lines = buildInternalSignaturePdfLines({
      professionalName: "Ana",
      professionalRegistration: "06/12345",
      professionalRegistrationState: "SP",
      signedAtLabel: "30/08/2026, 09:00:00",
      identifier: "sig-1",
      contentSha256: "abc",
    });
    expect(lines[0]).toBe(INTERNAL_SIGNATURE_DISCLAIMER);
    expect(lines.join("\n")).toMatch(/não é assinatura digital ICP-Brasil/i);
    expect(lines.join("\n")).not.toMatch(/Gov\.br/i);
    expect(INTERNAL_SIGNATURE_METHOD).toBe("virginiapsi_internal");
  });
});
