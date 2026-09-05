"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  APPOINTMENT_STATUS_VALUES,
  appointmentFormSchema,
  type AppointmentFormValues,
  type AppointmentRow,
} from "@/features/calendar/contracts";
import {
  findOverlappingManagedAppointment,
  getAppointment,
} from "@/features/calendar/appointment-queries";
import { getConnection } from "@/features/calendar/connection-queries";
import {
  persistGoogleCreateLink,
  resultAfterGoogleDeleteAndLocal,
  resultAfterGooglePatchAndLocal,
} from "@/features/calendar/google-sync-compensation";
import {
  deleteGoogleEventIgnoring404,
  googleEventWriteBody,
} from "@/features/calendar/google-write";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { getCalendarClientForOrganization } from "@/lib/integrations/google/connection";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hardDeleteBlockedReason } from "@/features/calendar/appointment-delete-guard";
import { zonedTimeToUtcIso } from "@/lib/utils/timezone";

export interface AppointmentActionResult {
  error?: string;
  appointmentId?: string;
  conflict?: boolean;
  syncError?: string;
}

function computeWindow(values: AppointmentFormValues, timezone: string) {
  const startsAt = zonedTimeToUtcIso(values.date, values.startTime, timezone);
  const endsAt = new Date(
    new Date(startsAt).getTime() + Number(values.durationMinutes) * 60_000,
  ).toISOString();
  return { startsAt, endsAt };
}

async function buildPatientSummary(patientId: string | undefined) {
  if (!patientId) {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("full_name, preferred_name, public_code")
    .eq("id", patientId)
    .maybeSingle();

  if (!data) {
    return null;
  }
  const name =
    (data.preferred_name as string | null)?.trim() || (data.full_name as string);
  return `${name} • ${data.public_code as string}`;
}

async function resolveSummary(values: AppointmentFormValues): Promise<string> {
  const title = values.title.trim();
  if (title) {
    return title;
  }
  return (await buildPatientSummary(values.patientId || undefined)) ?? "Consulta";
}

async function logSyncEvent(input: {
  organizationId: string;
  direction: "push" | "pull";
  action: string;
  appointmentId?: string;
  requestPayload?: Record<string, unknown>;
  responseStatus?: string;
  errorMessage?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("log_calendar_sync_event", {
    org_id: input.organizationId,
    direction: input.direction,
    action: input.action,
    appointment_id: input.appointmentId ?? null,
    request_payload: input.requestPayload ?? {},
    response_status: input.responseStatus ?? null,
    error_message: input.errorMessage ?? null,
  });
  if (error) {
    return;
  }
}

function revalidateAgenda() {
  revalidatePath("/app/agenda");
  revalidatePath("/app");
}

async function hasClinicalSession(
  organizationId: string,
  appointmentId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("clinical_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("appointment_id", appointmentId);

  if (error) {
    return true;
  }
  return (count ?? 0) > 0;
}

async function updateExternalMirror(input: {
  organizationId: string;
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  summary: string;
  status: AppointmentRow["status"];
  googleEtag?: string | null;
  googleColorId?: string | null;
  patientId?: string | null;
  modality?: AppointmentRow["modality"];
}): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_external_appointment_mirror", {
    org_id: input.organizationId,
    p_appointment_id: input.appointmentId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_summary_snapshot: input.summary,
    p_status: input.status,
    p_google_etag: input.googleEtag ?? null,
    p_google_color_id: input.googleColorId ?? null,
    p_patient_id: input.patientId ?? null,
    p_modality: input.modality ?? null,
  });
  return resultAfterGooglePatchAndLocal(error);
}

async function deleteExternalMirror(
  organizationId: string,
  appointmentId: string,
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_external_appointment_mirror", {
    org_id: organizationId,
    p_appointment_id: appointmentId,
  });
  return resultAfterGoogleDeleteAndLocal(error);
}

