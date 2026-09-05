export type DirectoryAppointmentRow = {
  patient_id: string | null;
  starts_at: string;
  status: string;
  google_deleted_at?: string | null;
};

export type DirectoryClinicalSessionRow = {
  patient_id: string | null;
  started_at: string | null;
  ended_at?: string | null;
  status: string;
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

/**
 * "Última sessão" is a clinical fact. Prefer a finalized clinical session
 * over a merely elapsed calendar slot, using ended_at when it is available.
 */
export function foldFinalizedClinicalSessionLast(
  rows: DirectoryClinicalSessionRow[],
  nowMs: number,
): Map<string, string> {
  const lastByPatient = new Map<string, string>();

  for (const row of rows) {
    if (!row.patient_id || row.status !== "finalized") {
      continue;
    }

    const occurredAt = row.ended_at ?? row.started_at;
    if (!occurredAt) {
      continue;
    }

    const time = new Date(occurredAt).getTime();
    if (Number.isNaN(time) || time > nowMs) {
      continue;
    }

    const current = lastByPatient.get(row.patient_id);
    if (!current || new Date(current).getTime() < time) {
      lastByPatient.set(row.patient_id, occurredAt);
    }
  }

  return lastByPatient;
}
