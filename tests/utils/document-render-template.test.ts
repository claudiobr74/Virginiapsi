import { describe, expect, it } from "vitest";
import { extractPlaceholders, renderTemplate } from "@/lib/documents/render-template";

describe("renderTemplate", () => {
  it("substitui placeholders conhecidos", () => {
    const result = renderTemplate("Atesto que {{patient.full_name}} compareceu.", {
      "patient.full_name": "Beatriz Lima",
    });
    expect(result).toBe("Atesto que Beatriz Lima compareceu.");
  });

  it("mantém o placeholder literal quando a variável não existe (nunca some silenciosamente)", () => {
    const result = renderTemplate("Paciente: {{patient.full_name}}", {});
    expect(result).toBe("Paciente: {{patient.full_name}}");
  });

  it("substitui múltiplas ocorrências e múltiplas variáveis", () => {
    const result = renderTemplate(
      "{{professional.name}} atesta que {{patient.full_name}} ({{patient.public_code}}) foi atendido por {{professional.name}}.",
      {
        "professional.name": "Ana Serena",
        "patient.full_name": "Beatriz Lima",
        "patient.public_code": "PAC-001",
      },
    );
    expect(result).toBe(
      "Ana Serena atesta que Beatriz Lima (PAC-001) foi atendido por Ana Serena.",
    );
  });

  it("tolera espaços dentro das chaves", () => {
    const result = renderTemplate("{{ patient.full_name }}", { "patient.full_name": "X" });
    expect(result).toBe("X");
  });

  it("nunca interpreta o corpo como HTML/instrução — troca é texto puro", () => {
    const result = renderTemplate("{{patient.full_name}}", {
      "patient.full_name": "<script>alert(1)</script>",
    });
    expect(result).toBe("<script>alert(1)</script>");
  });
});

describe("extractPlaceholders", () => {
  it("lista placeholders únicos em ordem de aparição", () => {
    const placeholders = extractPlaceholders(
      "{{patient.full_name}} - {{patient.public_code}} - {{patient.full_name}}",
    );
    expect(placeholders).toEqual(["patient.full_name", "patient.public_code"]);
  });

  it("retorna vazio quando não há placeholders", () => {
    expect(extractPlaceholders("Texto sem variáveis.")).toEqual([]);
  });
});
