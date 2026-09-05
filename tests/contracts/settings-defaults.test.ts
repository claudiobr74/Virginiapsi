import { describe, expect, it } from "vitest";
import {
  appearanceFormSchema,
  clinicFormSchema,
  defaultPracticeSettings,
} from "@/features/settings/contracts";

describe("defaultPracticeSettings", () => {
  it("abre Configurações com defaults quando a linha ainda não existe", () => {
    const row = defaultPracticeSettings("11111111-1111-4111-8111-111111111111");
    expect(row.session_duration_minutes).toBe(50);
    expect(row.secretary_finance_access).toBe("none");
    expect(row.inactivity_timeout_minutes).toBe(15);
    expect(row.quote_mode).toBe("daily");
    expect(row.professional_cpf).toBeNull();
    expect(row.company_cnpj).toBeNull();
  });
});

const clinicBase = {
  organizationName: "Consultório",
  timezone: "America/Sao_Paulo",
  sessionDurationMinutes: 50,
};

describe("clinicFormSchema — CPF e CNPJ", () => {
  it("aceita só CPF, só CNPJ, ambos ou nenhum", () => {
    expect(clinicFormSchema.safeParse(clinicBase).success).toBe(true);
    expect(
      clinicFormSchema.safeParse({ ...clinicBase, professionalCpf: "529.982.247-25" }).success,
    ).toBe(true);
    expect(
      clinicFormSchema.safeParse({ ...clinicBase, companyCnpj: "11.222.333/0001-81" }).success,
    ).toBe(true);
    expect(
      clinicFormSchema.safeParse({
        ...clinicBase,
        professionalCpf: "529.982.247-25",
        companyCnpj: "11.222.333/0001-81",
      }).success,
    ).toBe(true);
  });

  it("rejeita dígitos verificadores inválidos", () => {
    expect(
      clinicFormSchema.safeParse({ ...clinicBase, professionalCpf: "111.111.111-11" }).success,
    ).toBe(false);
    expect(
      clinicFormSchema.safeParse({ ...clinicBase, companyCnpj: "00.000.000/0000-00" }).success,
    ).toBe(false);
  });
});

describe("appearanceFormSchema — modo da citação", () => {
  it("daily não exige texto e custom limita a 280", () => {
    expect(appearanceFormSchema.safeParse({ quoteMode: "daily" }).success).toBe(true);
    expect(
      appearanceFormSchema.safeParse({ quoteMode: "custom", quote: "texto" }).success,
    ).toBe(true);
    expect(
      appearanceFormSchema.safeParse({ quoteMode: "custom", quote: "x".repeat(281) }).success,
    ).toBe(false);
  });
});
