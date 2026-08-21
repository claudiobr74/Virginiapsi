import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { loadAgendaPageData } from "@/features/calendar/agenda-page-data";
import { AgendaBoard } from "@/features/calendar/components/agenda-board";
import {
  computeAgendaWindow,
  resolveTimeZone,
  todayInTimeZone,
  type AgendaView,
} from "@/features/calendar/date-window";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Agenda — Tesseli" };

function parseView(value: string | undefined): AgendaView {
  return value === "week" || value === "month" ? value : "day";
}

export default async function AgendaPage({
  searchParams,
}: PageProps<"/app/agenda">) {
  const { organizationId, timezone, role } = await requireOrgContext();
  const params = await searchParams;
  const timeZone = resolveTimeZone(timezone);

  const view = parseView(typeof params.view === "string" ? params.view : undefined);
  const referenceDate =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayInTimeZone(timeZone);

  const window = computeAgendaWindow(view, referenceDate, timeZone);
  const { appointments, connection, patients } = await loadAgendaPageData(
    organizationId,
    { fromIso: window.fromIso, toIso: window.toIso },
  );

  const googleStatus = typeof params.google === "string" ? params.google : undefined;

  return (
    <PageContainer>
      <PageHeader
        icon={CalendarDays}
        title="Agenda"
        subtitle="Google Calendar como agenda externa oficial, com Meet real para consultas online"
      />

      {googleStatus === "connected" ? (
        <p
          role="status"
          className="rounded-2xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success"
        >
          Google Calendar conectado com sucesso.
        </p>
      ) : googleStatus === "error" ? (
        <p
          role="alert"
          className="rounded-2xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          Não foi possível conectar o Google Calendar. O endereço de retorno da
          Agenda é o do site com /api/integrations/google/callback — não use o
          endereço do login. Cadastre o mesmo na Vercel e no Google Cloud.
        </p>
      ) : null}

      <Suspense>
        <AgendaBoard
          view={view}
          referenceDate={referenceDate}
          timeZone={timeZone}
          appointments={appointments}
          patients={patients}
          connection={connection}
          canManageConnection={role === "psychologist_admin"}
        />
      </Suspense>
    </PageContainer>
  );
}
