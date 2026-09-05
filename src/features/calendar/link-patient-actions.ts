"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppointment } from "@/features/calendar/appointment-queries";
import { startSessionAction, type SessionActionResult } from "@/features/sessions/actions";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { hasPatientClinicalAccess } from "@/features/patients/clinical-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

export interface PatientLinkHit {
  id: string;
  preferredName: string;
  publicCode: string;
  suggested?: boolean;
}

export interface PatientLinkSearchResult {
  error?: string;
  patients: PatientLinkHit[];
}

export interface PatientLinkActionResult extends SessionActionResult {
  linked?: boolean;
}

function sanitizeIlike(raw: string): string {
  return raw
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function looksLikeHint(patient: PatientLinkHit, hints: string[]): boolean {
  const name = patient.preferredName.toLocaleLowerCase("pt-BR");
  return hints.some((hint) => {
    const needle = hint.toLocaleLowerCase("pt-BR");
    return name.includes(needle) || needle.includes(name);
  });
}

async function searchByTerm(
  organizationId: string,
  term: string,
): Promise<PatientLinkHit[]> {
  const sanitized = sanitizeIlike(term);
  if (sanitized.length < 2) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, preferred_name, public_code")
    .eq("organization_id", organizationId)
    .or(
      `preferred_name.ilike.%${sanitized}%,full_name.ilike.%${sanitized}%,public_code.ilike.%${sanitized}%`,
    )
    .order("preferred_name", { ascending: true })
    .limit(12);

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    preferredName: (row.preferred_name as string) ?? "",
    publicCode: (row.public_code as string) ?? "",
  }));
}

export async function searchPatientsForAppointmentLinkAction(input: {
  query?: string;
  titleHints?: string[];
}): Promise<PatientLinkSearchResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: "Somente a psicóloga responsável vincula paciente para atender.", patients: [] };
  }

  const query = sanitizeIlike(input.query ?? "");
  const hints = (input.titleHints ?? [])
    .map(sanitizeIlike)
    .filter((hint) => hint.length >= 2)
    .slice(0, 6);

  if (query.length >= 2) {
    return { patients: await searchByTerm(organizationId, query) };
  }

  if (hints.length === 0) {
    return { patients: [] };
  }

  const merged = new Map<string, PatientLinkHit>();
  for (const hint of hints) {
    const rows = await searchByTerm(organizationId, hint);
    for (const row of rows) {
      merged.set(row.id, {
        ...row,
        suggested: looksLikeHint(row, hints),
      });
    }
  }
  return { patients: [...merged.values()].slice(0, 12) };
}

async function persistAppointmentPatientLink(input: {
  organizationId: string;
  appointmentId: string;
  patientId: string;
}): Promise<{ error?: string }> {
  const appointment = await getAppointment(input.organizationId, input.appointmentId);
  if (!appointment) {
    return { error: "Agendamento não encontrado." };
  }
  if (appointment.google_deleted_at) {
    return { error: "Este compromisso não está mais na agenda." };
  }
  if (appointment.patient_id === input.patientId) {
    return {};
  }

  const supabase = await createSupabaseServerClient();

  if (appointment.origin === "GOOGLE_EXTERNAL") {
    const { error } = await supabase.rpc("link_external_appointment_patient", {
      org_id: input.organizationId,
      p_appointment_id: input.appointmentId,
      p_patient_id: input.patientId,
    });
    if (error) {
      return { error: "Não foi possível vincular o paciente a este agendamento." };
    }
    return {};
  }

  const { data, error } = await supabase
    .from("appointments")
    .update({ patient_id: input.patientId })
    .eq("id", input.appointmentId)
    .eq("organization_id", input.organizationId)
    .eq("origin", "TESSELI")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível vincular o paciente a este agendamento." };
  }
  return {};
}

export async function linkPatientAndStartSessionAction(
  appointmentId: string,
  patientId: string,
): Promise<PatientLinkActionResult> {
  const appointmentIdParsed = uuidSchema.safeParse(appointmentId);
  const patientIdParsed = uuidSchema.safeParse(patientId);
  if (!appointmentIdParsed.success || !patientIdParsed.success) {
    return { error: "Dados inválidos." };
  }

  const { organizationId, role, user } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: "Somente a psicóloga responsável conduz sessão clínica." };
  }
  if (
    !(await hasPatientClinicalAccess({
      organizationId,
      role,
      userId: user.id,
      patientId: patientIdParsed.data,
    }))
  ) {
    return { error: "Somente a psicóloga responsável conduz sessão clínica." };
  }

  const linked = await persistAppointmentPatientLink({
    organizationId,
    appointmentId: appointmentIdParsed.data,
    patientId: patientIdParsed.data,
  });
  if (linked.error) {
    return linked;
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.link_patient",
    resourceType: "appointment",
    resourceId: appointmentIdParsed.data,
    metadata: { patient_id: patientIdParsed.data },
  });

  revalidatePath("/app");
  revalidatePath("/app/agenda");

  const started = await startSessionAction(patientIdParsed.data, appointmentIdParsed.data);
  return { ...started, linked: true };
}
