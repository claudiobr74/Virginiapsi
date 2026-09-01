import {
  CreditCard,
  MessageCircle,
  Plus,
  Quote,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ToneIcon } from "@/components/ui/tone-icon";
import type { MyDaySnapshot } from "@/features/dashboard/contracts";
import { ProfessionalAvatar } from "@/features/settings/components/professional-avatar";
import { DailyQuoteRefresh } from "@/features/appearance/daily-quote-refresh";
import { formatBRL } from "@/lib/finance/money";
import type { SurfaceTone } from "@/lib/ui/surface-tone";
import { TONE_SURFACE } from "@/lib/ui/surface-tone";
import { cn } from "@/lib/utils/cn";

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  tone: SurfaceTone;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-start justify-between gap-3 rounded-[16px] border p-4 shadow-card",
        TONE_SURFACE[tone],
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="font-serif text-[28px] font-bold leading-tight tabular-nums text-foreground">
          {value}
        </p>
      </div>
      <ToneIcon tone={tone} className="size-8 [&_svg]:size-4">
        <Icon />
      </ToneIcon>
    </div>
  );
}

export function MyDayWelcome({ snapshot }: { snapshot: MyDaySnapshot }) {
  const todayCount = snapshot.metrics.sessionsToday;

  return (
    <section className="flex flex-col gap-5">
      <DailyQuoteRefresh
        timeZone={snapshot.timezone}
        serverCivilDate={snapshot.quoteCivilDate}
      />
      <div className="myday-hero flex flex-col gap-4 rounded-[20px] border border-tone-clinical-border p-5 shadow-card sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <ProfessionalAvatar
            name={snapshot.greeting.professionalName}
            photoUrl={snapshot.professionalPhotoUrl}
            size="md"
          />
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
            </p>
            {snapshot.greeting.quote ? (
              <blockquote className="mt-2 flex items-start gap-2 rounded-xl border border-tone-tasks-border bg-card/90 px-3 py-2.5">
                <Quote
                  className="mt-0.5 size-4 shrink-0 text-tone-tasks-icon"
                  aria-hidden
                />
                <p className="text-sm leading-5 text-foreground">{snapshot.greeting.quote}</p>
              </blockquote>
            ) : null}
          </div>
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
          tone="agenda"
        />
        <StatCard
          label="Pacientes ativos"
          value={String(snapshot.metrics.activePatients)}
          icon={Users}
          tone="clinical"
        />
        <StatCard
          label="Pendências clínicas"
          value={String(snapshot.metrics.clinicalPendencies)}
          icon={TriangleAlert}
          tone="tasks"
        />
        <StatCard
          label="Recebimentos do mês"
          value={formatBRL(snapshot.metrics.monthReceiptsCents)}
          icon={CreditCard}
          tone="finance"
        />
      </div>
    </section>
  );
}
