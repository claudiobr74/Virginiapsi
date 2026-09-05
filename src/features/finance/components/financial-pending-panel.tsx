import { WalletCards } from "lucide-react";
import Link from "next/link";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import type { ChargeView } from "@/features/finance/contracts";
import { formatBRL } from "@/lib/finance/money";

export function FinancialPendingPanel({ charges }: { charges: ChargeView[] }) {
  return (
    <DashboardWidget
      id="finance-pending-heading"
      title="Pendências Financeiras"
      tone="finance"
      icon={<WalletCards />}
      actions={
        <Link href="/app/finance" className="text-sm font-semibold text-primary hover:underline">
          Abrir financeiro
        </Link>
      }
      empty={charges.length === 0}
      emptyLabel="Nenhuma pendência financeira hoje."
    >
      <ul className="flex flex-col gap-2">
        {charges.map((charge) => (
          <li key={charge.row.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">
              {charge.patientName ?? "Sem paciente"}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-semibold tabular-nums text-failed">
                {formatBRL(charge.remainingCents)}
              </span>
              <Link
                href="/app/finance"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Cobrar
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </DashboardWidget>
  );
}
