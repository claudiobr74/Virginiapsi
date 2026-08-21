import { describe, expect, it } from "vitest";
import {
  ageFromBirthDate,
  formatBirthDateLabel,
  formatCadastroDate,
  formatCpfDisplay,
} from "@/features/patients/display";

describe("ageFromBirthDate", () => {
  it("calcula a idade no aniversário", () => {
    expect(ageFromBirthDate("1995-10-28", new Date("2024-10-28T12:00:00"))).toBe(29);
  });

  it("ainda não fez aniversário neste ano", () => {
    expect(ageFromBirthDate("1995-10-28", new Date("2024-03-15T12:00:00"))).toBe(28);
  });

  it("retorna nulo sem data", () => {
    expect(ageFromBirthDate(null)).toBeNull();
  });
});

describe("formatBirthDateLabel", () => {
  it("inclui a idade quando há nascimento", () => {
    expect(formatBirthDateLabel("1995-10-28")).toMatch(/28\/10\/1995 \(\d+ anos\)/);
  });
});

describe("formatCadastroDate", () => {
  it("formata a data de cadastro em pt-BR", () => {
    expect(formatCadastroDate("2024-03-15T12:00:00.000Z")).toMatch(/15\/03\/2024/);
  });
});

describe("formatCpfDisplay", () => {
  it("máscara CPF com 11 dígitos", () => {
    expect(formatCpfDisplay("12345678900")).toBe("123.456.789-00");
  });

  it("usa travessão quando vazio", () => {
    expect(formatCpfDisplay(null)).toBe("—");
  });
});
