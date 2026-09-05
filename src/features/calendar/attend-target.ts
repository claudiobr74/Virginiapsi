import type { AppointmentOrigin, AppointmentRow, AppointmentStatus } from "@/features/calendar/contracts";

export interface AttendTarget {
  id: string;
  origin: AppointmentOrigin;
  patientId: string | null;
  status: AppointmentStatus;
  summarySnapshot: string | null;
  startsAt: string;
  endsAt: string;
  googleDeletedAt?: string | null;
  googleColorId?: string | null;
  googleEventType?: string | null;
  unavailableGoogleColorIds?: readonly string[] | null;
}

export function appointmentRowToAttendTarget(row: AppointmentRow): AttendTarget {
  return {
    id: row.id,
    origin: row.origin,
    patientId: row.patient_id,
    status: row.status,
    summarySnapshot: row.summary_snapshot,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    googleDeletedAt: row.google_deleted_at,
    googleColorId: row.google_color_id,
    googleEventType: row.google_event_type,
    unavailableGoogleColorIds: row.unavailable_google_color_ids,
  };
}
