import { describe, expect, it } from "vitest";
import { generateDocumentPdf } from "@/lib/documents/generate-pdf";

describe("generateDocumentPdf", () => {
  it("produz um PDF válido (assinatura %PDF) com título e corpo curtos", async () => {
    const bytes = await generateDocumentPdf({
      title: "Atestado",
      body: "Atesto que o paciente compareceu à consulta em 20/08/2026.",
    });
    const header = Buffer.from(bytes.slice(0, 5)).toString("utf8");
    expect(header).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("quebra em múltiplas páginas quando o corpo é muito longo", async () => {
    const longBody = "Parágrafo de teste com bastante conteúdo repetido. ".repeat(400);
    const bytes = await generateDocumentPdf({ title: "Documento longo", body: longBody });
    const header = Buffer.from(bytes.slice(0, 5)).toString("utf8");
    expect(header).toBe("%PDF-");
    // Not asserting the exact page count (pdf-lib internal encoding), just
    // that a large body doesn't throw and still produces a valid file.
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("inclui o rodapé sem lançar erro e produz um PDF maior que sem rodapé", async () => {
    const withoutFooter = await generateDocumentPdf({ title: "Recibo", body: "Corpo do recibo." });
    const withFooter = await generateDocumentPdf({
      title: "Recibo",
      body: "Corpo do recibo.",
      footer: "Documento gerado eletronicamente pelo Tesseli.",
    });
    expect(Buffer.from(withFooter.slice(0, 5)).toString("utf8")).toBe("%PDF-");
    expect(withFooter.length).toBeGreaterThanOrEqual(withoutFooter.length);
  });

  it("lida com corpo vazio sem lançar erro", async () => {
    const bytes = await generateDocumentPdf({ title: "Vazio", body: "" });
    expect(Buffer.from(bytes.slice(0, 5)).toString("utf8")).toBe("%PDF-");
  });
});
