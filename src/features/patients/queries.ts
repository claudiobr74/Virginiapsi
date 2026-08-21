import "server-only";

import {
  patientClinicalProfileSchema,
  patientRowSchema,
  type PatientClinicalProfile,
  type PatientRow,
  type PatientStatus,
} from "@/features/patients/contracts";
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
 * Callers must only invoke this for `psychologist_admin` — RLS also denies
 * the secretary role at the database layer, but the UI/server boundary
 * should never even attempt the query for that role (docs/10-clinical-domain.mdc).
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
