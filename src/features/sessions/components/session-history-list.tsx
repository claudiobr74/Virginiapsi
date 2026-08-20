import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CLINICAL_SESSION_STATUS_LABELS,
  type ClinicalSessionRow,
} from "@/features/sessions/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

const STATUS_BADGE_STATUS: Record<ClinicalSessionRow["status"], "active" | "completed" | "cancelled" | "pending"> = {
  draft: "pending",
  in_progress: "active",
  finalized: "completed",
  canceled: "cancelled",
};

export function SessionHistoryList({
  sessions,
  timezone,
}: {
  sessions: ClinicalSessionRow[];
  timezone: string;
}) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/session/${session.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-surface/60"
        >
          <span className="text-foreground">
            {session.started_at
              ? formatInTimeZone(session.started_at, timezone, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : formatInTimeZone(session.created_at, timezone, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
          </span>
          <StatusBadge
            status={STATUS_BADGE_STATUS[session.status]}
            label={CLINICAL_SESSION_STATUS_LABELS[session.status]}
          />
        </Link>
      ))}
    </div>
  );
}
