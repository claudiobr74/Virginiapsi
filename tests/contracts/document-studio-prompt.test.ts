import { describe, expect, it } from "vitest";
import { RUNTIME_PROMPTS } from "@/lib/ai/prompts";

describe("prompt de redação assistida do Document Studio", () => {
  it("compõe o núcleo clínico com as proibições de fabricação do estúdio", () => {
    const prompt = RUNTIME_PROMPTS.documentStudio;
    expect(prompt).toContain("DOCUMENT STUDIO");
    expect(prompt).toContain("Nunca emita");
    expect(prompt).toContain("diagnóstico");
    expect(prompt).toContain("CID");
    expect(prompt).toContain("[[REVISAR:");
    expect(prompt).toContain("FRONTEIRA DE EVIDÊNCIA");
    expect(prompt).not.toContain("MODO: APOIO DURANTE SESSÃO");
  });
});
