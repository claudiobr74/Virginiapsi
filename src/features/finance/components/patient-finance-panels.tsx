"use client";

import { Banknote } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CHARGE_STATUS_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  type ChargeView,
  type PlanRow,
  type SecretaryFinanceAccess,
} from "@/features/finance/contracts";
import { chargeBadgeStatus, planBadgeStatus } from "@/features/finance/status-badge";
import { formatBRL } from "@/lib/finance/money";

function AccessEmpty() {
  return (
    <EmptyState
      icon={Banknote}
      title="Sem acesso ao financeiro"
      description="A administradora não liberou visualização financeira para este perfil."
    />
  );
}

export function PatientPlansBlock({
  access,
  plans,
}: {
  access: SecretaryFinanceAccess;
  plans: PlanRow[];
}) {
  if (access === "none") return <AccessEmpty />;
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={Banknote}
        title="Nenhum plano neste paciente"
        description="Pacotes e mensalidades lançados no Financeiro aparecem aqui."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {plans.map((plan) => (
        <li
          key={plan.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-sm"
        >
          <span>
            {PLAN_TYPE_LABELS[plan.plan_type]} · {plan.used_sessions}
            {plan.total_sessions != null ? `/${plan.total_sessions}` : ""} sessões
          </span>
          <StatusBadge status={planBadgeStatus(plan.status)} label={PLAN_STATUS_LABELS[plan.status]} />
        </li>
      ))}
    </ul>
  );
}

export function PatientPendingBlock({
  access,
  charges,
}: {
  access: SecretaryFinanceAccess;
  charges: ChargeView[];
}) {
  if (access === "none") return <AccessEmpty />;
  const open = charges.filter((charge) =>
    ["pending", "partially_paid", "overdue"].includes(charge.row.status),
  );
  if (open.length === 0) {
    return (
      <EmptyState
        icon={Banknote}
        title="Nenhuma pendência financeira"
        description="Cobranças em aberto deste paciente aparecem aqui."
      />
    );
  }
  return <ChargeList charges={open} />;
}

export function PatientStatementBlock({
  access,
  charges,
}: {
  access: SecretaryFinanceAccess;
  charges: ChargeView[];
}) {
  if (access === "none") return <AccessEmpty />;
  if (charges.length === 0) {
    return (
      <EmptyState
        icon={Banknote}
        title="Extrato vazio"
        description="Cobranças e recebimentos deste paciente serão listados aqui."
      />
    );
  }
  return <ChargeList charges={charges} />;
}

function ChargeList({ charges }: { charges: ChargeView[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {charges.map((charge) => (
        <li
          key={charge.row.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-sm"
        >
          <span>
            {charge.row.description}
            <span className="text-muted-foreground"> · {charge.row.competence_date}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums font-semibold">{formatBRL(charge.amountCents)}</span>
            <StatusBadge
              status={chargeBadgeStatus(charge.row.status)}
              label={CHARGE_STATUS_LABELS[charge.row.status]}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
