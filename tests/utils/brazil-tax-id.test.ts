import { describe, expect, it } from "vitest";
import {
  cnpjInputValue,
  cpfInputValue,
  digitsOnly,
  formatCnpjDisplay,
  formatCpfDisplay,
  isValidCnpj,
  isValidCpf,
  normalizeOptionalCnpj,
  normalizeOptionalCpf,
} from "@/lib/utils/brazil-tax-id";

describe("CPF e CNPJ", () => {
  it("valida dígitos verificadores e aceita pontuação", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });

  it("persiste somente dígitos e formata a entrada", () => {
    expect(digitsOnly("529.982.247-25")).toBe("52998224725");
    expect(normalizeOptionalCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizeOptionalCpf("  ")).toBeNull();
    expect(normalizeOptionalCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(cpfInputValue("52998224725")).toBe("529.982.247-25");
    expect(cnpjInputValue("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCpfDisplay("52998224725")).toBe("529.982.247-25");
    expect(formatCnpjDisplay("11222333000181")).toBe("11.222.333/0001-81");
  });
});
