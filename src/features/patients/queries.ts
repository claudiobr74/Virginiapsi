import "server-only";

import {
  patientClinicalProfileSchema,
  patientRowSchema,
  type PatientClinicalProfile,
  type PatientDirectoryRow,
  type PatientRow,
  type PatientStatus,
} from "@/features/patients/contracts";
import {
  foldDirectorySessionBounds,
  foldFinalizedClinicalSessionLast,
} from "@/features/patients/session-bounds";
import { DOCUMENT_BUCKETS, createSignedDownloadUrl } from "@/lib/documents/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PatientListFilters {
  search?: string;
  status?: PatientStatus | "all";
}

export async function listPatients(
  organizationId: string,
  filters: PatientListFilters = {},
): Promise<PatientRow[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("patients")
    .select("*")
    .eq("organization_id", organizationId)
    .order("preferred_name", { ascending: true });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.or(
      `preferred_name.ilike.%${search}%,full_name.ilike.%${search}%,public_code.ilike.%${search}%,cpf.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`failed to list patients: ${error.message}`);
  }

  return patientRowSchema.array().parse(data ?? []);
}

function logAppointmentsBoundsError(operation: string, error: { code?: string } | null): void {
  console.error(
    JSON.stringify({
      level: "error",
      operation,
      errorClass: "PostgrestError",
      errorCode: error?.code ?? null,
    }),
  );
}

export async function listPatientDirectory(
  organizationId: string,
  filters: PatientListFilters = {},
): Promise<PatientDirectoryRow[]> {
  const patients = await listPatients(organizationId, filters);
  if (patients.length === 0) {
    return [];
  }

  const photoUrls = await Promise.all(
    patients.map((patient) => getPatientPortraitUrl(patient.photo_path)),
  );

  const supabase = await createSupabaseServerClient();
  const { data: appointmentRows, error: appointmentError } = await supabase
    .from("appointments")
    .select("patient_id, starts_at, status, google_deleted_at")
    .eq("organization_id", organizationId)
    .not("patient_id", "is", null)
    .neq("status", "cancelled")
    .is("google_deleted_at", null);

  if (appointmentError) {
    logAppointmentsBoundsError("list_patient_directory_appointments", appointmentError);
  }

  const { data: finalizedSessionRows, error: finalizedSessionError } = await supabase
    .from("clinical_sessions")
    .select("patient_id, started_at, ended_at, status")
    .eq("organization_id", organizationId)
    .eq("status", "finalized")
    .not("patient_id", "is", null);

  if (finalizedSessionError) {
    logAppointmentsBoundsError("list_patient_directory_finalized_sessions", finalizedSessionError);
  }

  const pendingCount = new Map<string, number>();
  const { data: pendingRows } = await supabase
    .from("clinical_sessions")
    .select("patient_id")
    .eq("organization_id", organizationId)
    .in("status", ["draft", "in_progress"]);
  for (const row of pendingRows ?? []) {
    const patientId = row.patient_id as string | null;
    if (!patientId) {
      continue;
    }
    pendingCount.set(patientId, (pendingCount.get(patientId) ?? 0) + 1);
  }

  const nowMs = Date.now();
  const { lastByPatient: appointmentLastByPatient, nextByPatient } =
    foldDirectorySessionBounds(appointmentError ? [] : (appointmentRows ?? []), nowMs);
  const finalizedLastByPatient = foldFinalizedClinicalSessionLast(
    finalizedSessionError ? [] : (finalizedSessionRows ?? []),
    nowMs,
  );

  return patients.map((patient, index) => ({
    patient,
    photoUrl: photoUrls[index] ?? null,
    lastSessionAt:
      finalizedLastByPatient.get(patient.id) ?? appointmentLastByPatient.get(patient.id) ?? null,
    nextSessionAt: nextByPatient.get(patient.id) ?? null,
    pendingClinical: pendingCount.get(patient.id) ?? 0,
  }));
}

/**
 * RLS already scopes this to the caller's organization/membership, but we
 * still pass organizationId explicitly and check it below: a route handler
 * must never render another tenant's patient just because the row happened
 * to come back from a differently-scoped query bug.
 */
export async function getPatient(
  organizationId: string,
  patientId: string,
): Promise<PatientRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load patient: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const patient = patientRowSchema.parse(data);
  return patient.organization_id === organizationId ? patient : null;
}

/**
 * Callers must only invoke this for a clinical practitioner who is the
 * responsible psychologist — RLS also denies everyone else.
 */
export async function getPatientClinicalProfile(
  patientId: string,
): Promise<PatientClinicalProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patient_clinical_profile")
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load clinical profile: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return patientClinicalProfileSchema.parse(data);
}

export async function getPatientScheduleBounds(
  organizationId: string,
  patientId: string,
): Promise<{ lastSessionAt: string | null; nextSessionAt: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: appointmentRows, error: appointmentError } = await supabase
    .from("appointments")
    .select("patient_id, starts_at, status, google_deleted_at")
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .neq("status", "cancelled")
    .is("google_deleted_at", null)
    .order("starts_at", { ascending: true });

  if (appointmentError) {
    logAppointmentsBoundsError("get_patient_schedule_bounds_appointments", appointmentError);
  }

  const { data: finalizedSessionRows, error: finalizedSessionError } = await supabase
    .from("clinical_sessions")
    .select("patient_id, started_at, ended_at, status")
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .eq("status", "finalized");

  if (finalizedSessionError) {
    logAppointmentsBoundsError(
      "get_patient_schedule_bounds_finalized_sessions",
      finalizedSessionError,
    );
  }

  const nowMs = Date.now();
  const { lastByPatient: appointmentLastByPatient, nextByPatient } =
    foldDirectorySessionBounds(appointmentError ? [] : (appointmentRows ?? []), nowMs);
  const finalizedLastByPatient = foldFinalizedClinicalSessionLast(
    finalizedSessionError ? [] : (finalizedSessionRows ?? []),
    nowMs,
  );

  return {
    lastSessionAt:
      finalizedLastByPatient.get(patientId) ?? appointmentLastByPatient.get(patientId) ?? null,
    nextSessionAt: nextByPatient.get(patientId) ?? null,
  };
}

export async function getPatientPortraitUrl(
  photoPath: string | null | undefined,
): Promise<string | null> {
  if (!photoPath) {
    return null;
  }
  try {
    return await createSignedDownloadUrl(DOCUMENT_BUCKETS.patientAttachments, photoPath);
  } catch {
    return null;
  }
}
