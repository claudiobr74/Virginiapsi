import "server-only";

import {
  patientClinicalProfileSchema,
  patientRowSchema,
  type PatientClinicalProfile,
  type PatientDirectoryRow,
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

export async function listPatientDirectory(
  organizationId: string,
  filters: PatientListFilters = {},
): Promise<PatientDirectoryRow[]> {
  const patients = await listPatients(organizationId, filters);
  if (patients.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("patient_id, starts_at, status")
    .eq("organization_id", organizationId)
    .eq("origin", "TESSELI")
    .not("patient_id", "is", null)
    .neq("status", "cancelled");

  if (error) {
    return patients.map((patient) => ({
      patient,
      lastSessionAt: null,
      nextSessionAt: null,
      pendingClinical: 0,
    }));
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

  const now = Date.now();
  const lastByPatient = new Map<string, string>();
  const nextByPatient = new Map<string, string>();
  for (const row of data ?? []) {
    const patientId = row.patient_id as string | null;
    const startsAt = row.starts_at as string;
    if (!patientId || !startsAt) {
      continue;
    }
    const time = new Date(startsAt).getTime();
    if (Number.isNaN(time)) {
      continue;
    }
    if (time <= now) {
      const current = lastByPatient.get(patientId);
      if (!current || new Date(current).getTime() < time) {
        lastByPatient.set(patientId, startsAt);
      }
    } else {
      const current = nextByPatient.get(patientId);
      if (!current || new Date(current).getTime() > time) {
        nextByPatient.set(patientId, startsAt);
      }
    }
  }

  return patients.map((patient) => ({
    patient,
    lastSessionAt: lastByPatient.get(patient.id) ?? null,
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
  const { data, error } = await supabase
    .from("appointments")
    .select("starts_at, status")
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .eq("origin", "TESSELI")
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  if (error || !data) {
    return { lastSessionAt: null, nextSessionAt: null };
  }

  const now = Date.now();
  let lastSessionAt: string | null = null;
  let nextSessionAt: string | null = null;
  for (const row of data) {
    const time = new Date(row.starts_at).getTime();
    if (Number.isNaN(time)) {
      continue;
    }
    if (time <= now) {
      lastSessionAt = row.starts_at;
    } else if (!nextSessionAt) {
      nextSessionAt = row.starts_at;
    }
  }
  return { lastSessionAt, nextSessionAt };
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
