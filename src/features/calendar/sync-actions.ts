"use server";

import { revalidatePath } from "next/cache";
import { getAppointment } from "@/features/calendar/appointment-queries";
import { getConnection } from "@/features/calendar/connection-queries";
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
  await supabase.rpc("log_calendar_sync_event", {
    org_id: input.organizationId,
    direction: input.direction,
    action: input.action,
    appointment_id: input.appointmentId ?? null,
    request_payload: input.requestPayload ?? {},
    response_status: input.responseStatus ?? null,
    error_message: input.errorMessage ?? null,
  });
}

/**
 * Creates or updates the Google Calendar event for a SerenaPsi-managed
 * appointment. Idempotent: an appointment that already has a
 * `google_event_id` is patched, never re-created. Never called for
 * GOOGLE_EXTERNAL appointments (RLS would reject the resulting UPDATE
 * anyway, since only origin='SERENAPSI' rows are writable).
 */
export async function pushAppointmentToGoogleAction(
  appointmentId: string,
): Promise<SyncActionResult> {
  const { organizationId } = await requireOrgContext();

  const [appointment, connection] = await Promise.all([
    getAppointment(organizationId, appointmentId),
    getConnection(organizationId),
  ]);

  if (!appointment || appointment.origin !== "SERENAPSI") {
    return { error: "Consulta não encontrada ou não gerenciada pelo SerenaPsi." };
  }
  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }

  const eventBody = {
    summary: appointment.summary_snapshot ?? "Consulta SerenaPsi",
    start: { dateTime: appointment.starts_at },
    end: { dateTime: appointment.ends_at },
  };

  try {
    const client = await getCalendarClientForOrganization(organizationId);
    const event = appointment.google_event_id
      ? await client.patchEvent(connection.calendar_id, appointment.google_event_id, eventBody)
      : await client.insertEvent(connection.calendar_id, eventBody);

    const supabase = await createSupabaseServerClient();
    await supabase
      .from("appointments")
      .update({
        google_calendar_id: connection.calendar_id,
        google_event_id: event.id,
        google_etag: event.etag ?? null,
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);

    await logSyncEvent({
      organizationId,
      direction: "push",
      action: appointment.google_event_id ? "update_event" : "create_event",
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

  if (!appointment || appointment.origin !== "SERENAPSI") {
    return { error: "Consulta não encontrada ou não gerenciada pelo SerenaPsi." };
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

    await supabase
      .from("appointments")
      .update({
        meet_status: outcome.status,
        meet_request_id: outcome.requestId,
        meet_url: outcome.status === "success" ? outcome.meetUrl : appointment.meet_url,
      })
      .eq("id", appointmentId);

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

/** Manual "Sincronizar agora" pull from the Agenda toolbar. */
export async function syncGoogleCalendarAction(): Promise<SyncActionResult> {
  const { organizationId } = await requireOrgContext();
  const connection = await getConnection(organizationId);

  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }

  const timeMin = new Date().toISOString();
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
      });

      for (const event of page.items) {
        if (!event.start?.dateTime || !event.end?.dateTime || event.status === "cancelled") {
          continue;
        }

        await supabase.rpc("upsert_external_appointment", {
          org_id: organizationId,
          p_google_calendar_id: connection.calendar_id,
          p_google_event_id: event.id,
          p_google_etag: event.etag ?? null,
          p_starts_at: event.start.dateTime,
          p_ends_at: event.end.dateTime,
          p_summary_snapshot: event.summary ?? "Evento externo do Google",
        });
        syncedCount += 1;
      }

      pageToken = page.nextPageToken;
    } while (pageToken);

    await supabase
      .from("google_calendar_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("organization_id", organizationId);

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
    await supabase
      .from("google_calendar_connections")
      .update({ last_sync_error: message })
      .eq("organization_id", organizationId);

    await logSyncEvent({
      organizationId,
      direction: "pull",
      action: "sync_pull",
      errorMessage: message,
    });

    return { error: "Não foi possível sincronizar com o Google Calendar agora." };
  }
}
