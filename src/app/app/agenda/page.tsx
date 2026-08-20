import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { AgendaBoard } from "@/features/calendar/components/agenda-board";
import { getConnection } from "@/features/calendar/connection-queries";
import { listAppointments } from "@/features/calendar/appointment-queries";
import { computeAgendaWindow, todayInTimeZone, type AgendaView } from "@/features/calendar/date-window";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Agenda — SerenaPsi" };

function parseView(value: string | undefined): AgendaView {
  return value === "week" || value === "month" ? value : "day";
}

export default async function AgendaPage({
  searchParams,
}: PageProps<"/app/agenda">) {
  const { organizationId, timezone, role } = await requireOrgContext();
  const params = await searchParams;

  const view = parseView(typeof params.view === "string" ? params.view : undefined);
  const referenceDate =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayInTimeZone(timezone);

  const window = computeAgendaWindow(view, referenceDate, timezone);

  const [appointments, connection, patients] = await Promise.all([
    listAppointments(organizationId, { fromIso: window.fromIso, toIso: window.toIso }),
    getConnection(organizationId),
    listPatients(organizationId, { status: "active" }),
  ]);

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
          Não foi possível conectar o Google Calendar agora. Tente novamente.
        </p>
      ) : null}

      <AgendaBoard
        view={view}
        referenceDate={referenceDate}
        timeZone={timezone}
        appointments={appointments}
        patients={patients.map((patient) => ({
          id: patient.id,
          preferred_name: patient.preferred_name,
          public_code: patient.public_code,
        }))}
        connection={connection}
        canManageConnection={role === "psychologist_admin"}
      />
    </PageContainer>
  );
}
