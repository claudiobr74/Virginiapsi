import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer } from "@/components/ui/page-container";
import { loadAgendaPageData } from "@/features/calendar/agenda-page-data";
import { AgendaBoard } from "@/features/calendar/components/agenda-board";
import {
  computeAgendaWindow,
  resolveTimeZone,
  todayInTimeZone,
  type AgendaView,
} from "@/features/calendar/date-window";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { peekGoogleCalendarRedirectUri } from "@/lib/env/server";
import { GoogleOAuthResultBanner } from "@/features/calendar/components/google-oauth-result-banner";

export const metadata: Metadata = { title: "Agenda — VirgíniaPsi" };

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
  const googleDetail = typeof params.google_detail === "string" ? params.google_detail : undefined;
  const calendarRedirectUri = peekGoogleCalendarRedirectUri();

  return (
    <PageContainer>
      <GoogleOAuthResultBanner
        status={googleStatus}
        detail={googleDetail}
        redirectUri={calendarRedirectUri}
      />

      <Suspense>
        <AgendaBoard
          view={view}
          referenceDate={referenceDate}
          timeZone={timeZone}
          appointments={appointments}
          patients={patients}
          connection={connection}
          canManageConnection={role === "psychologist_admin"}
          canStartSession={isClinicalPractitioner(role)}
        />
      </Suspense>
    </PageContainer>
  );
}