async function pushNewGoogleEvent(input: {
  organizationId: string;
  appointmentId: string;
  summary: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ syncError?: string }> {
  const connection = await getConnection(input.organizationId).catch(() => null);
  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return {};
  }

  const supabase = await createSupabaseServerClient();
  try {
    const client = await getCalendarClientForOrganization(input.organizationId);
    const event = await client.insertEvent(
      connection.calendar_id,
      googleEventWriteBody({
        summary: input.summary,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      }),
    );

    const calendarId = connection.calendar_id;
    const link = await persistGoogleCreateLink({
      appointmentId: input.appointmentId,
      googleEventId: event.id,
      persist: async () => {
        const { error } = await supabase
          .from("appointments")
          .update({
            google_calendar_id: calendarId,
            google_event_id: event.id,
            google_etag: event.etag ?? null,
            google_color_id: event.colorId ?? null,
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", input.appointmentId)
          .eq("origin", "TESSELI");
        return { error };
      },
      compensateDelete: async () => {
        try {
          await deleteGoogleEventIgnoring404(client, calendarId, event.id);
          return { ok: true };
        } catch {
          return { ok: false };
        }
      },
      markLocalError: async () => {
        const { error } = await supabase
          .from("appointments")
          .update({ sync_status: "error" })
          .eq("id", input.appointmentId)
          .eq("origin", "TESSELI");
        return { error };
      },
    });

    if (!link.ok) {
      await logSyncEvent({
        organizationId: input.organizationId,
        direction: "push",
        action: link.compensated ? "create_event" : "PARTIAL_SYNC_FAILURE",
        appointmentId: input.appointmentId,
        requestPayload: {
          appointment_id: input.appointmentId,
          google_event_id: event.id,
          compensated: link.compensated,
        },
        errorMessage: link.syncError,
      });
      return { syncError: link.syncError };
    }

    await logAuditEvent({
      organizationId: input.organizationId,
      action: "google.create_event",
      resourceType: "appointment",
      resourceId: input.appointmentId,
    });
    await logSyncEvent({
      organizationId: input.organizationId,
      direction: "push",
      action: "create_event",
      appointmentId: input.appointmentId,
      requestPayload: { starts_at: input.startsAt, ends_at: input.endsAt },
      responseStatus: "200",
    });
    return {};
  } catch (error) {
    const { error: markError } = await supabase
      .from("appointments")
      .update({ sync_status: "error" })
      .eq("id", input.appointmentId)
      .eq("origin", "TESSELI");
    if (markError) {
      await logSyncEvent({
        organizationId: input.organizationId,
        direction: "push",
        action: "create_event",
        appointmentId: input.appointmentId,
        errorMessage: markError.message,
      });
    }
    await logSyncEvent({
      organizationId: input.organizationId,
      direction: "push",
      action: "create_event",
      appointmentId: input.appointmentId,
      errorMessage: error instanceof Error ? error.message : "unknown_error",
    });
    return { syncError: "Não foi possível sincronizar com Google." };
  }
}

async function patchExistingGoogleEvent(input: {
  organizationId: string;
  appointment: AppointmentRow;
  summary: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ error?: string; etag?: string | null; colorId?: string | null }> {
  if (!input.appointment.google_event_id) {
    return {};
  }
  const connection = await getConnection(input.organizationId).catch(() => null);
  const calendarId =
    input.appointment.google_calendar_id ?? connection?.calendar_id ?? null;
  if (connection?.status !== "connected" || !calendarId) {
    if (input.appointment.origin === "GOOGLE_EXTERNAL") {
      return { error: "Conecte o Google Agenda para editar este agendamento." };
    }
    return {};
  }

  try {
    const client = await getCalendarClientForOrganization(input.organizationId);
    const event = await client.patchEvent(
      calendarId,
      input.appointment.google_event_id,
      googleEventWriteBody({
        summary: input.summary,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      }),
    );
    await logAuditEvent({
      organizationId: input.organizationId,
      action: "google.update_event",
      resourceType: "appointment",
      resourceId: input.appointment.id,
    });
    await logSyncEvent({
      organizationId: input.organizationId,
      direction: "push",
      action: "update_event",
      appointmentId: input.appointment.id,
      requestPayload: { starts_at: input.startsAt, ends_at: input.endsAt },
      responseStatus: "200",
    });
    return { etag: event.etag ?? null, colorId: event.colorId ?? null };
  } catch (error) {
    await logSyncEvent({
      organizationId: input.organizationId,
      direction: "push",
      action: "update_event",
      appointmentId: input.appointment.id,
      errorMessage: error instanceof Error ? error.message : "unknown_error",
    });
    return { error: "Não foi possível sincronizar com Google." };
  }
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
  const summarySnapshot = await resolveSummary(parsed.data);

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

  const google = await pushNewGoogleEvent({
    organizationId,
    appointmentId: data.id as string,
    summary: summarySnapshot,
    startsAt,
    endsAt,
  });

  revalidateAgenda();
  return { appointmentId: data.id as string, syncError: google.syncError };
}

export async function retryGoogleSyncAction(
  appointmentId: string,
): Promise<AppointmentActionResult> {
  const { organizationId } = await requireOrgContext();
  const appointment = await getAppointment(organizationId, appointmentId);
  if (!appointment || appointment.origin !== "TESSELI") {
    return { error: "Consulta não encontrada." };
  }

  const google = appointment.google_event_id
    ? await patchExistingGoogleEvent({
        organizationId,
        appointment,
        summary: appointment.summary_snapshot ?? "Consulta",
        startsAt: appointment.starts_at,
        endsAt: appointment.ends_at,
      })
    : await pushNewGoogleEvent({
        organizationId,
        appointmentId,
        summary: appointment.summary_snapshot ?? "Consulta",
        startsAt: appointment.starts_at,
        endsAt: appointment.ends_at,
      });

  if ("error" in google && google.error) {
    return { error: google.error };
  }
  if ("syncError" in google && google.syncError) {
    return { error: google.syncError };
  }

  revalidateAgenda();
  return { appointmentId };
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

  const appointment = await getAppointment(organizationId, appointmentId);
  if (!appointment) {
    return { error: "Não foi possível atualizar a consulta agora." };
  }

  if (appointment.origin === "GOOGLE_EXTERNAL") {
    const mirrored = await updateExternalMirror({
      organizationId,
      appointmentId,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      summary: appointment.summary_snapshot ?? "Consulta",
      status: parsedStatus.data,
      patientId: appointment.patient_id,
      modality: appointment.modality,
    });
    if (mirrored.error) {
      return mirrored;
    }
  } else {
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
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.update",
    resourceType: "appointment",
    resourceId: appointmentId,
    metadata: { status: parsedStatus.data },
  });

  revalidateAgenda();
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

  const appointment = await getAppointment(organizationId, appointmentId);
  if (!appointment) {
    return { error: "Não foi possível remarcar a consulta agora." };
  }

  const { startsAt, endsAt } = computeWindow(parsed.data, timezone);
  const summary = await resolveSummary(parsed.data);
  const patientId = parsed.data.patientId || null;

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

  if (appointment.google_event_id) {
    const patched = await patchExistingGoogleEvent({
      organizationId,
      appointment,
      summary,
      startsAt,
      endsAt,
    });
    if (patched.error) {
      return { error: patched.error };
    }

    if (appointment.origin === "GOOGLE_EXTERNAL") {
      const mirrored = await updateExternalMirror({
        organizationId,
        appointmentId,
        startsAt,
        endsAt,
        summary,
        status: appointment.status,
        googleEtag: patched.etag,
        googleColorId: patched.colorId,
        patientId,
        modality: parsed.data.modality,
      });
      if (mirrored.error) {
        return mirrored;
      }
    } else {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("appointments")
        .update({
          starts_at: startsAt,
          ends_at: endsAt,
          modality: parsed.data.modality,
          patient_id: patientId,
          summary_snapshot: summary,
          google_etag: patched.etag ?? appointment.google_etag ?? null,
          google_color_id: patched.colorId ?? appointment.google_color_id ?? null,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", appointmentId)
        .select("id")
        .single();
      if (error || !data) {
        return resultAfterGooglePatchAndLocal(error ?? "missing_row");
      }
    }
  } else if (appointment.origin === "TESSELI") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("appointments")
      .update({
        starts_at: startsAt,
        ends_at: endsAt,
        modality: parsed.data.modality,
        patient_id: patientId,
        summary_snapshot: summary,
      })
      .eq("id", appointmentId)
      .select("id")
      .single();
    if (error || !data) {
      return { error: "Não foi possível remarcar a consulta agora." };
    }

    const google = await pushNewGoogleEvent({
      organizationId,
      appointmentId,
      summary,
      startsAt,
      endsAt,
    });
    await logAuditEvent({
      organizationId,
      action: "appointment.update",
      resourceType: "appointment",
      resourceId: appointmentId,
    });
    revalidateAgenda();
    return { appointmentId, syncError: google.syncError };
  } else {
    return { error: "Não foi possível remarcar a consulta agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.update",
    resourceType: "appointment",
    resourceId: appointmentId,
  });

  revalidateAgenda();
  return { appointmentId };
}

export async function cancelAppointmentAction(
  appointmentId: string,
): Promise<AppointmentActionResult> {
  const { organizationId } = await requireOrgContext();
  const appointment = await getAppointment(organizationId, appointmentId);
  if (!appointment) {
    return { error: "Não foi possível cancelar a consulta agora." };
  }

  if (appointment.origin === "GOOGLE_EXTERNAL" && appointment.google_event_id) {
    const connection = await getConnection(organizationId).catch(() => null);
    const calendarId =
      appointment.google_calendar_id ?? connection?.calendar_id ?? null;
    if (connection?.status === "connected" && calendarId) {
      try {
        const client = await getCalendarClientForOrganization(organizationId);
        await client.patchEvent(calendarId, appointment.google_event_id, {
          status: "cancelled",
        });
        await logAuditEvent({
          organizationId,
          action: "google.update_event",
          resourceType: "appointment",
          resourceId: appointmentId,
        });
      } catch (error) {
        await logSyncEvent({
          organizationId,
          direction: "push",
          action: "update_event",
          appointmentId,
          errorMessage: error instanceof Error ? error.message : "unknown_error",
        });
        return { error: "Não foi possível sincronizar com Google." };
      }
    }

    const mirrored = await updateExternalMirror({
      organizationId,
      appointmentId,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      summary: appointment.summary_snapshot ?? "Consulta",
      status: "cancelled",
      patientId: appointment.patient_id,
      modality: appointment.modality,
    });
    if (mirrored.error) {
      return mirrored;
    }
  } else {
    if (appointment.google_event_id) {
      const connection = await getConnection(organizationId).catch(() => null);
      const calendarId =
        appointment.google_calendar_id ?? connection?.calendar_id ?? null;
      if (connection?.status === "connected" && calendarId) {
        try {
          const client = await getCalendarClientForOrganization(organizationId);
          await client.patchEvent(calendarId, appointment.google_event_id, {
            status: "cancelled",
          });
          await logAuditEvent({
            organizationId,
            action: "google.update_event",
            resourceType: "appointment",
            resourceId: appointmentId,
          });
        } catch (error) {
          await logSyncEvent({
            organizationId,
            direction: "push",
            action: "update_event",
            appointmentId,
            errorMessage: error instanceof Error ? error.message : "unknown_error",
          });
          return { error: "Não foi possível sincronizar com Google." };
        }
      }
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointmentId)
      .select("id")
      .single();
    if (error || !data) {
      return { error: "Não foi possível cancelar a consulta agora." };
    }
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.cancel",
    resourceType: "appointment",
    resourceId: appointmentId,
  });

  revalidateAgenda();
  return { appointmentId };
}

export async function deleteAppointmentAction(
  appointmentId: string,
): Promise<AppointmentActionResult> {
  const { organizationId } = await requireOrgContext();
  const appointment = await getAppointment(organizationId, appointmentId);
  if (!appointment) {
    return { error: "Não foi possível excluir o agendamento agora." };
  }

  const clinicalBlock = hardDeleteBlockedReason(
    await hasClinicalSession(organizationId, appointmentId),
  );
  if (clinicalBlock) {
    return { error: clinicalBlock };
  }

  if (appointment.google_event_id) {
    const connection = await getConnection(organizationId).catch(() => null);
    const calendarId =
      appointment.google_calendar_id ?? connection?.calendar_id ?? null;
    if (appointment.origin === "GOOGLE_EXTERNAL" && connection?.status !== "connected") {
      return { error: "Conecte o Google Agenda para excluir este agendamento." };
    }
    if (connection?.status === "connected" && calendarId) {
      try {
        const client = await getCalendarClientForOrganization(organizationId);
        await deleteGoogleEventIgnoring404(
          client,
          calendarId,
          appointment.google_event_id,
        );
        await logAuditEvent({
          organizationId,
          action: "google.delete_event",
          resourceType: "appointment",
          resourceId: appointmentId,
        });
        await logSyncEvent({
          organizationId,
          direction: "push",
          action: "delete_event",
          appointmentId,
          responseStatus: "200",
        });
      } catch (error) {
        await logSyncEvent({
          organizationId,
          direction: "push",
          action: "delete_event",
          appointmentId,
          errorMessage: error instanceof Error ? error.message : "unknown_error",
        });
        return { error: "Não foi possível remover o evento no Google." };
      }
    }
  }

  if (appointment.origin === "GOOGLE_EXTERNAL") {
    const mirrored = await deleteExternalMirror(organizationId, appointmentId);
    if (mirrored.error) {
      return mirrored;
    }
  } else {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointmentId);
    if (error) {
      return { error: "Não foi possível excluir o agendamento agora." };
    }
  }

  await logAuditEvent({
    organizationId,
    action: "appointment.delete",
    resourceType: "appointment",
    resourceId: appointmentId,
  });

  revalidateAgenda();
  return { appointmentId };
}
