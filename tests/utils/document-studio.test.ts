import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { defaultBranding, logoMaxHeightPt, recommendedProfileForKind, resolveBranding } from "@/features/documents/branding-resolve";
import { withDocumentScopedVariables } from "@/lib/documents/render-template";
import {
  getSystemTemplate,
  listSystemTemplates,
  searchSystemTemplates,
} from "@/features/documents/system-templates";
import { DEFAULT_GEMINI_DOCUMENT_MODEL, geminiDocumentsModel } from "@/lib/ai/documents-model";
import { generateStudioPdf } from "@/lib/documents/studio-pdf";
import { hasUnresolvedPlaceholders } from "@/lib/documents/render-template";
import type { DocumentSection } from "@/features/documents/contracts";

const MIN_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function longSections(): DocumentSection[] {
  const paragraph = `O acompanhamento psicológico constitui um processo profissional construído de maneira colaborativa. ${"Narrativa desenvolvida sobre o caso, sem formulário raso. ".repeat(18)}`;
  return Array.from({ length: 12 }, (_, index) => ({
    id: `s-${index}`,
    type: "text" as const,
    title: `Seção ${index + 1}`,
    content: paragraph,
    order: index,
    enabled: true,
    pageBreakBefore: index > 0 && index % 3 === 0,
  }));
}

describe("biblioteca de templates do estúdio", () => {
  it("carrega os 18 modelos canônicos do primeiro lote, cada um com conteúdo próprio", () => {
    const templates = listSystemTemplates();
    expect(templates).toHaveLength(18);
    const keys = templates.map((template) => template.key);
    expect(new Set(keys).size).toBe(18);
    const bodies = templates.map((template) =>
      template
        .buildSections({ today: "30/08/2026", purpose: "finalidade de teste", patientName: "Pessoa Atendida" })
        .map((section) => section.content)
        .join("\n"),
    );
    expect(new Set(bodies).size).toBe(bodies.length);
    for (const body of bodies) {
      expect(body.length).toBeGreaterThan(400);
      expect(body).not.toMatch(/Demanda:\s*\n?Ansiedade/i);
    }
  });

  it("busca por finalidade e destinatário (psiquiatra, escola, contrato, menor)", () => {
    expect(searchSystemTemplates("relatório para psiquiatra")[0]?.key).toBe("report_to_psychiatrist");
    expect(searchSystemTemplates("documento para escola").some((item) => item.key === "report_school")).toBe(
      true,
    );
    expect(searchSystemTemplates("contrato").some((item) => item.key === "psychotherapy_contract_complete")).toBe(
      true,
    );
    expect(searchSystemTemplates("menor").some((item) => item.key === "minor_authorization")).toBe(true);
    expect(searchSystemTemplates("plano de saúde").some((item) => item.key === "report_health_plan")).toBe(true);
  });

  it("parecer permite ausência de paciente; laudo e atestado exigem confirmações", () => {
    const opinion = getSystemTemplate("psychological_opinion");
    const laudo = getSystemTemplate("psychological_laudo");
    const certificate = getSystemTemplate("psychological_certificate");
    expect(opinion?.guardrails.allowsMissingPatient).toBe(true);
    expect(opinion?.guardrails.requiresPatient).toBe(false);
    expect(laudo?.guardrails.requiresCompatibleAssessment).toBe(true);
    expect(certificate?.guardrails.requiresTechnicalFoundation).toBe(true);
  });

  it("o contrato completo gera livreto com várias seções desenvolvidas", () => {
    const contract = getSystemTemplate("psychotherapy_contract_complete");
    expect(contract?.supportsBooklet).toBe(true);
    const sections = contract!.buildSections({
      today: "30/08/2026",
      patientName: "Pessoa Atendida",
      cancellationNoticeHours: 24,
      extra: { includeAiClause: "true", includesMinor: "true", modality: "online" },
    });
    expect(sections.length).toBeGreaterThan(12);
    const body = sections.map((section) => section.content).join("\n");
    expect(body).toContain("24 horas");
    expect(body).toContain("inteligência artificial");
    expect(body).toMatch(/sigilo profissional/i);
  });
});

