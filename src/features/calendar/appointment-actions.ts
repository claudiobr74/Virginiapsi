"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  APPOINTMENT_STATUS_VALUES,
  appointmentFormSchema,
  type AppointmentFormValues,
} from "@/features/calendar/contracts";
import { findOverlappingManagedAppointment } from "@/features/calendar/appointment-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonedTimeToUtcIso } from "@/lib/utils/timezone";

export interface AppointmentActionResult {
  error?: string;
  appointmentId?: string;
  conflict?: boolean;
}

function computeWindow(values: AppointmentFormValues, timezone: string) {
  const startsAt = zonedTimeToUtcIso(values.date, values.startTime, timezone);
  const endsAt = new Date(
    new Date(startsAt).getTime() + Number(values.durationMinutes) * 60_000,
  ).toISOString();
  return { startsAt, endsAt };
}

async function buildSummarySnapshot(patientId: string | undefined) {
  if (!patientId) {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("full_name, public_code")
    .eq("id", patientId)
    .maybeSingle();

  return data ? `${data.full_name as string} • ${data.public_code as string}` : null;
}

export async function createAppointmentAction(
  input: unknown,
  options: { force?: boolean } = {},
): Promise<AppointmentActionResult> {
  const { organizationId, timezone } = await requireOrgContext();

  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { startsAt, endsAt } = computeWindow(parsed.data, timezone);

  if (!options.force) {
    const conflict = await findOverlappingManagedAppointment(organizationId, startsAt, endsAt);
    if (conflict) {
      return {
        conflict: true,
        error: "Já existe uma sessão agendada nesse horário.",
      };
    }
  }

  const patientId = parsed.data.patientId || undefined;
  const summarySnapshot = await buildSummarySnapshot(patientId);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      patient_id: patientId ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      modality: parsed.data.modality,
      summary_snapshot: summarySnapshot,
      create_idempotency_key: randomUUID(),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível criar a consulta agora. Tente novamente." };
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.create",
    resourceType: "appointment",
    resourceId: data.id as string,
  });

  revalidatePath("/app/agenda");
  return { appointmentId: data.id as string };
}

export async function updateAppointmentStatusAction(
  appointmentId: string,
  status: string,
): Promise<AppointmentActionResult> {
  const { organizationId } = await requireOrgContext();

  const parsedStatus = z.enum(APPOINTMENT_STATUS_VALUES).safeParse(status);
  if (!parsedStatus.success) {
    return { error: "Situação inválida." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: parsedStatus.data })
    .eq("id", appointmentId)
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível atualizar a consulta agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.status_change",
    resourceType: "appointment",
    resourceId: appointmentId,
    metadata: { status: parsedStatus.data },
  });

  revalidatePath("/app/agenda");
  return { appointmentId };
}

export async function rescheduleAppointmentAction(
  appointmentId: string,
  input: unknown,
  options: { force?: boolean } = {},
): Promise<AppointmentActionResult> {
  const { organizationId, timezone } = await requireOrgContext();

  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { startsAt, endsAt } = computeWindow(parsed.data, timezone);

  if (!options.force) {
    const conflict = await findOverlappingManagedAppointment(
      organizationId,
      startsAt,
      endsAt,
      appointmentId,
    );
    if (conflict) {
      return { conflict: true, error: "Já existe uma sessão agendada nesse horário." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      starts_at: startsAt,
      ends_at: endsAt,
      modality: parsed.data.modality,
    })
    .eq("id", appointmentId)
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível remarcar a consulta agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.reschedule",
    resourceType: "appointment",
    resourceId: appointmentId,
  });

  revalidatePath("/app/agenda");
  return { appointmentId };
}

export async function cancelAppointmentAction(
  appointmentId: string,
): Promise<AppointmentActionResult> {
  return updateAppointmentStatusAction(appointmentId, "cancelled");
}
