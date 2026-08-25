import Link from "next/link";
import { Globe, Home, User } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import {
  MODALITY_LABELS,
  PATIENT_STATUS_BADGE,
  PATIENT_STATUS_LABELS,
  type PatientDirectoryRow,
} from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

function sessionLabel(iso: string | null, timeZone: string): string {
  if (!iso) {
    return "—";
  }
  return formatInTimeZone(iso, timeZone, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PatientDirectoryTable({
  rows,
  timeZone,
}: {
  rows: PatientDirectoryRow[];
  timeZone: string;
}) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-border bg-card">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Nome & registro</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Modalidade</th>
            <th className="px-4 py-3">Última sessão</th>
            <th className="px-4 py-3">Próxima sessão</th>
            <th className="px-4 py-3">Pendências clínicas</th>
            <th className="px-4 py-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ patient, lastSessionAt, nextSessionAt, pendingClinical }) => (
            <tr key={patient.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3">
                <Link
                  href={`/app/patients/${patient.id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <PatientAvatar name={patient.preferred_name} size="md" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-foreground">
                      {patient.preferred_name}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {patient.public_code}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={PATIENT_STATUS_BADGE[patient.status]}
                  label={PATIENT_STATUS_LABELS[patient.status]}
                />
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  {patient.modality === "online" ? (
                    <Globe className="size-3.5" aria-hidden />
                  ) : (
                    <Home className="size-3.5" aria-hidden />
                  )}
                  {MODALITY_LABELS[patient.modality]}
                </span>
              </td>
              <td className="px-4 py-3 text-foreground">{sessionLabel(lastSessionAt, timeZone)}</td>
              <td className="px-4 py-3 text-foreground">{sessionLabel(nextSessionAt, timeZone)}</td>
              <td className="px-4 py-3">
                {pendingClinical > 0 ? (
                  <span className="text-xs font-semibold uppercase text-pending">
                    {pendingClinical} pendente{pendingClinical === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Nenhuma</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/app/patients/${patient.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background"
                >
                  <User className="size-3.5" aria-hidden />
                  Ver perfil
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
