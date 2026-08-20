import Link from "next/link";
import { Banknote } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { CHARGE_STATUS_LABELS, type ChargeView } from "@/features/finance/contracts";
import { chargeBadgeStatus } from "@/features/finance/status-badge";
import { formatBRL } from "@/lib/finance/money";

export function FinancialPendingPanel({ charges }: { charges: ChargeView[] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="finance-pending-heading">
      <SectionHeader
        id="finance-pending-heading"
        title="Pendências financeiras"
        actions={
          <Link
            href="/app/finance"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Abrir financeiro
          </Link>
        }
      />
      {charges.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Nenhuma pendência financeira hoje"
          description="Vencimentos do dia e atrasos aparecem aqui para baixa rápida."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {charges.map((charge) => (
            <li
              key={charge.row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm"
            >
              <span>
                {charge.patientName ?? "Sem paciente"} · {charge.row.description}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums font-semibold">
                  {formatBRL(charge.remainingCents)}
                </span>
                <StatusBadge
                  status={chargeBadgeStatus(charge.row.status)}
                  label={CHARGE_STATUS_LABELS[charge.row.status]}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
