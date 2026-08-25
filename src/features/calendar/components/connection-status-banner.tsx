import { AlertTriangle, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ConnectionRow } from "@/features/calendar/contracts";

export function ConnectionStatusBanner({
  connection,
  canManage,
}: {
  connection: ConnectionRow | null;
  canManage: boolean;
}) {
  if (connection?.status === "connected" && connection.calendar_id) {
    return null;
  }

  const isError = connection?.status === "error";

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-attention/30 bg-attention-bg px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/60 text-attention">
          {isError ? (
            <AlertTriangle className="size-4" aria-hidden />
          ) : (
            <CalendarPlus className="size-4" aria-hidden />
          )}
        </span>
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-attention">
            {connection?.status === "connected"
              ? "Selecione um calendário do Google para sincronizar"
              : isError
                ? "A conexão com o Google Calendar precisa de atenção"
                : "Google Calendar não conectado"}
          </p>
          <p className="text-xs text-attention/80">
            Sem conexão, a Agenda funciona só com eventos criados no VirgíniaPsi —
            sem eventos externos e sem Meet automático.
          </p>
        </div>
      </div>
      {canManage ? (
        <Button asChild size="sm" variant="secondary">
          <Link href="/app/agenda/connect">Gerenciar conexão</Link>
        </Button>
      ) : null}
    </div>
  );
}
