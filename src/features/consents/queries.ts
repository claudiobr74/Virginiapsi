import "server-only";

import {
  CAPTURE_CONSENT_TYPES,
  consentRowSchema,
  resolveConsentStateFromRows,
  type ConsentResolution,
  type ConsentRow,
} from "@/features/consents/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CONSENT_COLUMNS =
  "id, organization_id, patient_id, type, title, version, status, accepted_at, expires_at, guardian_authorization, guardian_name, patient_assent, revoked_at, created_at";

/**
 * Reads consents under the caller's own RLS session. A secretary can never see
 * clinical consent rows, so resolution for that role naturally comes back
 * empty and the gate fails closed — which is the intended behaviour, since
 * clinical capture is a clinical-practitioner operation for the responsible psychologist.
 */
export async function listPatientConsents(
  organizationId: string,
  patientId: string,
): Promise<ConsentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consents")
    .select(CONSENT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`failed to list consents: ${error.message}`);
  }

  return consentRowSchema.array().parse(data ?? []);
}

export async function resolveConsentState(
  organizationId: string,
  patientId: string,
): Promise<ConsentResolution> {
  const supabase = await createSupabaseServerClient();

  const [{ data: patientData, error: patientError }, rows] = await Promise.all([
    supabase
      .from("patients")
      .select("id, organization_id, birth_date")
      .eq("id", patientId)
      .maybeSingle(),
    listPatientConsents(organizationId, patientId),
  ]);

  if (patientError) {
    throw new Error(`failed to load patient for consent: ${patientError.message}`);
  }

  // A patient from another tenant (or none at all) resolves to the same
  // fully-denied state as a patient with no consent — never an exception the
  // caller could branch on to learn the patient exists.
  const patient =
    patientData && (patientData.organization_id as string) === organizationId
      ? (patientData as { birth_date: string | null })
      : null;

  return resolveConsentStateFromRows({
    rows: patient ? rows : [],
    birthDate: patient ? patient.birth_date : null,
  });
}

export const CAPTURE_TYPES = CAPTURE_CONSENT_TYPES;
