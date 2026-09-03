"use server";

import { revalidatePath } from "next/cache";
import { persistGoogleCreateLink, LOCAL_MIRROR_UPDATE_ERROR } from "@/features/calendar/google-sync-compensation";
import { deleteGoogleEventIgnoring404 } from "@/features/calendar/google-write";
import { getAppointment } from "@/features/calendar/appointment-queries";
import { getConnection } from "@/features/calendar/connection-queries";
import { runGoogleCalendarPull } from "@/features/calendar/google-calendar-pull";
import {
  getCalendarClientForOrganization,
} from "@/lib/integrations/google/connection";
import {
  inspectExistingMeet,
  requestMeetForEvent,
} from "@/lib/integrations/google/meet";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SyncActionResult {
  error?: string;
  syncedCount?: number;
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

function revalidateCalendarSurfaces() {
  revalidatePath("/app/agenda");
  revalidatePath("/app");
}

/**
 * Creates or updates the Google Calendar event for a Tesseli-managed
 * appointment. Idempotent: an appointment that already has a
 * `google_event_id` is patched, never re-created. Never called for
 * GOOGLE_EXTERNAL appointments (RLS would reject the resulting UPDATE
 * anyway, since only origin='TESSELI' rows are writable).
 */
export async function pushAppointmentToGoogleAction(
  appointmentId: string,
): Promise<SyncActionResult> {
  const { organizationId } = await requireOrgContext();

  const [appointment, connection] = await Promise.all([
    getAppointment(organizationId, appointmentId),
    getConnection(organizationId),
  ]);

  if (!appointment || appointment.origin !== "TESSELI") {
    return { error: "Consulta não encontrada ou não gerenciada pelo VirgíniaPsi." };
  }
  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }
  const calendarId = connection.calendar_id;

  const eventBody = {
    summary: appointment.summary_snapshot ?? "Consulta VirgíniaPsi",
    start: { dateTime: appointment.starts_at },
    end: { dateTime: appointment.ends_at },
  };

  try {
    const client = await getCalendarClientForOrganization(organizationId);
    const wasInsert = !appointment.google_event_id;
    const event = wasInsert
      ? await client.insertEvent(calendarId, eventBody)
      : await client.patchEvent(calendarId, appointment.google_event_id!, eventBody);

    const supabase = await createSupabaseServerClient();
    if (wasInsert) {
      const link = await persistGoogleCreateLink({
        appointmentId,
        googleEventId: event.id,
        persist: async () => {
          const { error } = await supabase
            .from("appointments")
            .update({
              google_calendar_id: calendarId,
              google_event_id: event.id,
              google_etag: event.etag ?? null,
              sync_status: "synced",
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", appointmentId);
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
            .eq("id", appointmentId);
          return { error };
        },
      });
      if (!link.ok) {
        await logSyncEvent({
          organizationId,
          direction: "push",
          action: link.compensated ? "create_event" : "PARTIAL_SYNC_FAILURE",
          appointmentId,
          requestPayload: {
            appointment_id: appointmentId,
            google_event_id: event.id,
            compensated: link.compensated,
          },
          errorMessage: link.syncError,
        });
        return { error: link.syncError };
      }
    } else {
      const { error } = await supabase
        .from("appointments")
        .update({
          google_calendar_id: calendarId,
          google_event_id: event.id,
          google_etag: event.etag ?? null,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", appointmentId);
      if (error) {
        await logSyncEvent({
          organizationId,
          direction: "push",
          action: "update_event",
          appointmentId,
          errorMessage: error.message,
        });
        return { error: LOCAL_MIRROR_UPDATE_ERROR };
      }
    }

    await logSyncEvent({
      organizationId,
      direction: "push",
      action: wasInsert ? "create_event" : "update_event",
      appointmentId,
      requestPayload: { starts_at: appointment.starts_at, ends_at: appointment.ends_at },
      responseStatus: "200",
    });
  } catch (error) {
    await logSyncEvent({
      organizationId,
      direction: "push",
      action: "create_event",
      appointmentId,
      errorMessage: error instanceof Error ? error.message : "unknown_error",
    });
    return { error: "Não foi possível sincronizar com o Google Calendar agora." };
  }

  revalidateCalendarSurfaces();
  return {};
}

/**
 * Resolves a Meet link for a managed online appointment.
 *
 * The Google event is always inspected first. Existing conferences are reused,
 * pending create requests are respected, and a new createRequest is issued
 * only when the event truly has no usable/pending Meet conference.
 */
export async function requestMeetForAppointmentAction(
  appointmentId: string,
): Promise<SyncActionResult> {
  const { organizationId } = await requireOrgContext();

  let [appointment, connection] = await Promise.all([
    getAppointment(organizationId, appointmentId),
    getConnection(organizationId),
  ]);

  if (!appointment || appointment.origin !== "TESSELI") {
    return { error: "Consulta não encontrada ou não gerenciada pelo VirgíniaPsi." };
  }
  if (appointment.modality !== "online") {
    return { error: "Google Meet está disponível apenas para atendimentos online." };
  }
  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }

  // A managed appointment may not have reached Google yet. Reuse the existing
  // idempotent push path instead of creating a parallel event or fake URL.
  if (!appointment.google_event_id) {
    const pushed = await pushAppointmentToGoogleAction(appointmentId);
    if (pushed.error) {
      return { error: pushed.error };
    }
    appointment = await getAppointment(organizationId, appointmentId);
    connection = await getConnection(organizationId);
  }

  if (!appointment?.google_event_id || !connection?.calendar_id) {
    return { error: "Não foi possível localizar o evento no Google Calendar." };
  }

  const calendarId = appointment.google_calendar_id ?? connection.calendar_id;
  const eventId = appointment.google_event_id;
  const supabase = await createSupabaseServerClient();

  try {
    const client = await getCalendarClientForOrganization(organizationId);

    // Idempotency/recovery boundary: never ask Google for a second conference
    // before checking the source-of-truth event itself.
    const googleEvent = await client.getEvent(calendarId, eventId);
    const existing = inspectExistingMeet(googleEvent);

    if (existing.status === "success" && existing.meetUrl) {
      const { error: recoverWriteError } = await supabase
        .from("appointments")
        .update({
          meet_status: "success",
          meet_request_id: existing.requestId,
          meet_url: existing.meetUrl,
        })
        .eq("id", appointmentId);

      if (recoverWriteError) {
        return { error: "Não foi possível salvar o link do Google Meet." };
      }

      await logSyncEvent({
        organizationId,
        direction: "pull",
        action: "recover_meet",
        appointmentId,
        requestPayload: { google_event_id: eventId },
        responseStatus: "success",
      });
      revalidateCalendarSurfaces();
      return {};
    }

    if (existing.status === "pending") {
      const { error: pendingWriteError } = await supabase
        .from("appointments")
        .update({
          meet_status: "pending",
          meet_request_id: existing.requestId,
        })
        .eq("id", appointmentId);

      if (pendingWriteError) {
        return { error: "Não foi possível salvar o status do Google Meet." };
      }

      await logSyncEvent({
        organizationId,
        direction: "pull",
        action: "recover_meet",
        appointmentId,
        requestPayload: { google_event_id: eventId },
        responseStatus: "pending",
      });
      revalidateCalendarSurfaces();
      return {};
    }

    const outcome = await requestMeetForEvent({
      calendarId,
      eventId,
      client,
    });

    const { error: meetWriteError } = await supabase
      .from("appointments")
      .update({
        meet_status: outcome.status,
        meet_request_id: outcome.requestId,
        meet_url: outcome.status === "success" ? outcome.meetUrl : appointment.meet_url,
      })
      .eq("id", appointmentId);
    if (meetWriteError) {
      return { error: "Não foi possível salvar o status do Meet." };
    }

    await logSyncEvent({
      organizationId,
      direction: "push",
      action: "create_meet",
      appointmentId,
      requestPayload: { requestId: outcome.requestId },
      responseStatus: outcome.status,
    });

    if (outcome.status === "failure") {
      return { error: "O Google não conseguiu criar o Meet. Tente novamente." };
    }

    revalidateCalendarSurfaces();
    return {};
  } catch (error) {
    await logSyncEvent({
      organizationId,
      direction: "push",
      action: "create_meet",
      appointmentId,
      errorMessage: error instanceof Error ? error.message : "unknown_error",
    });
    return { error: "Não foi possível criar ou recuperar o Meet agora." };
  }
}

const SYNC_WINDOW_DAYS = 30;
const SYNC_LOOKBACK_DAYS = 7;

export async function syncGoogleCalendarPull(
  organizationId: string,
): Promise<SyncActionResult> {
  const connection = await getConnection(organizationId);

  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }

  const timeMin = new Date(Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const calendarId = connection.calendar_id;

  const supabase = await createSupabaseServerClient();

  try {
    const client = await getCalendarClientForOrganization(organizationId);
    const pull = await runGoogleCalendarPull({
      listEvents: async (pageToken) =>
        client.listEvents(calendarId, {
          timeMin,
          timeMax,
          pageToken,
          showDeleted: true,
        }),
      upsertExternal: async (decision) => {
        const { error: upsertError } = await supabase.rpc("upsert_external_appointment", {
          org_id: organizationId,
          p_google_calendar_id: calendarId,
          p_google_event_id: decision.googleEventId,
          p_google_etag: decision.googleEtag,
          p_starts_at: decision.startIso,
          p_ends_at: decision.endIso,
          p_summary_snapshot: decision.summary,
          p_status: decision.status,
          p_google_color_id: decision.googleColorId,
          p_google_event_type: decision.googleEventType,
        });
        if (upsertError) {
          throw new Error(upsertError.message);
        }
      },
      markDeleted: async (googleEventId) => {
        const { error: markError } = await supabase.rpc("mark_external_google_event_deleted", {
          org_id: organizationId,
          p_google_calendar_id: calendarId,
          p_google_event_id: googleEventId,
        });
        if (markError) {
          throw new Error(markError.message);
        }
      },
      reconcileUnseen: async (seenActiveGoogleEventIds) => {
        const { data, error: reconcileError } = await supabase.rpc(
          "reconcile_unseen_google_mirrors",
          {
            org_id: organizationId,
            p_google_calendar_id: calendarId,
            p_seen_google_event_ids: seenActiveGoogleEventIds,
            p_window_start: timeMin,
            p_window_end: timeMax,
          },
        );
        if (reconcileError) {
          throw new Error(reconcileError.message);
        }
        return typeof data === "number" ? data : 0;
      },
    });

    const { error: connectionWriteError } = await supabase
      .from("google_calendar_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("organization_id", organizationId);
    if (connectionWriteError) {
      throw new Error(connectionWriteError.message);
    }

    await logSyncEvent({
      organizationId,
      direction: "pull",
      action: "sync_pull",
      requestPayload: {
        timeMin,
        timeMax,
        syncedCount: pull.syncedCount,
        reconciledUnseenCount: pull.reconciledUnseenCount,
      },
      responseStatus: "200",
    });

    revalidatePath("/app/agenda");
    return { syncedCount: pull.syncedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const { error: syncErrorWrite } = await supabase
      .from("google_calendar_connections")
      .update({ last_sync_error: message })
      .eq("organization_id", organizationId);
    if (syncErrorWrite) {
      await logSyncEvent({
        organizationId,
        direction: "pull",
        action: "sync_pull",
        errorMessage: syncErrorWrite.message,
      });
    }

    await logSyncEvent({
      organizationId,
      direction: "pull",
      action: "sync_pull",
      errorMessage: message,
    });

    return { error: "Não foi possível sincronizar com o Google Calendar agora." };
  }
}

/** Manual "Sincronizar agora" pull from the Agenda toolbar. */
export async function syncGoogleCalendarAction(): Promise<SyncActionResult> {
  const { organizationId } = await requireOrgContext();
  return syncGoogleCalendarPull(organizationId);
}
