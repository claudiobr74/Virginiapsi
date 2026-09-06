import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/app/finance/page.tsx", "utf8");
const adapter = readFileSync(
  "src/features/finance/components/finance-console-phase4.tsx",
  "utf8",
);
const reports = readFileSync(
  "src/features/finance/components/finance-reports-phase4.tsx",
  "utf8",
);
const actions = readFileSync("src/features/finance/phase4-actions.ts", "utf8");

describe("Financeiro v2 — F4 integração caixa x competência", () => {
  it("routes the finance page through the phase4 adapter and hides the legacy reports tab", () => {
    expect(page).toContain("FinanceConsolePhase4");
    expect(adapter).toContain('button:nth-child(4)');
    expect(adapter).toContain("FinanceReportsPhase4");
  });

  it("shows explicit competence and cash reporting surfaces", () => {
    expect(reports).toContain("Relatórios — caixa × competência");
    expect(reports).toContain("Competência");
    expect(reports).toContain("Caixa");
    expect(reports).toContain("Despesas pagas");
    expect(reports).toContain("Um fechamento de competência não impede recebimento posterior.");
  });

  it("derives cash from real payment and expense paid_at dates in organization timezone", () => {
    expect(reports).toContain("dateInTimeZone(payment.paid_at, timezone)");
    expect(reports).toContain("dateInTimeZone(expense.paid_at, timezone)");
    expect(reports).not.toContain("charge.row.competence_date))\n      .reduce((sum, charge) => sum + charge.paidCents");
  });

  it("exports cash one payment at a time and labels the cash date explicitly", () => {
    expect(actions).toContain('parsed.data.mode === "cash"');
    expect(actions).toContain('"Data caixa"');
    expect(actions).toContain("const rows = payments");
    expect(actions).toContain(".map((payment) => ({ payment, cashDate:");
    expect(actions).toContain("const paymentCents = amountCents(payment.amount)");
    expect(reports).toContain("cada pagamento real vira uma linha própria");
  });

  it("uses the VirgíniaPsi filename instead of the legacy Tesseli name", () => {
    expect(reports).toContain("virginiapsi-financeiro-");
    expect(reports).not.toContain("tesseli-financeiro");
  });
});
