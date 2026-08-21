import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ConsentRow } from "@/features/consents/contracts";
import { TCLE_VERSION } from "@/features/consents/tcle-content";
import {
  TCLE_STATUS_LABELS,
  TCLE_TYPE_LABELS,
  resolveTcleStatus,
  type TcleConsentType,
  type TcleStatus,
} from "@/features/consents/tcle";

const STATUS_BADGE: Record<TcleStatus, "pending" | "active" | "attention" | "cancelled"> = {
  never_accepted: "pending",
  current: "active",
  outdated: "attention",
  revoked: "cancelled",
};

const FORM_TERM_ROWS: { type: TcleConsentType; adminOnly: boolean }[] = [
  { type: "service_terms", adminOnly: false },
  { type: "psychotherapy", adminOnly: true },
];

export function PatientTermsSummary({
  patientId,
  consents,
  isAdmin,
}: {
  patientId: string;
  consents: ConsentRow[];
  isAdmin: boolean;
}) {
  const rows = FORM_TERM_ROWS.filter((row) => isAdmin || !row.adminOnly);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rows.map(({ type }) => {
          const resolution = resolveTcleStatus(consents, type, TCLE_VERSION);
          return (
            <li
              key={type}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/50 px-4 py-3"
            >
              <span className="text-sm font-semibold text-foreground">
                {TCLE_TYPE_LABELS[type]}
              </span>
              <StatusBadge
                status={STATUS_BADGE[resolution.status]}
                label={TCLE_STATUS_LABELS[resolution.status]}
              />
            </li>
          );
        })}
      </ul>
      <Link
        href={`/app/patients/${patientId}#tcle`}
        className="text-sm font-semibold text-primary hover:underline"
      >
        Abrir termos no prontuário
      </Link>
    </div>
  );
}
