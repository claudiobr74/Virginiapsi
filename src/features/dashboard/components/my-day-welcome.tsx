import { CreditCard, MessageCircle, Plus, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MyDaySnapshot } from "@/features/dashboard/contracts";
import { formatBRL } from "@/lib/finance/money";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-[16px] border border-border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="font-serif text-[28px] font-bold leading-tight text-foreground">{value}</p>
      </div>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}

export function MyDayWelcome({ snapshot }: { snapshot: MyDaySnapshot }) {
  const todayCount = snapshot.metrics.sessionsToday;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-serif text-[28px] font-bold leading-tight text-foreground">
            {snapshot.greeting.prefix}, {snapshot.greeting.professionalName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {todayCount === 0
              ? "Nenhuma sessão agendada para hoje."
              : todayCount === 1
                ? "Você tem 1 sessão hoje."
                : `Você tem ${todayCount} sessões hoje.`}
            {snapshot.greeting.quote ? (
              <>
                {" "}
                <span className="text-sage-700">
                  {snapshot.greeting.quote}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/app/agenda?new=1">
            <Plus className="size-3.5" aria-hidden />
            Atendimento Avulso
          </Link>
        </Button>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sessões esta semana"
          value={String(snapshot.metrics.sessionsThisWeek)}
          icon={MessageCircle}
        />
        <StatCard
          label="Pacientes ativos"
          value={String(snapshot.metrics.activePatients)}
          icon={Users}
        />
        <StatCard
          label="Pendências clínicas"
          value={String(snapshot.metrics.clinicalPendencies)}
          icon={TriangleAlert}
        />
        <StatCard
          label="Recebimentos do mês"
          value={formatBRL(snapshot.metrics.monthReceiptsCents)}
          icon={CreditCard}
        />
      </div>
    </section>
  );
}
