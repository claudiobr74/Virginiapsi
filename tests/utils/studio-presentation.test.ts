import { describe, expect, it } from "vitest";
import { DOCUMENT_AI_COMMANDS, documentRowSchema, type DocumentRow } from "@/features/documents/contracts";
import {
  DOCUMENT_AI_INTENTS,
  HOME_SHORTCUTS,
  finalizeChecklistState,
  intentCommand,
  issueBlockedByUiGuards,
  recentSystemTemplateKeys,
  shortcutHref,
  templateRequiresPurpose,
  templateRequiresRecipient,
} from "@/features/documents/studio-presentation";
import { getSystemTemplate } from "@/features/documents/system-templates";

function documentWithTemplate(key: string | null, idSuffix: string): DocumentRow {
  return documentRowSchema.parse({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${idSuffix}`,
    organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    patient_id: null,
    template_id: null,
    title: key ?? "Sem modelo",
    document_kind: "declaracao",
    sensitivity: "clinical",
    status: "draft",
    current_version: 1,
    issued_at: null,
    canceled_at: null,
    created_at: "2026-09-01T12:00:00.000Z",
    system_template_key: key,
  });
}

describe("atalhos e catálogo da home", () => {
  it("usa apenas categorias e keys reais", () => {
    const labeled = HOME_SHORTCUTS.filter((item) => item.category);
    expect(labeled.map((item) => item.label)).toEqual([
      "Declaração",
      "Relatório",
      "Atestado",
      "Encaminhamento",
      "Contrato",
    ]);
    expect(HOME_SHORTCUTS.some((item) => item.id === "mais")).toBe(true);
  });

  it("atalho com um modelo vai direto; vários abrem o picker da categoria", () => {
    expect(shortcutHref("atestados")).toBe("/app/documents/new?template=psychological_certificate");
    expect(shortcutHref("declaracoes")).toBe("/app/documents/new?category=declaracoes");
    expect(shortcutHref("relatorios")).toBe("/app/documents/new?category=relatorios");
  });
});

describe("usados recentemente", () => {
  it("deriva até 4 system_template_key distintos, na ordem dos documentos", () => {
    const keys = recentSystemTemplateKeys(
      [
        documentWithTemplate("declaration_attendance", "a1"),
        documentWithTemplate("declaration_attendance", "a2"),
        documentWithTemplate("missing_key", "a3"),
        documentWithTemplate(null, "a4"),
        documentWithTemplate("psychological_report_complete", "a5"),
        documentWithTemplate("psychological_certificate", "a6"),
        documentWithTemplate("psychotherapy_contract_complete", "a7"),
        documentWithTemplate("psychological_opinion", "a8"),
      ],
      4,
    );
    expect(keys).toEqual([
      "declaration_attendance",
      "psychological_report_complete",
      "psychological_certificate",
      "psychotherapy_contract_complete",
    ]);
  });
});

describe("guardrails de superfície do wizard", () => {
  it("paciente, destinatário e finalidade seguem o template", () => {
    const declaration = getSystemTemplate("declaration_attendance")!;
    const reportToPsychiatrist = getSystemTemplate("report_to_psychiatrist")!;
    const opinion = getSystemTemplate("psychological_opinion")!;
    const contract = getSystemTemplate("psychotherapy_contract_complete")!;

    expect(declaration.guardrails.requiresPatient).toBe(true);
    expect(templateRequiresPurpose(declaration)).toBe(true);
    expect(templateRequiresRecipient(declaration)).toBe(false);

    expect(templateRequiresRecipient(reportToPsychiatrist)).toBe(true);
    expect(templateRequiresPurpose(reportToPsychiatrist)).toBe(true);

    expect(opinion.guardrails.allowsMissingPatient).toBe(true);
    expect(templateRequiresRecipient(opinion)).toBe(false);

    expect(contract.supportsBooklet).toBe(true);
    expect(templateRequiresPurpose(contract)).toBe(false);
  });
});

describe("intents de IA", () => {
  it("mapeia para comandos existentes sem inventar endpoint", () => {
    expect(intentCommand("first_draft")).toBeUndefined();
    expect(intentCommand("improve")).toBe("melhorar clareza");
    expect(intentCommand("objective")).toBe("resumir");
    expect(intentCommand("technical")).toBe("tornar mais técnico");
    expect(intentCommand("review")).toBe("melhorar coesão");
    expect(intentCommand("other")).toBeUndefined();
    for (const intent of DOCUMENT_AI_INTENTS) {
      if (intent.command) {
        expect(DOCUMENT_AI_COMMANDS).toContain(intent.command);
      }
    }
  });
});

describe("checklist de finalização", () => {
  it("reflete paciente, finalidade, placeholders e preview reais", () => {
    const incomplete = finalizeChecklistState({
      patientId: null,
      allowsMissingPatient: false,
      purpose: "",
      purposeRequired: true,
      recipientName: "",
      recipientRequired: true,
      unresolved: true,
      reviewedAt: null,
      previewOk: false,
    });
    expect(incomplete.patientOk).toBe(false);
    expect(incomplete.purposeOk).toBe(false);
    expect(incomplete.placeholdersOk).toBe(false);
    expect(incomplete.previewOk).toBe(false);

    const ready = finalizeChecklistState({
      patientId: "44444444-4444-4444-8444-444444444444",
      allowsMissingPatient: false,
      purpose: "comparecimento",
      purposeRequired: true,
      recipientName: "",
      recipientRequired: false,
      unresolved: false,
      reviewedAt: "2026-09-01T12:00:00.000Z",
      previewOk: true,
    });
    expect(ready.patientOk).toBe(true);
    expect(ready.purposeOk).toBe(true);
    expect(ready.recipientOk).toBe(true);
    expect(ready.placeholdersOk).toBe(true);
    expect(ready.reviewedOk).toBe(true);
  });

  it("bloqueia emissão quando preview, revisão clínica ou placeholders falham", () => {
    expect(
      issueBlockedByUiGuards({
        unresolved: true,
        previewOk: true,
        clinical: true,
        confirmReview: true,
        purposeAdequacy: true,
        requiresTechnicalFoundation: false,
        foundationOk: false,
        requiresCompatibleAssessment: false,
        assessmentOk: false,
      }),
    ).toBe(true);
    expect(
      issueBlockedByUiGuards({
        unresolved: false,
        previewOk: false,
        clinical: true,
        confirmReview: true,
        purposeAdequacy: true,
        requiresTechnicalFoundation: false,
        foundationOk: false,
        requiresCompatibleAssessment: false,
        assessmentOk: false,
      }),
    ).toBe(true);
    expect(
      issueBlockedByUiGuards({
        unresolved: false,
        previewOk: true,
        clinical: true,
        confirmReview: false,
        purposeAdequacy: true,
        requiresTechnicalFoundation: false,
        foundationOk: false,
        requiresCompatibleAssessment: false,
        assessmentOk: false,
      }),
    ).toBe(true);
    expect(
      issueBlockedByUiGuards({
        unresolved: false,
        previewOk: true,
        clinical: true,
        confirmReview: true,
        purposeAdequacy: true,
        requiresTechnicalFoundation: false,
        foundationOk: false,
        requiresCompatibleAssessment: false,
        assessmentOk: false,
      }),
    ).toBe(false);
  });
});
