import Link from "next/link";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import {
  sessionToFinalizeLabel,
  type SessionToFinalize,
} from "@/features/dashboard/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

export function SessionsToFinalizePanel({
  sessions,
  timeZone,
}: {
  sessions: SessionToFinalize[];
  timeZone: string;
}) {
  return (
    <DashboardWidget
      id="sessions-to-finalize-heading"
      title="Sessões a Finalizar"
      empty={sessions.length === 0}
      emptyLabel="Nenhuma sessão aguardando fechamento."
    >
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => {
          const when = session.startedAt ?? session.createdAt;
          return (
            <li key={session.id}>
              <Link
                href={`/session/${session.id}`}
                className="flex items-center justify-between gap-3 rounded-xl py-1 text-sm transition-colors hover:bg-surface"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-foreground">
                    {sessionToFinalizeLabel(session)}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatInTimeZone(when, timeZone, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <span className="shrink-0 font-semibold text-primary">Finalizar</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </DashboardWidget>
  );
}
