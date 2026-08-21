import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import {
  MODALITY_LABELS,
  PATIENT_STATUS_BADGE,
  PATIENT_STATUS_LABELS,
  type PatientRow,
} from "@/features/patients/contracts";

export function PatientListItem({ patient }: { patient: PatientRow }) {
  return (
    <Link
      href={`/app/patients/${patient.id}`}
      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm transition-colors hover:border-sage-light hover:bg-surface/60 sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <PatientAvatar name={patient.preferred_name} size="md" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-base italic font-semibold text-foreground">
              {patient.preferred_name}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {patient.public_code}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {MODALITY_LABELS[patient.modality]}
            </span>
            {patient.phone ? (
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {patient.phone}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge
          status={PATIENT_STATUS_BADGE[patient.status]}
          label={PATIENT_STATUS_LABELS[patient.status]}
        />
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </div>
    </Link>
  );
}