describe("identidade visual", () => {
  it("resolve presets sem nomes hardcoded e preserva proporção da logo", () => {
    const resolved = resolveBranding(defaultBranding(), {
      organizationName: "Clínica Exemplo",
      professionalName: "Profissional Exemplo",
      crp: "09/00000",
    });
    expect(resolved.clinicName).toBe("Clínica Exemplo");
    expect(resolved.professionalName).toBe("Profissional Exemplo");
    expect(resolved.crpLabel).toContain("09/00000");
    expect(recommendedProfileForKind("laudo")).toBe("premium");
    expect(recommendedProfileForKind("declaracao")).toBe("essencial");
    expect(recommendedProfileForKind("contrato")).toBe("institucional");
    expect(logoMaxHeightPt("small")).toBeLessThan(logoMaxHeightPt("medium"));
    expect(logoMaxHeightPt("custom", 200)).toBe(140);
    expect(logoMaxHeightPt("custom", 10)).toBe(24);
  });
});

describe("modelo de IA do módulo de documentos", () => {
  it("usa gemini-3.6-flash por padrão e aceita override centralizado", () => {
    expect(DEFAULT_GEMINI_DOCUMENT_MODEL).toBe("gemini-3.6-flash");
    expect(geminiDocumentsModel({})).toBe("gemini-3.6-flash");
    expect(geminiDocumentsModel({ GEMINI_MODEL_DOCUMENTS: "  " })).toBe("gemini-3.6-flash");
    expect(geminiDocumentsModel({ GEMINI_MODEL_DOCUMENTS: "gemini-custom" })).toBe("gemini-custom");
  });
});

describe("variáveis do documento", () => {
  it("não inclui finalidade vazia (não apaga {{document.purpose}} em silêncio)", () => {
    const merged = withDocumentScopedVariables({ "date.today": "30/08/2026" }, { purpose: "  " });
    expect("document.purpose" in merged).toBe(false);
    const withPurpose = withDocumentScopedVariables(
      { "date.today": "30/08/2026" },
      { purpose: "escola", recipientName: "Coordenação" },
    );
    expect(withPurpose["document.purpose"]).toBe("escola");
    expect(withPurpose["recipient.name"]).toBe("Coordenação");
  });
});

describe("PDF do estúdio", () => {
  it("gera A4 multipágina com logo PNG, cabeçalho, rodapé, paginação e hash", async () => {
    const branding = resolveBranding(defaultBranding(), {
      organizationName: "Clínica Exemplo",
      professionalName: "Profissional Exemplo",
      crp: "01/12345",
      clinicName: "Clínica Exemplo",
    });
    branding.footer.hash = true;
    branding.footer.pageNumbers = true;
    branding.footer.documentId = true;
    branding.footer.version = true;
    const bytes = await generateStudioPdf({
      title: "Relatório psicológico",
      sections: longSections(),
      branding,
      logoBytes: MIN_PNG,
      logoMime: "image/png",
      logoAlign: "left",
      logoSize: "medium",
      documentId: "11111111-1111-1111-1111-111111111111",
      version: 2,
      contentSha256: "abc123def4567890",
      layout: "tradicional",
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("utf8")).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
    const page = parsed.getPage(0);
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  });

  it("no livreto desenha abertura institucional sem duplicar capa genérica", async () => {
    const branding = resolveBranding(defaultBranding(), {
      organizationName: "Clínica Editorial",
      professionalName: "Profissional Editorial",
    });
    const bytes = await generateStudioPdf({
      title: "Contrato psicoterapêutico",
      sections: longSections().slice(0, 6),
      branding,
      cover: {
        documentType: "Contrato",
        subjectName: "Pessoa Atendida",
        purpose: "início de acompanhamento",
      },
      layout: "livreto",
      documentId: "22222222-2222-2222-2222-222222222222",
      version: 1,
    });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });

  it("SVG não é embutido no PDF (fica para a tela); PNG entra sem distorcer", async () => {
    const branding = resolveBranding(null, { organizationName: "Org" });
    const withSvg = await generateStudioPdf({
      title: "Declaração",
      sections: [
        {
          id: "a",
          type: "text",
          title: "Declaração",
          content: "Texto fluído de declaração profissional.",
          order: 0,
          enabled: true,
          pageBreakBefore: false,
        },
      ],
      branding,
      logoBytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
      logoMime: "image/svg+xml",
      documentId: "local",
      version: 1,
      layout: "tradicional",
    });
    expect(Buffer.from(withSvg.slice(0, 5)).toString("utf8")).toBe("%PDF-");
  });
});

describe("placeholders de emissão", () => {
  it("um relatório com {{sessions.count}} não resolvido é bloqueado", () => {
    const report = getSystemTemplate("psychological_report_complete")!;
    const body = report
      .buildSections({ today: "30/08/2026" })
      .map((section) => section.content)
      .join("\n");
    expect(hasUnresolvedPlaceholders(body)).toBe(true);
  });
});
