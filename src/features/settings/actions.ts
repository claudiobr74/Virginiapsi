"use server";

import { revalidatePath } from "next/cache";
import { EXPORT_BUCKET, inviteAuthUserByEmail, settingsAdmin } from "@/features/settings/admin-store";
import {
  appearanceFormSchema,
  clinicFormSchema,
  eliminationConfirmSchema,
  eliminationPreviewSchema,
  inviteMemberSchema,
  profileFormSchema,
  requestExportSchema,
  retentionFormSchema,
  securityFormSchema,
  type EliminationPreviewResult,
  type SettingsActionResult,
} from "@/features/settings/contracts";
import { packLogicalExport } from "@/features/settings/export-pack";
import {
  eliminationPhraseMatches,
  resolveEliminationOutcome,
} from "@/features/settings/elimination";
import {
  countEliminationRecords,
  getLogicalExport,
  getPracticeSettings,
  previewPatientElimination,
} from "@/features/settings/queries";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { DOCUMENT_BUCKETS, removeFile } from "@/lib/documents/storage";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/documents/storage-meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function revalidateSettings() {
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

async function requireAdmin() {
  const ctx = await requireOrgContext();
  if (ctx.role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora acessa as configurações." } as const;
  }
  return ctx;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export async function updateProfileAction(input: unknown): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = profileFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.fullName },
  });
  if (error) {
    return { error: "Não foi possível atualizar o perfil." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.profile.update",
    resourceType: "user",
    resourceId: ctx.user.id,
  });
  revalidateSettings();
  return { id: ctx.user.id };
}

export async function updateClinicAction(input: unknown): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = clinicFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  const monthly =
    parsed.data.monthlyGoal && parsed.data.monthlyGoal.trim()
      ? Number(parsed.data.monthlyGoal.replace(",", "."))
      : null;

  const [{ error: orgError }, { error: settingsError }] = await Promise.all([
    supabase
      .from("organizations")
      .update({
        name: parsed.data.organizationName,
        timezone: parsed.data.timezone,
      })
      .eq("id", ctx.organizationId),
    supabase
      .from("practice_settings")
      .update({
        professional_name: emptyToNull(parsed.data.professionalName),
        subtitle: emptyToNull(parsed.data.subtitle),
        crp: emptyToNull(parsed.data.crp),
        tax_id: emptyToNull(parsed.data.taxId),
        pix_key: emptyToNull(parsed.data.pixKey),
        clinic_name: emptyToNull(parsed.data.clinicName),
        company_name: emptyToNull(parsed.data.companyName),
        session_duration_minutes: parsed.data.sessionDurationMinutes,
        monthly_goal: monthly,
      })
      .eq("organization_id", ctx.organizationId),
  ]);
  if (orgError || settingsError) {
    return { error: "Não foi possível salvar o consultório." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.clinic.update",
    resourceType: "practice_settings",
    resourceId: ctx.organizationId,
  });
  revalidateSettings();
  return { id: ctx.organizationId };
}

export async function updateAppearanceAction(input: unknown): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = appearanceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("practice_settings")
    .update({
      greeting_prefix: emptyToNull(parsed.data.greetingPrefix),
      quote: emptyToNull(parsed.data.quote),
    })
    .eq("organization_id", ctx.organizationId);
  if (error) {
    return { error: "Não foi possível salvar a aparência." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.appearance.update",
    resourceType: "practice_settings",
    resourceId: ctx.organizationId,
  });
  revalidateSettings();
  return { id: ctx.organizationId };
}

export async function updateSecurityAction(input: unknown): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = securityFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("practice_settings")
    .update({
      inactivity_timeout_minutes: parsed.data.inactivityTimeoutMinutes,
      secretary_finance_access: parsed.data.secretaryFinanceAccess,
    })
    .eq("organization_id", ctx.organizationId);
  if (error) {
    return { error: "Não foi possível salvar a segurança." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.security.update",
    resourceType: "practice_settings",
    resourceId: ctx.organizationId,
    metadata: { access: parsed.data.secretaryFinanceAccess },
  });
  revalidateSettings();
  return { id: ctx.organizationId };
}

