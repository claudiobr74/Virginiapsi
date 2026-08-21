"use server";

import { revalidatePath } from "next/cache";
import { createTaskSchema } from "@/features/dashboard/contracts";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateAppointmentStatusAction } from "@/features/calendar/appointment-actions";

export interface DashboardActionResult {
  error?: string;
  taskId?: string;
}

export async function createTaskAction(
  input: unknown,
): Promise<DashboardActionResult> {
  const { organizationId } = await requireOrgContext();
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practice_tasks")
    .insert({
      organization_id: organizationId,
      title: parsed.data.title,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível criar a tarefa agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "practice_task.create",
    resourceType: "practice_task",
    resourceId: data.id as string,
  });

  revalidatePath("/app");
  return { taskId: data.id as string };
}

export async function completeTaskAction(
  taskId: string,
): Promise<DashboardActionResult> {
  const { organizationId } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("practice_tasks")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .is("completed_at", null)
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível concluir a tarefa agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "practice_task.complete",
    resourceType: "practice_task",
    resourceId: taskId,
  });

  revalidatePath("/app");
  return { taskId };
}

export async function deleteTaskAction(
  taskId: string,
): Promise<DashboardActionResult> {
  const { organizationId } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("practice_tasks")
    .delete()
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível remover a tarefa agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "practice_task.delete",
    resourceType: "practice_task",
    resourceId: taskId,
  });

  revalidatePath("/app");
  return { taskId };
}

/** Thin wrapper so Meu Dia can confirm without importing calendar UI internals. */
export async function confirmAppointmentFromMyDayAction(
  appointmentId: string,
): Promise<DashboardActionResult> {
  const result = await updateAppointmentStatusAction(appointmentId, "confirmed");
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/app");
  return {};
}

export async function markNoShowFromMyDayAction(
  appointmentId: string,
): Promise<DashboardActionResult> {
  const result = await updateAppointmentStatusAction(appointmentId, "no_show");
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/app");
  return {};
}
