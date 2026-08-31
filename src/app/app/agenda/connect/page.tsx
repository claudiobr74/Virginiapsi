import { CalendarCog } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { ConnectionPanel } from "@/features/calendar/components/connection-panel";
import { getConnection } from "@/features/calendar/connection-queries";
import { ensureGoogleCalendarReady } from "@/features/calendar/ensure-calendar";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { peekGoogleCalendarRedirectUri } from "@/lib/env/server";

export const metadata: Metadata = { title: "Conexão Google Agenda — VirgíniaPsi" };

export default async function GoogleConnectionPage() {
  const { organizationId, role, timezone } = await requireOrgContext();
  let connection = null;
  try {
    connection = await getConnection(organizationId);
    connection = await ensureGoogleCalendarReady(organizationId, connection);
  } catch {
    connection = null;
  }

  return (
    <PageContainer narrow>
      <div className="flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <CalendarCog className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[28px] italic font-medium leading-tight text-foreground">
            Conexão com o Google Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            Conta independente do login — conecte em Integrações, escolha a agenda e sincronize
          </p>
        </div>
      </div>
      <ConnectionPanel
        connection={connection}
        canManage={role === "psychologist_admin"}
        calendarRedirectUri={peekGoogleCalendarRedirectUri()}
        timeZone={timezone}
      />
    </PageContainer>
  );
}
