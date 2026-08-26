"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  dpepFormSchema,
  workingNotesFormSchema,
} from "@/features/sessions/contracts";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { hasPatientClinicalAccess } from "@/features/patients/clinical-access";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionActionResult {
  error?: string;
  conflict?: boolean;
  sessionId?: string;
  newVersion?: number;
  warning?: string;
}

const FORBIDDEN_ROLE_MESSAGE = "Somente a psicóloga responsável conduz sessão clínica.";

export async function startSessionAction(
  patientId: string,
  appointmentId?: string,
): Promise<SessionActionResult> {
  const { organizationId, role, user } = await requireOrgContext();
  if (
    !(await hasPatientClinicalAccess({
      organizationId,
      role,
      userId: user.id,
      patientId,
    }))
  ) {
    return { error: FORBIDDEN_ROLE_MESSAGE };
  }
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("start_clinical_session", {
    org_id: organizationId,
    p_patient_id: patientId,
    p_appointment_id: appointmentId ?? null,
  });

  if (error || !data) {
    return { error: "Não foi possível iniciar a sessão agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "clinical_session.start",
    resourceType: "clinical_session",
    resourceId: data as string,
  });

  revalidatePath(`/app/patients/${patientId}`);
  return { sessionId: data as string };
}

export async function saveDpepAction(
  sessionId: string,
  input: unknown,
): Promise<SessionActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: FORBIDDEN_ROLE_MESSAGE };
  }
  const parsed = dpepFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_session_dpep", {
    p_session_id: sessionId,
    org_id: organizationId,
    p_expected_version: parsed.data.expectedVersion,
    p_demand: parsed.data.demand || null,
    p_procedures: parsed.data.procedures || null,
    p_evolution: parsed.data.evolution || null,
    p_plan: parsed.data.plan || null,
  });

  if (error) {
    return { error: "Não foi possível salvar o DPEP agora." };
  }

  const rows = (data ?? []) as { new_version: number }[];
  if (rows.length === 0) {
    return {
      conflict: true,
      error:
        "Este registro foi alterado em outra aba/dispositivo. Recarregue antes de salvar de novo.",
    };
  }

  await logAuditEvent({
    organizationId,
    action: "session_dpep.save",
    resourceType: "clinical_session",
    resourceId: sessionId,
  });

  revalidatePath(`/session/${sessionId}`);
  return { sessionId, newVersion: rows[0].new_version };
}

export async function saveWorkingNotesAction(
  sessionId: string,
  input: unknown,
): Promise<SessionActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: FORBIDDEN_ROLE_MESSAGE };
  }
  const parsed = workingNotesFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_session_working_notes", {
    p_session_id: sessionId,
    org_id: organizationId,
    p_expected_version: parsed.data.expectedVersion,
    p_formulation: parsed.data.formulation || null,
    p_hypotheses: parsed.data.hypotheses || null,
    p_working_observations: parsed.data.workingObservations || null,
  });

  if (error) {
    return { error: "Não foi possível salvar a área clínica agora." };
  }

  const rows = (data ?? []) as { new_version: number }[];
  if (rows.length === 0) {
    return {
      conflict: true,
      error:
        "Este registro foi alterado em outra aba/dispositivo. Recarregue antes de salvar de novo.",
    };
  }

  await logAuditEvent({
    organizationId,
    action: "session_working_notes.save",
    resourceType: "clinical_session",
    resourceId: sessionId,
  });

  revalidatePath(`/session/${sessionId}`);
  return { sessionId, newVersion: rows[0].new_version };
}

export async function finalizeSessionAction(
  sessionId: string,
  idempotencyKey?: string,
): Promise<SessionActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: FORBIDDEN_ROLE_MESSAGE };
  }
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("finalize_clinical_session", {
    p_session_id: sessionId,
    org_id: organizationId,
    p_idempotency_key: idempotencyKey ?? randomUUID(),
  });

  const rows = (data ?? []) as { out_status: string }[];
  if (error || rows.length === 0) {
    return { error: "Não foi possível finalizar a sessão agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "clinical_session.finalize",
    resourceType: "clinical_session",
    resourceId: sessionId,
  });

  const { error: chargeError } = await supabase.rpc("create_session_charge", {
    p_session_id: sessionId,
    org_id: organizationId,
  });

  revalidatePath(`/session/${sessionId}`);
  revalidatePath("/app/finance");
  revalidatePath("/app");
  return {
    sessionId,
    warning: chargeError
      ? "Sessão finalizada, mas a cobrança não foi gerada automaticamente."
      : undefined,
  };
}

export async function cancelSessionAction(
  sessionId: string,
): Promise<SessionActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: FORBIDDEN_ROLE_MESSAGE };
  }
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("clinical_sessions")
    .update({ status: "canceled" })
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .neq("status", "finalized")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível cancelar a sessão agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "clinical_session.cancel",
    resourceType: "clinical_session",
    resourceId: sessionId,
  });

  revalidatePath(`/session/${sessionId}`);
  return { sessionId };
}