export async function updateRetentionAction(input: unknown): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = retentionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const current = await getPracticeSettings(ctx.organizationId);
  if (
    current &&
    parsed.data.clinicalRecordMinimumRetentionYears <
      current.clinical_record_minimum_retention_years
  ) {
    return {
      error: "A guarda mínima do prontuário só pode ser aumentada.",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("practice_settings")
    .update({
      session_audio_fallback_retention_days: parsed.data.sessionAudioFallbackRetentionDays,
      transcript_retention_policy: parsed.data.transcriptRetentionPolicy,
      transcript_retention_fixed_days:
        parsed.data.transcriptRetentionPolicy === "fixed_days"
          ? parsed.data.transcriptRetentionFixedDays
          : null,
      clinical_record_minimum_retention_years: parsed.data.clinicalRecordMinimumRetentionYears,
    })
    .eq("organization_id", ctx.organizationId);
  if (error) {
    return { error: "Não foi possível salvar a retenção." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.retention.update",
    resourceType: "practice_settings",
    resourceId: ctx.organizationId,
  });
  revalidateSettings();
  return { id: ctx.organizationId };
}

export async function inviteMemberAction(input: unknown): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await inviteAuthUserByEmail(parsed.data.email);
  } catch {
    // Sem service-role o convite Auth fica pendente no banco até o cadastro.
  }
  const { data, error } = await supabase.rpc("invite_organization_member", {
    p_org_id: ctx.organizationId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return { error: "Esta pessoa já faz parte da equipe." };
    }
    return { error: "Não foi possível convidar o membro." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.team.invite",
    resourceType: "organization_member",
    resourceId: String(data),
    metadata: { role: parsed.data.role },
  });
  revalidateSettings();
  return { id: String(data) };
}

export async function setMemberActiveAction(input: {
  memberId: string;
  active: boolean;
}): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ active: input.active })
    .eq("id", input.memberId)
    .eq("organization_id", ctx.organizationId);
  if (error) {
    if (/keep at least one active psychologist_admin/i.test(error.message)) {
      return { error: "O consultório precisa manter ao menos uma administradora ativa." };
    }
    return { error: "Não foi possível atualizar o membro." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: input.active ? "settings.team.activate" : "settings.team.deactivate",
    resourceType: "organization_member",
    resourceId: input.memberId,
  });
  revalidateSettings();
  return { id: input.memberId };
}

export async function requestLogicalExportAction(
  input: unknown,
): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = requestExportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (parsed.data.scope === "patient" && !parsed.data.patientId) {
    return { error: "Selecione o paciente da exportação." };
  }

  const supabase = await createSupabaseServerClient();
  let patientPublicCode: string | null = null;
  if (parsed.data.patientId) {
    const { data: patient } = await supabase
      .from("patients")
      .select("id, public_code, organization_id")
      .eq("id", parsed.data.patientId)
      .maybeSingle();
    if (!patient || patient.organization_id !== ctx.organizationId) {
      return { error: "Paciente não encontrado neste consultório." };
    }
    patientPublicCode = patient.public_code as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("logical_exports")
    .insert({
      organization_id: ctx.organizationId,
      actor_user_id: ctx.user.id,
      scope: parsed.data.scope,
      patient_id: parsed.data.scope === "patient" ? parsed.data.patientId : null,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { error: "Não foi possível iniciar a exportação." };
  }

  const exportId = inserted.id as string;
  await supabase
    .from("logical_exports")
    .update({ status: "packing" })
    .eq("id", exportId);

  try {
    const packed = await packLogicalExport({
      supabase: supabase as unknown as Parameters<typeof packLogicalExport>[0]["supabase"],
      organizationId: ctx.organizationId,
      organizationName: ctx.organizationName,
      actorUserId: ctx.user.id,
      scope: parsed.data.scope,
      patientId: parsed.data.scope === "patient" ? parsed.data.patientId ?? null : null,
      patientPublicCode,
    });
    const storagePath = `${ctx.organizationId}/${exportId}.zip`;
    const admin = settingsAdmin();
    const { error: uploadError } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(storagePath, packed.zip, {
        contentType: "application/zip",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }
    const readyAt = new Date();
    const expiresAt = new Date(readyAt.getTime() + 24 * 60 * 60 * 1000);
    const { error: readyError } = await supabase
      .from("logical_exports")
      .update({
        status: "ready",
        storage_path: storagePath,
        package_bytes: packed.zip.length,
        file_count: packed.manifest.files.length + 1,
        package_sha256: packed.packageSha256,
        manifest_sha256: packed.manifestSha256,
        ready_at: readyAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        error_code: null,
      })
      .eq("id", exportId);
    if (readyError) {
      throw new Error(readyError.message);
    }
    await logAuditEvent({
      organizationId: ctx.organizationId,
      action: "settings.export.ready",
      resourceType: "logical_export",
      resourceId: exportId,
      metadata: { scope: parsed.data.scope },
    });
    revalidateSettings();
    return { id: exportId };
  } catch {
    await supabase
      .from("logical_exports")
      .update({ status: "failed", error_code: "pack_failed" })
      .eq("id", exportId);
    return { error: "A exportação falhou ao empacotar os dados." };
  }
}

export async function createExportDownloadUrlAction(
  exportId: string,
): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const row = await getLogicalExport(ctx.organizationId, exportId);
  if (!row || !row.storage_path) {
    return { error: "Exportação não encontrada." };
  }
  if (row.status !== "ready") {
    return { error: "Esta exportação ainda não está pronta para download." };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { error: "O link desta exportação expirou. Solicite uma nova." };
  }

  const admin = settingsAdmin();
  const { data, error } = await admin.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return { error: "Não foi possível emitir o download." };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.export.download",
    resourceType: "logical_export",
    resourceId: exportId,
  });
  return { id: exportId, url: data.signedUrl };
}

