"use server";

import { revalidatePath } from "next/cache";
import { persistGoogleCreateLink, LOCAL_MIRROR_UPDATE_ERROR } from "@/features/calendar/google-sync-compensation";
import { deleteGoogleEventIgnoring404 } from "@/features/calendar/google-write";
import { getAppointment } from "@/features/calendar/appointment-queries";
import { getConnection } from "@/features/calendar/connection-queries";
import { deriveImportedAppointmentStatus } from "@/features/calendar/google-event-status";
import {
  getCalendarClientForOrganization,
} from "@/lib/integrations/google/connection";
import { requestMeetForEvent } from "@/lib/integrations/google/meet";
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

  revalidatePath("/app/agenda");
  return {};
}

/**
 * Requests a Meet link for an already-pushed appointment. Never fabricates a
 * URL: `pending`/`failure` leave `meet_url` untouched, only a resolved
 * `success` (with a real entry point) persists one.
 */
export async function requestMeetForAppointmentAction(
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
  if (!appointment.google_event_id || !connection?.calendar_id) {
    return { error: "Sincronize a consulta com o Google Calendar antes de criar o Meet." };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const client = await getCalendarClientForOrganization(organizationId);
    const outcome = await requestMeetForEvent({
      calendarId: connection.calendar_id,
      eventId: appointment.google_event_id,
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
  } catch (error) {
    await logSyncEvent({
      organizationId,
      direction: "push",
      action: "create_meet",
      appointmentId,
      errorMessage: error instanceof Error ? error.message : "unknown_error",
    });
    return { error: "Não foi possível criar o Meet agora." };
  }

  revalidatePath("/app/agenda");
  return {};
}

const SYNC_WINDOW_DAYS = 30;
const SYNC_LOOKBACK_DAYS = 7;

function eventWindowIso(event: {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}): { startIso: string; endIso: string } | null {
  const startIso =
    event.start?.dateTime ??
    (event.start?.date ? `${event.start.date}T00:00:00.000Z` : null);
  const endIso =
    event.end?.dateTime ??
    (event.end?.date ? `${event.end.date}T00:00:00.000Z` : null);
  if (!startIso || !endIso) {
    return null;
  }
  return { startIso, endIso };
}

export async function syncGoogleCalendarPull(
  organizationId: string,
): Promise<SyncActionResult> {
  const connection = await getConnection(organizationId);

  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }

  const timeMin = new Date(Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createSupabaseServerClient();

  try {
    const client = await getCalendarClientForOrganization(organizationId);
    let pageToken: string | undefined;
    let syncedCount = 0;

    do {
      const page = await client.listEvents(connection.calendar_id, {
        timeMin,
        timeMax,
        pageToken,
        showDeleted: true,
      });

      for (const event of page.items) {
        const window = eventWindowIso(event);
        if (!window) {
          continue;
        }

        const status = deriveImportedAppointmentStatus(event, {
          cancelledColorIds: connection.cancelled_google_color_ids,
        });
        const { error: upsertError } = await supabase.rpc("upsert_external_appointment", {
          org_id: organizationId,
          p_google_calendar_id: connection.calendar_id,
          p_google_event_id: event.id,
          p_google_etag: event.etag ?? null,
          p_starts_at: window.startIso,
          p_ends_at: window.endIso,
          p_summary_snapshot: event.summary ?? "Evento do Google",
          p_status: status,
          p_google_color_id: event.colorId ?? null,
        });
        if (upsertError) {
          throw new Error(upsertError.message);
        }
        syncedCount += 1;
      }

      pageToken = page.nextPageToken;
    } while (pageToken);

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
      requestPayload: { timeMin, timeMax },
      responseStatus: "200",
    });

    revalidatePath("/app/agenda");
    return { syncedCount };
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
