import Link from "next/link";
import type { IndicatorSnapshot } from "@/features/dashboard/indicator-queries";
import { formatBRL } from "@/lib/finance/money";

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-card p-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="font-serif text-[28px] font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function BarChart({
  title,
  points,
  max,
  suffix = "",
}: {
  title: string;
  points: Array<{ label: string; value: number }>;
  max: number;
  suffix?: string;
}) {
  const ceiling = Math.max(max, 1);
  return (
    <section className="rounded-[20px] border border-border bg-card p-5">
      <h2 className="font-serif text-lg font-bold text-foreground">{title}</h2>
      <div className="mt-6 flex h-40 items-end gap-2">
        {points.map((point, index) => (
          <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {point.value}
              {suffix}
            </span>
            <div
              className={
                index === points.length - 2
                  ? "w-full rounded-t-sm bg-sage-700"
                  : "w-full rounded-t-sm bg-sage-light"
              }
              style={{ height: `${Math.max(4, (point.value / ceiling) * 100)}%` }}
            />
            <span className="text-[10px] text-muted-foreground">{point.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function IndicatorsBoard({ snapshot }: { snapshot: IndicatorSnapshot }) {
  const weekMax = Math.max(...snapshot.weeklySessions.map((point) => point.count), 1);
  const cancelMax = Math.max(
    ...snapshot.monthlyCancellations.map((point) => point.percent),
    1,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Pacientes ativos"
          value={String(snapshot.activePatients)}
          hint="Cadastros com situação ativa"
        />
        <KpiCard
          label="Novos pacientes (mês)"
          value={String(snapshot.newPatientsThisMonth)}
          hint="Entradas neste mês calendário"
        />
        <KpiCard
          label="Sessões realizadas"
          value={String(snapshot.sessionsThisMonth)}
          hint="Este mês acumulado"
        />
        <KpiCard
          label="Taxa de comparecimento"
          value={`${snapshot.attendancePercent}%`}
          hint="Concluídas vs. faltas e cancelamentos"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BarChart
          title="Sessões por semana (últimas 8 semanas)"
          points={snapshot.weeklySessions.map((point) => ({
            label: point.label,
            value: point.count,
          }))}
          max={weekMax}
        />
        <BarChart
          title="Cancelamentos e faltas (últimos 6 meses)"
          points={snapshot.monthlyCancellations.map((point) => ({
            label: point.label,
            value: point.percent,
          }))}
          max={cancelMax}
          suffix="%"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[20px] border border-border bg-card p-5">
          <h2 className="font-serif text-lg font-bold text-foreground">
            Ocupação da agenda ({snapshot.occupancyPercent}%)
          </h2>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-sage-700"
              style={{ width: `${snapshot.occupancyPercent}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Sua agenda ideal possui {snapshot.capacityHours} horas semanais disponíveis. Você
            está com {snapshot.filledHours} preenchidas.
          </p>
        </section>
        <section className="rounded-[20px] border border-border bg-card p-5">
          <h2 className="font-serif text-lg font-bold text-foreground">Inadimplência clínica</h2>
          <p className="mt-2 font-serif text-[28px] font-bold text-accent">
            {formatBRL(snapshot.overdueCents)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {snapshot.overduePatients === 0
              ? "Nenhum paciente com fatura vencida."
              : `${snapshot.overduePatients} paciente(s) com faturas vencidas.`}
          </p>
          <Link
            href="/app/finance"
            className="mt-4 inline-block text-sm font-semibold text-sage-700 hover:text-primary"
          >
            Ver no Financeiro →
          </Link>
        </section>
      </div>
    </div>
  );
}
