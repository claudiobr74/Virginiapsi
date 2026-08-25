import "server-only";

import {
  clinicalSessionRowSchema,
  sessionDpepRowSchema,
  sessionWorkingNotesRowSchema,
  transcriptSegmentRowSchema,
  type ClinicalSessionRow,
  type SessionDpepRow,
  type SessionWorkingNotesRow,
  type TranscriptSegmentRow,
} from "@/features/sessions/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getClinicalSession(
  organizationId: string,
  sessionId: string,
): Promise<ClinicalSessionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinical_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load clinical session: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const session = clinicalSessionRowSchema.parse(data);
  return session.organization_id === organizationId ? session : null;
}

export async function listOrganizationSessions(
  organizationId: string,
  limit = 80,
): Promise<
  Array<{
    session: ClinicalSessionRow;
    patientPreferredName: string | null;
    patientPublicCode: string | null;
  }>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinical_sessions")
    .select(
      "id, organization_id, patient_id, appointment_id, therapist_user_id, status, started_at, ended_at, version, created_at, patients(preferred_name, public_code)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`failed to list organization sessions: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    const { patients, ...sessionRow } = row as typeof row & {
      patients:
        | { preferred_name: string; public_code: string }
        | { preferred_name: string; public_code: string }[]
        | null;
    };
    const parsed = clinicalSessionRowSchema.safeParse(sessionRow);
    if (!parsed.success) {
      return [];
    }
    const patient = Array.isArray(patients) ? patients[0] : patients;
    return [
      {
        session: parsed.data,
        patientPreferredName: patient?.preferred_name ?? null,
        patientPublicCode: patient?.public_code ?? null,
      },
    ];
  });
}

export async function listPatientSessions(
  organizationId: string,
  patientId: string,
): Promise<ClinicalSessionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinical_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`failed to list clinical sessions: ${error.message}`);
  }

  return clinicalSessionRowSchema.array().parse(data ?? []);
}

export async function getSessionDpep(sessionId: string): Promise<SessionDpepRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("session_dpep")
    .select("session_id, demand, procedures, evolution, plan, version, updated_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load session DPEP: ${error.message}`);
  }
  return data ? sessionDpepRowSchema.parse(data) : null;
}

/**
 * Callers must only invoke this for `psychologist_admin` — RLS also denies
 * the secretary role at the database layer, but the working-notes area is a
 * clinical concern the server/UI boundary should not even query for that
 * role (`.cursor/rules/10-clinical-domain.mdc`).
 */
export async function getSessionWorkingNotes(
  sessionId: string,
): Promise<SessionWorkingNotesRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("session_clinical_working_notes")
    .select("session_id, formulation, hypotheses, working_observations, updated_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load working notes: ${error.message}`);
  }
  return data ? sessionWorkingNotesRowSchema.parse(data) : null;
}

export async function listTranscriptSegments(
  sessionId: string,
): Promise<TranscriptSegmentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("session_transcript_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true });

  if (error) {
    throw new Error(`failed to list transcript segments: ${error.message}`);
  }

  return transcriptSegmentRowSchema.array().parse(data ?? []);
}
