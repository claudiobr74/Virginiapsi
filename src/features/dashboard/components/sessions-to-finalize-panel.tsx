import { NotebookPen } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  sessionToFinalizeLabel,
  type SessionToFinalize,
} from "@/features/dashboard/contracts";
import { CLINICAL_SESSION_STATUS_LABELS } from "@/features/sessions/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

export function SessionsToFinalizePanel({
  sessions,
  timeZone,
}: {
  sessions: SessionToFinalize[];
  timeZone: string;
}) {
  return (
    <section aria-labelledby="sessions-to-finalize-heading" className="flex flex-col gap-3">
      <SectionHeader id="sessions-to-finalize-heading" title="Sessões a finalizar" />
      {sessions.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhuma sessão aguardando fechamento"
          description="Sessões em andamento ou em rascunho aparecem aqui para concluir o DPEP."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => {
            const when = session.startedAt ?? session.createdAt;
            return (
              <li key={session.id}>
                <Link
                  href={`/session/${session.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-surface"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      {sessionToFinalizeLabel(session)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatInTimeZone(when, timeZone, {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <StatusBadge
                    status={session.status === "in_progress" ? "active" : "pending"}
                    label={CLINICAL_SESSION_STATUS_LABELS[session.status]}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
