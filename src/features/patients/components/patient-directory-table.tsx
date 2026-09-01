import Link from "next/link";
import { Globe, Home } from "lucide-react";
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
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-card">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_8rem_8rem_8rem_8rem_6rem] border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
        <span>Nome & registro</span>
        <span>Status</span>
        <span>Modalidade</span>
        <span>Última sessão</span>
        <span>Próxima sessão</span>
        <span>Pendências clínicas</span>
        <span>Ações</span>
      </div>
      <ul>
        {rows.map(({ patient, lastSessionAt, nextSessionAt, pendingClinical }) => (
          <li key={patient.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/app/patients/${patient.id}`}
              className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-sage-light/40 lg:grid-cols-[minmax(0,1.6fr)_7rem_8rem_8rem_8rem_8rem_6rem] lg:items-center"
            >
              <span className="flex min-w-0 items-center gap-3">
                <PatientAvatar name={patient.preferred_name} size="md" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold text-foreground">
                    {patient.preferred_name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {patient.public_code}
                  </span>
                </span>
              </span>
              <span>
                <StatusBadge
                  status={PATIENT_STATUS_BADGE[patient.status]}
                  label={PATIENT_STATUS_LABELS[patient.status]}
                />
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                {patient.modality === "online" ? (
                  <Globe className="size-3.5" aria-hidden />
                ) : (
                  <Home className="size-3.5" aria-hidden />
                )}
                {MODALITY_LABELS[patient.modality]}
              </span>
              <span className="text-sm text-foreground">
                <span className="mr-2 text-[11px] font-semibold uppercase text-muted-foreground lg:hidden">
                  Última
                </span>
                {sessionLabel(lastSessionAt, timeZone)}
              </span>
              <span className="text-sm text-foreground">
                <span className="mr-2 text-[11px] font-semibold uppercase text-muted-foreground lg:hidden">
                  Próxima
                </span>
                {sessionLabel(nextSessionAt, timeZone)}
              </span>
              <span>
                {pendingClinical > 0 ? (
                  <span className="text-xs font-semibold uppercase text-pending">
                    {pendingClinical} pendente{pendingClinical === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Nenhuma</span>
                )}
              </span>
              <span className="inline-flex items-center text-xs font-semibold text-sage-700">
                Ver perfil
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
