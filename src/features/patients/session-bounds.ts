export type DirectoryAppointmentRow = {
  patient_id: string | null;
  starts_at: string;
  status: string;
  google_deleted_at?: string | null;
};

export function isCountableDirectoryAppointment(row: DirectoryAppointmentRow): boolean {
  if (!row.patient_id) {
    return false;
  }
  if (row.status === "cancelled") {
    return false;
  }
  if (row.google_deleted_at) {
    return false;
  }
  return true;
}

export function foldDirectorySessionBounds(
  rows: DirectoryAppointmentRow[],
  nowMs: number,
): { lastByPatient: Map<string, string>; nextByPatient: Map<string, string> } {
  const lastByPatient = new Map<string, string>();
  const nextByPatient = new Map<string, string>();

  for (const row of rows) {
    if (!isCountableDirectoryAppointment(row) || !row.patient_id) {
      continue;
    }
    const time = new Date(row.starts_at).getTime();
    if (Number.isNaN(time)) {
      continue;
    }
    if (time <= nowMs) {
      const current = lastByPatient.get(row.patient_id);
      if (!current || new Date(current).getTime() < time) {
        lastByPatient.set(row.patient_id, row.starts_at);
      }
    } else {
      const current = nextByPatient.get(row.patient_id);
      if (!current || new Date(current).getTime() > time) {
        nextByPatient.set(row.patient_id, row.starts_at);
      }
    }
  }

  return { lastByPatient, nextByPatient };
}
