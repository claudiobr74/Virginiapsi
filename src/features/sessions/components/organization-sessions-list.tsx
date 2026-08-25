import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CLINICAL_SESSION_STATUS_LABELS,
  type ClinicalSessionRow,
} from "@/features/sessions/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

const STATUS_BADGE_STATUS: Record<
  ClinicalSessionRow["status"],
  "active" | "completed" | "cancelled" | "pending"
> = {
  draft: "pending",
  in_progress: "active",
  finalized: "completed",
  canceled: "cancelled",
};

export function OrganizationSessionsList({
  rows,
  timezone,
}: {
  rows: Array<{
    session: ClinicalSessionRow;
    patientPreferredName: string | null;
    patientPublicCode: string | null;
  }>;
  timezone: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[20px] border border-border bg-card p-6 text-sm text-muted-foreground">
        Nenhuma sessão clínica registrada ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[20px] border border-border bg-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Paciente</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Início</th>
            <th className="px-4 py-3">Encerramento</th>
            <th className="px-4 py-3">Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ session, patientPreferredName, patientPublicCode }) => (
            <tr key={session.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3">
                <p className="font-semibold text-foreground">
                  {patientPreferredName ?? "Paciente"}
                </p>
                {patientPublicCode ? (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {patientPublicCode}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={STATUS_BADGE_STATUS[session.status]}
                  label={CLINICAL_SESSION_STATUS_LABELS[session.status]}
                />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-foreground">
                {session.started_at
                  ? formatInTimeZone(session.started_at, timezone, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-foreground">
                {session.ended_at
                  ? formatInTimeZone(session.ended_at, timezone, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/session/${session.id}`}
                  className="text-sm font-semibold text-sage-700 hover:text-primary"
                >
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
