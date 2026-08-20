"use server";

import { revalidatePath } from "next/cache";
import {
  clinicalProfileFormSchema,
  patientFormSchema,
  type PatientFormValues,
} from "@/features/patients/contracts";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PatientActionResult {
  error?: string;
  patientId?: string;
}

function toDbPayload(values: PatientFormValues) {
  return {
    preferred_name: values.preferredName,
    full_name: values.fullName,
    birth_date: values.birthDate || null,
    cpf: values.cpf ? values.cpf.replace(/\D/g, "") : null,
    phone: values.phone || null,
    email: values.email || null,
    responsibles: values.responsibles,
    modality: values.modality,
    status: values.status,
    default_session_value: values.defaultSessionValue
      ? Number(values.defaultSessionValue)
      : null,
  };
}

export async function createPatientAction(
  input: unknown,
): Promise<PatientActionResult> {
  const { organizationId } = await requireOrgContext();

  const parsed = patientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({ organization_id: organizationId, ...toDbPayload(parsed.data) })
    .select("id, public_code")
    .single();

  if (error || !data) {
    return {
      error: "Não foi possível cadastrar o paciente agora. Tente novamente.",
    };
  }

  await logAuditEvent({
    organizationId,
    action: "patient.create",
    resourceType: "patient",
    resourceId: data.public_code,
  });

  revalidatePath("/app/patients");
  return { patientId: data.id as string };
}

export async function updatePatientAction(
  patientId: string,
  input: unknown,
): Promise<PatientActionResult> {
  const { organizationId } = await requireOrgContext();

  const parsed = patientFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .update(toDbPayload(parsed.data))
    .eq("id", patientId)
    .select("id, public_code")
    .single();

  if (error || !data) {
    return {
      error: "Não foi possível salvar as alterações agora. Tente novamente.",
    };
  }

  await logAuditEvent({
    organizationId,
    action: "patient.update",
    resourceType: "patient",
    resourceId: data.public_code,
  });

  revalidatePath("/app/patients");
  revalidatePath(`/app/patients/${patientId}`);
  return { patientId: data.id as string };
}

export async function updatePatientStatusAction(
  patientId: string,
  status: string,
): Promise<PatientActionResult> {
  const { organizationId } = await requireOrgContext();

  const parsedStatus = patientFormSchema.shape.status.safeParse(status);
  if (!parsedStatus.success) {
    return { error: "Situação inválida." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .update({ status: parsedStatus.data })
    .eq("id", patientId)
    .select("id, public_code")
    .single();

  if (error || !data) {
    return { error: "Não foi possível atualizar a situação agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "patient.status_change",
    resourceType: "patient",
    resourceId: data.public_code,
    metadata: { status: parsedStatus.data },
  });

  revalidatePath("/app/patients");
  revalidatePath(`/app/patients/${patientId}`);
  return { patientId: data.id as string };
}

export interface ClinicalProfileActionResult {
  error?: string;
}

/**
 * Server-side belt-and-suspenders on top of RLS: even though
 * patient_clinical_profile denies the secretary at the database layer, this
 * action re-checks the role before ever issuing the query so a secretary
 * session gets a clear application error instead of relying solely on the
 * database rejecting the write.
 */
export async function updateClinicalProfileAction(
  patientId: string,
  input: unknown,
): Promise<ClinicalProfileActionResult> {
  const { organizationId, role } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return { error: "Apenas a psicóloga administradora edita dados clínicos." };
  }

  const parsed = clinicalProfileFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("patient_clinical_profile").upsert({
    patient_id: patientId,
    chief_complaint: parsed.data.chiefComplaint || null,
    history: parsed.data.history || null,
    therapy_goals: parsed.data.therapyGoals || null,
    schemas: parsed.data.schemas || null,
    core_beliefs: parsed.data.coreBeliefs || null,
    general_clinical_notes: parsed.data.generalClinicalNotes || null,
  });

  if (error) {
    return { error: "Não foi possível salvar o acompanhamento clínico agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "patient.clinical_profile_update",
    resourceType: "patient_clinical_profile",
    resourceId: patientId,
  });

  revalidatePath(`/app/patients/${patientId}`);
  return {};
}
