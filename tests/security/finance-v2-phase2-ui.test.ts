import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const financeConsole = readFileSync(
  "src/features/finance/components/finance-console.tsx",
  "utf8",
);

describe("finance v2 phase2 audit UX", () => {
  it("does not keep generic destructive-operation reasons", () => {
    expect(financeConsole).not.toContain("Cancelamento operacional");
    expect(financeConsole).not.toContain("Estorno operacional");
    expect(financeConsole).toContain("Informe o motivo do cancelamento da cobrança:");
    expect(financeConsole).toContain("Informe o motivo do estorno do pagamento:");
    expect(financeConsole).toContain("Informe o motivo da reabertura do período:");
  });

  it("uses the effective overdue status as the UI source of truth", () => {
    expect(financeConsole).toContain(
      'const overdue = openCharges.filter((charge) => charge.row.status === "overdue");',
    );
    expect(financeConsole).toContain(
      '.filter((charge) => charge.row.status === "overdue")',
    );
    expect(financeConsole).not.toContain(
      'charge.row.due_date < today && charge.remainingCents > 0',
    );
  });

  it("labels NFS-e as an administrative marker rather than issuance", () => {
    expect(financeConsole).toContain("Marcar solicitação de NFS-e");
    expect(financeConsole).toContain("NFS-e marcada");
    expect(financeConsole).toContain(
      "NFS-e: registro administrativo; não emite nota fiscal automaticamente.",
    );
  });
});
