import { HeartHandshake, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MyDaySnapshot } from "@/features/dashboard/contracts";
import {
  daySpanLabel,
  finalizeCountLabel,
  nextSessionStatName,
  nextSessionStatTime,
  pendingTotalCents,
  sessionCountLabel,
} from "@/features/dashboard/stats";
import { formatBRL } from "@/lib/finance/money";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl border border-border bg-background p-4">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-serif text-[22px] font-semibold leading-tight text-foreground">
        {value}
      </p>
      <p className="truncate font-mono text-[11px] text-sage-700">{hint}</p>
    </div>
  );
}

export function MyDayWelcome({ snapshot }: { snapshot: MyDaySnapshot }) {
  const pendingCents = pendingTotalCents(snapshot.financialPending);
  const finalizeCount = snapshot.sessionsToFinalize.length;

  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-[#f2f4f0] text-sage-700 dark:bg-surface">
            <HeartHandshake className="size-7" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="sr-only">Meu Dia</h1>
            <p className="font-serif text-[28px] italic font-medium leading-tight text-foreground">
              {snapshot.greeting.prefix}, {snapshot.greeting.professionalName}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {snapshot.roleLabel}
              {snapshot.clinicName ? (
                <>
                  <span className="mx-1.5 text-border" aria-hidden>
                    ·
                  </span>
                  <span className="font-mono text-[11px] text-sage-700">
                    {snapshot.clinicName}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" className="rounded-full border-primary text-primary">
          <Link href="/app/agenda?new=1">
            <Plus className="size-3.5" aria-hidden />
            Atendimento Avulso
          </Link>
        </Button>
      </div>

      <div className="h-px w-full bg-border" aria-hidden />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
        {snapshot.greeting.quote ? (
          <div className="flex w-full shrink-0 flex-col gap-1 xl:w-[280px]">
            <p className="font-serif text-base italic text-sage-700">Acolhimento de hoje</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              “{snapshot.greeting.quote}”
            </p>
          </div>
        ) : null}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Atendimentos Hoje"
            value={sessionCountLabel(snapshot.timeline.length)}
            hint={daySpanLabel(snapshot.timeline, snapshot.timezone)}
          />
          <StatCard
            label="Próxima Sessão"
            value={nextSessionStatTime(snapshot.nextSession, snapshot.timezone)}
            hint={nextSessionStatName(snapshot.nextSession)}
          />
          <StatCard
            label="A Finalizar"
            value={finalizeCountLabel(finalizeCount)}
            hint={finalizeCount === 0 ? "Tudo em dia!" : "Pendentes de envio"}
          />
          <StatCard
            label="Pendências"
            value={formatBRL(pendingCents)}
            hint={
              pendingCents === 0 ? "Nenhum faturamento pendente" : "Faturamento pendente"
            }
          />
        </div>
      </div>
    </section>
  );
}
