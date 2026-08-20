import { describe, expect, it } from "vitest";
import {
  MoneyParseError,
  addCents,
  centsFromCanonical,
  deriveChargeStatus,
  formatBRL,
  formatCents,
  parseToCents,
  remainingCents,
} from "@/lib/finance/money";

describe("parseToCents / formatCents", () => {
  it("não usa ponto flutuante: 0,10 + 0,20 = 0,30", () => {
    const sum = addCents(parseToCents("0,10"), parseToCents("0,20"));
    expect(formatCents(sum)).toBe("0.30");
    expect(sum).toBe(30);
  });

  it("10,10 + 0,10 = 10,20 (o clássico 10.199999... do float)", () => {
    expect(formatCents(addCents(parseToCents("10,10"), parseToCents("0,10")))).toBe(
      "10.20",
    );
  });

  it("aceita ponto, vírgula e milhar brasileiro", () => {
    expect(parseToCents("1500.50")).toBe(150050);
    expect(parseToCents("1500,50")).toBe(150050);
    expect(parseToCents("R$ 1.500,50")).toBe(150050);
    expect(parseToCents("1500")).toBe(150000);
  });

  it("rejeita texto que não é dinheiro", () => {
    expect(() => parseToCents("abc")).toThrow(MoneyParseError);
    expect(() => parseToCents("")).toThrow(MoneyParseError);
  });

  it("formatBRL agrupa milhar", () => {
    expect(formatBRL(150050)).toBe("R$ 1.500,50");
    expect(formatBRL(30)).toBe("R$ 0,30");
  });

  it("centsFromCanonical lê o formato do banco", () => {
    expect(centsFromCanonical("10.10")).toBe(1010);
    expect(centsFromCanonical(10.1)).toBe(1010);
    expect(centsFromCanonical(null)).toBe(0);
  });
});

describe("deriveChargeStatus", () => {
  it("pago quando a soma cobre o valor", () => {
    expect(
      deriveChargeStatus({ amountCents: 10000, paidCents: 10000, dueDate: "2026-08-01" }),
    ).toBe("paid");
  });

  it("parcial quando há pagamento abaixo do valor", () => {
    expect(
      deriveChargeStatus({ amountCents: 10000, paidCents: 4000, dueDate: "2026-08-01" }),
    ).toBe("partially_paid");
  });

  it("atrasado quando venceu e não há pagamento", () => {
    expect(
      deriveChargeStatus({
        amountCents: 10000,
        paidCents: 0,
        dueDate: "2026-08-01",
        today: "2026-08-20",
      }),
    ).toBe("overdue");
  });

  it("pendente quando ainda não venceu", () => {
    expect(
      deriveChargeStatus({
        amountCents: 10000,
        paidCents: 0,
        dueDate: "2026-08-30",
        today: "2026-08-20",
      }),
    ).toBe("pending");
  });

  it("cancelado/estornado não é recalculado pela soma", () => {
    expect(
      deriveChargeStatus({
        amountCents: 10000,
        paidCents: 10000,
        dueDate: null,
        lockedStatus: "canceled",
      }),
    ).toBe("canceled");
  });

  it("remainingCents nunca fica negativo", () => {
    expect(remainingCents(10000, 4000)).toBe(6000);
    expect(remainingCents(10000, 12000)).toBe(0);
  });
});
