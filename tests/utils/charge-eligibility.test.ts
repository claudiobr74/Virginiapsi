import { describe, expect, it } from "vitest";
import { sessionChargeIsApplicable } from "@/features/sessions/charge-eligibility";

describe("elegibilidade de cobrança na finalização", () => {
  it("oferece cobrança quando há valor padrão e nenhum plano mensal", () => {
    expect(
      sessionChargeIsApplicable({
        defaultSessionValue: "150.00",
        plans: [],
      }),
    ).toBe(true);
  });

  it("não oferece cobrança avulsa quando o plano mensal cobre a sessão", () => {
    expect(
      sessionChargeIsApplicable({
        defaultSessionValue: "150.00",
        plans: [
          {
            status: "active",
            plan_type: "monthly",
            total_sessions: null,
            used_sessions: 0,
          },
        ],
      }),
    ).toBe(false);
  });

  it("oferece quando há pacote com sessão restante", () => {
    expect(
      sessionChargeIsApplicable({
        defaultSessionValue: null,
        plans: [
          {
            status: "active",
            plan_type: "prepaid_package",
            total_sessions: 8,
            used_sessions: 2,
          },
        ],
      }),
    ).toBe(true);
  });
});
