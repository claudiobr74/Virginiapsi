"use server";

import { revalidatePath } from "next/cache";
import {
  clinicalProfileFormSchema,
  patientFormSchema,
  type PatientFormValues,
} from "@/features/patients/contracts";
import {
  PORTRAIT_MAX_BYTES,
  isPortraitMimeType,
  isPortraitStoragePath,
  portraitFilename,
} from "@/features/patients/portrait";
import { hasPatientClinicalAccess } from "@/features/patients/clinical-access";
import { getPatient } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import {
  DOCUMENT_BUCKETS,
  createSignedUploadUrl,
  removeFile,
} from "@/lib/documents/storage";
import { classifyStorageFailure } from "@/lib/documents/storage-failure";
import { buildStoragePath } from "@/lib/documents/storage-meta";
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
    responsible_psychologist_user_id: values.responsiblePsychologistUserId
      ? values.responsiblePsychologistUserId
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
  const { organizationId, role, user } = await requireOrgContext();

  if (
    !(await hasPatientClinicalAccess({
      organizationId,
      role,
      userId: user.id,
      patientId,
    }))
  ) {
    return { error: "Apenas a psicóloga responsável edita dados clínicos." };
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

export async function requestPortraitUploadUrlAction(input: {
  patientId: string;
  mimeType: string;
}): Promise<PatientActionResult & { path?: string; token?: string }> {
  const { organizationId } = await requireOrgContext();
  if (!isPortraitMimeType(input.mimeType)) {
    return { error: "Use uma imagem JPEG, PNG ou WebP." };
  }
  const patient = await getPatient(organizationId, input.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const path = buildStoragePath(
    organizationId,
    input.patientId,
    portraitFilename(input.mimeType),
  );
  try {
    const { token } = await createSignedUploadUrl(DOCUMENT_BUCKETS.patientAttachments, path);
    return { path, token };
  } catch (error) {
    console.error("[patient-photo] signed upload failed", {
      code: classifyStorageFailure(error).code,
      bucket: DOCUMENT_BUCKETS.patientAttachments,
      stage: "create_signed_upload_url",
    });
    return { error: "Não foi possível preparar o envio da foto agora." };
  }
}

export async function confirmPortraitUploadAction(input: {
  patientId: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
}): Promise<PatientActionResult> {
  const { organizationId } = await requireOrgContext();
  if (!isPortraitMimeType(input.mimeType)) {
    return { error: "Use uma imagem JPEG, PNG ou WebP." };
  }
  if (input.byteSize <= 0 || input.byteSize > PORTRAIT_MAX_BYTES) {
    return { error: "A foto deve ter no máximo 5 MB." };
  }
  if (!isPortraitStoragePath(organizationId, input.patientId, input.storagePath)) {
    return { error: "Caminho de upload inválido." };
  }

  const patient = await getPatient(organizationId, input.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const supabase = await createSupabaseServerClient();
  const previousPath = patient.photo_path;
  const { error } = await supabase
    .from("patients")
    .update({ photo_path: input.storagePath })
    .eq("id", input.patientId)
    .eq("organization_id", organizationId);

  if (error) {
    return { error: "Não foi possível salvar a foto agora." };
  }

  if (previousPath && previousPath !== input.storagePath) {
    await removeFile(DOCUMENT_BUCKETS.patientAttachments, previousPath);
  }

  await logAuditEvent({
    organizationId,
    action: "patient.portrait_update",
    resourceType: "patient",
    resourceId: patient.public_code,
  });

  revalidatePath("/app/patients");
  revalidatePath(`/app/patients/${input.patientId}`);
  revalidatePath(`/app/patients/${input.patientId}/edit`);
  return { patientId: input.patientId };
}

export async function clearPortraitAction(patientId: string): Promise<PatientActionResult> {
  const { organizationId } = await requireOrgContext();
  const patient = await getPatient(organizationId, patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("patients")
    .update({ photo_path: null })
    .eq("id", patientId)
    .eq("organization_id", organizationId);

  if (error) {
    return { error: "Não foi possível remover a foto agora." };
  }

  if (patient.photo_path) {
    await removeFile(DOCUMENT_BUCKETS.patientAttachments, patient.photo_path);
  }

  await logAuditEvent({
    organizationId,
    action: "patient.portrait_clear",
    resourceType: "patient",
    resourceId: patient.public_code,
  });

  revalidatePath("/app/patients");
  revalidatePath(`/app/patients/${patientId}`);
  revalidatePath(`/app/patients/${patientId}/edit`);
  return { patientId };
}
