import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/knowledge/chunking";

describe("chunkText", () => {
  it("retorna vazio para texto vazio/em branco", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("texto menor que o tamanho do chunk vira um único chunk", () => {
    const chunks = chunkText("Texto curto.", { chunkSize: 1500 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ sequence: 0, text: "Texto curto.", charStart: 0, charEnd: 12 });
  });

  it("divide texto longo em múltiplos chunks sequenciais", () => {
    const text = "Frase numero um. ".repeat(200);
    const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, index) => {
      expect(chunk.sequence).toBe(index);
    });
  });

  it("chunks consecutivos têm sobreposição de caracteres (overlap)", () => {
    const text = "A".repeat(3000);
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].charStart).toBeLessThan(chunks[i - 1].charEnd);
    }
  });

  it("prefere quebrar em fronteira de parágrafo quando existe uma na janela", () => {
    const paragraph1 = "Primeiro parágrafo. ".repeat(30);
    const paragraph2 = "Segundo parágrafo totalmente diferente. ".repeat(30);
    const text = `${paragraph1}\n\n${paragraph2}`;
    const chunks = chunkText(text, { chunkSize: paragraph1.length + 50, overlap: 20 });
    expect(chunks[0].text.endsWith(".")).toBe(true);
  });

  it("nunca produz chunk vazio", () => {
    const text = "x".repeat(5000);
    const chunks = chunkText(text, { chunkSize: 300, overlap: 30 });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it("a concatenação dos charStart/charEnd cobre o texto original sem buracos grandes", () => {
    const text = "Parágrafo de teste. ".repeat(100);
    const chunks = chunkText(text, { chunkSize: 400, overlap: 40 });
    expect(chunks[0].charStart).toBe(0);
    expect(chunks.at(-1)!.charEnd).toBeGreaterThanOrEqual(text.trim().length - 1);
  });
});
