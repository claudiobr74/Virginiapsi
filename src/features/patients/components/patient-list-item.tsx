import { ChevronRight, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
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
      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:border-sage-light hover:bg-surface/60 sm:px-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-serif text-base italic font-semibold text-foreground">
            {patient.preferred_name}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {patient.public_code}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {patient.phone ? (
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden />
              {patient.phone}
            </span>
          ) : null}
          {patient.email ? (
            <span className="flex items-center gap-1">
              <Mail className="size-3.5" aria-hidden />
              {patient.email}
            </span>
          ) : null}
          <span>{MODALITY_LABELS[patient.modality]}</span>
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