export async function previewEliminationAction(
  input: unknown,
): Promise<EliminationPreviewResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = eliminationPreviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id, preferred_name, public_code, organization_id, elimination_status")
    .eq("id", parsed.data.patientId)
    .maybeSingle();
  if (!patient || patient.organization_id !== ctx.organizationId) {
    return { error: "Paciente não encontrado neste consultório." };
  }
  if (patient.elimination_status !== "active") {
    return { error: "Este paciente já passou por um fluxo de eliminação." };
  }
  const report = await previewPatientElimination(ctx.organizationId, {
    id: patient.id as string,
    preferred_name: patient.preferred_name as string,
    public_code: patient.public_code as string,
  });
  return {
    id: patient.id as string,
    publicCode: patient.public_code as string,
    report,
  };
}

export async function confirmEliminationAction(input: unknown): Promise<SettingsActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const parsed = eliminationConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select(
      "id, preferred_name, public_code, organization_id, elimination_status, photo_path",
    )
    .eq("id", parsed.data.patientId)
    .maybeSingle();
  if (!patient || patient.organization_id !== ctx.organizationId) {
    return { error: "Paciente não encontrado neste consultório." };
  }
  if (patient.elimination_status !== "active") {
    return { error: "Este paciente já passou por um fluxo de eliminação." };
  }
  if (!eliminationPhraseMatches(parsed.data.confirmationPhrase, patient.public_code as string)) {
    return {
      error: "A frase de confirmação não confere. Nada foi alterado.",
    };
  }

  const counts = await countEliminationRecords(ctx.organizationId, patient.id as string);
  const outcome = resolveEliminationOutcome(counts);
  const now = new Date().toISOString();
  const publicCode = patient.public_code as string;

  const { error } = await supabase
    .from("patients")
    .update({
      preferred_name: `Eliminado ${publicCode}`,
      full_name: `Paciente eliminado (${publicCode})`,
      email: null,
      phone: null,
      cpf: null,
      birth_date: null,
      responsibles: [],
      status: "archived",
      photo_path: null,
      elimination_status: outcome.status,
      elimination_requested_at: now,
      elimination_completed_at: now,
      elimination_retained_reason: outcome.retainedReason,
    })
    .eq("id", patient.id)
    .eq("organization_id", ctx.organizationId);

  if (error) {
    return { error: "Não foi possível concluir a eliminação." };
  }

  const portraitPath = typeof patient.photo_path === "string" ? patient.photo_path : null;
  if (portraitPath) {
    try {
      await removeFile(DOCUMENT_BUCKETS.patientAttachments, portraitPath);
    } catch {
      // Identifiers are already anonymized; leftover bytes are swept by storage hygiene.
    }
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "settings.lgpd.eliminate",
    resourceType: "patient",
    resourceId: publicCode,
    metadata: { outcome: outcome.status },
  });
  revalidateSettings();
  revalidatePath("/app/patients");
  return { id: patient.id as string };
}
