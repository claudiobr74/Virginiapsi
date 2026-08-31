"use server";

import { revalidatePath } from "next/cache";
import { getAppointment } from "@/features/calendar/appointment-queries";
import { getConnection } from "@/features/calendar/connection-queries";
import {
  getCalendarClientForOrganization,
  markGoogleConnectionError,
} from "@/lib/integrations/google/connection";
import { GoogleApiError } from "@/lib/integrations/google/calendar-client";
import {
  googleCalendarSyncErrorMessage,
  isRevokedGoogleGrant,
} from "@/lib/integrations/google/errors";
import {
  googleEventDateTimePayload,
  googleEventWindowIso,
} from "@/lib/integrations/google/event-window";
import { requestMeetForEvent } from "@/lib/integrations/google/meet";
import {
  shouldUpsertExternalGoogleEvent,
  managedEventCancelIsConflict,
} from "@/lib/integrations/google/pull-filter";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveTimeZone } from "@/features/calendar/date-window";

export interface SyncActionResult {
  error?: string;
  syncedCount?: number;
  importedCount?: number;
  updatedCount?: number;
  cancelledCount?: number;
  pushedCount?: number;
  pushErrors?: number;
  lastSyncedAt?: string;
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

function revalidateCalendarSurfaces() {
  revalidatePath("/app/agenda");
  revalidatePath("/app/agenda/connect");
  revalidatePath("/app/settings");
}

async function persistAppointmentSyncState(
  appointmentId: string,
  organizationId: string,
  fields: Record<string, unknown>,
) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("appointments")
    .update(fields)
    .eq("id", appointmentId)
    .eq("organization_id", organizationId);
}

function googleErrorContext(
  error: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const httpStatus = error instanceof GoogleApiError ? error.status : undefined;
  let googleErrorCode: string | undefined;
  if (error instanceof GoogleApiError && error.body && typeof error.body === "object") {
    const body = error.body as {
      error?: { status?: string; errors?: Array<{ reason?: string }> };
    };
    googleErrorCode = body.error?.status ?? body.error?.errors?.[0]?.reason;
  }
  return {
    ...extra,
    http_status: httpStatus ?? null,
    google_error_code: googleErrorCode ?? null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates or updates the Google Calendar event for a VirgíniaPsi-managed
 * appointment. Idempotent: an appointment that already has a
 * `google_event_id` is patched, never re-created. Never called for
 * GOOGLE_EXTERNAL appointments.
 */
export async function pushAppointmentToGoogle(
  organizationId: string,
  appointmentId: string,
  timeZone: string,
): Promise<SyncActionResult> {
  const [appointment, connection] = await Promise.all([
    getAppointment(organizationId, appointmentId),
    getConnection(organizationId),
  ]);

  if (!appointment || appointment.origin !== "TESSELI") {
    return { error: "Consulta não encontrada ou não gerenciada pelo VirgíniaPsi." };
  }
  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return {};
  }

  const eventBody = {
    summary: appointment.summary_snapshot ?? "Consulta VirgíniaPsi",
    start: googleEventDateTimePayload(appointment.starts_at, timeZone),
    end: googleEventDateTimePayload(appointment.ends_at, timeZone),
    status: appointment.status === "cancelled" ? "cancelled" : "confirmed",
  };

  try {
    const client = await getCalendarClientForOrganization(organizationId);
    let event;
    if (appointment.google_event_id) {
      if (appointment.status === "cancelled") {
        try {
          event = await client.patchEvent(
            connection.calendar_id,
            appointment.google_event_id,
            { status: "cancelled" },
          );
        } catch (error) {
          if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
            await persistAppointmentSyncState(appointmentId, organizationId, {
              sync_status: "synced",
              sync_error: null,
              last_synced_at: new Date().toISOString(),
            });
            return { pushedCount: 1 };
          }
          throw error;
        }
      } else {
        try {
          event = await client.patchEvent(
            connection.calendar_id,
            appointment.google_event_id,
            eventBody,
          );
        } catch (error) {
          if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
            event = await client.insertEvent(connection.calendar_id, eventBody);
          } else {
            throw error;
          }
        }
      }
    } else if (appointment.status === "cancelled") {
      await persistAppointmentSyncState(appointmentId, organizationId, {
        sync_status: "not_synced",
        sync_error: null,
      });
      return {};
    } else {
      event = await client.insertEvent(connection.calendar_id, eventBody);
    }

    await persistAppointmentSyncState(appointmentId, organizationId, {
      google_calendar_id: connection.calendar_id,
      google_event_id: event.id,
      google_etag: event.etag ?? null,
      sync_status: "synced",
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    });

    await logSyncEvent({
      organizationId,
      direction: "push",
      action: appointment.google_event_id
        ? appointment.status === "cancelled"
          ? "google_event_cancelled"
          : "google_event_updated"
        : "google_event_created",
      appointmentId,
      requestPayload: { starts_at: appointment.starts_at, ends_at: appointment.ends_at },
      responseStatus: "200",
    });
    return { pushedCount: 1 };
  } catch (error) {
    if (isRevokedGoogleGrant(error)) {
      await markGoogleConnectionError(organizationId, googleCalendarSyncErrorMessage(error));
    }
    const message = googleCalendarSyncErrorMessage(error);
    await persistAppointmentSyncState(appointmentId, organizationId, {
      sync_status: "error",
      sync_error: message,
    });
    await logSyncEvent({
      organizationId,
      direction: "push",
      action: "google_calendar_sync_failed",
      appointmentId,
      requestPayload: googleErrorContext(error, {
        appointment_id: appointmentId,
        google_event_id: appointment.google_event_id,
        operation: "push",
      }),
      errorMessage: message,
    });
    return { error: message, pushErrors: 1 };
  }
}

export async function pushAppointmentToGoogleAction(
  appointmentId: string,
): Promise<SyncActionResult> {
  const { organizationId, timezone } = await requireOrgContext();
  const result = await pushAppointmentToGoogle(
    organizationId,
    appointmentId,
    resolveTimeZone(timezone),
  );
  revalidateCalendarSurfaces();
  return result;
}

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
    return { error: "Sincronize a consulta com o Google Agenda antes de criar o Meet." };
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
      .eq("id", appointmentId)
      .eq("organization_id", organizationId);

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

  revalidateCalendarSurfaces();
  return {};
}

const SYNC_WINDOW_DAYS = 30;

async function managedGoogleAppointments(organizationId: string): Promise<
  Map<string, { id: string; status: string }>
> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, google_event_id, status")
    .eq("organization_id", organizationId)
    .eq("origin", "TESSELI")
    .not("google_event_id", "is", null);
  const map = new Map<string, { id: string; status: string }>();
  for (const row of data ?? []) {
    if (typeof row.google_event_id === "string") {
      map.set(row.google_event_id, { id: row.id as string, status: String(row.status) });
    }
  }
  return map;
}

async function existingExternalEventIds(
  organizationId: string,
  calendarId: string,
): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("appointments")
    .select("google_event_id")
    .eq("organization_id", organizationId)
    .eq("origin", "GOOGLE_EXTERNAL")
    .eq("google_calendar_id", calendarId);
  return new Set(
    (data ?? [])
      .map((row) => (typeof row.google_event_id === "string" ? row.google_event_id : null))
      .filter((value): value is string => Boolean(value)),
  );
}

async function pullGoogleEvents(
  organizationId: string,
  timeZone: string,
): Promise<SyncActionResult> {
  const connection = await getConnection(organizationId);

  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }

  const supabase = await createSupabaseServerClient();
  const knownIds = await existingExternalEventIds(organizationId, connection.calendar_id);
  const managedByGoogleId = await managedGoogleAppointments(organizationId);
  const managedIds = new Set(managedByGoogleId.keys());
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let importedCount = 0;
  let updatedCount = 0;
  let cancelledCount = 0;
  let nextSyncToken = connection.next_sync_token ?? null;

  try {
    const client = await getCalendarClientForOrganization(organizationId);

    const runList = async (incremental: boolean) => {
      let pageToken: string | undefined;
      let tokenForNext: string | undefined;
      do {
        const page = await client.listEvents(connection.calendar_id as string, incremental
          ? {
              syncToken: nextSyncToken ?? undefined,
              pageToken,
              showDeleted: true,
            }
          : {
              timeMin,
              timeMax,
              pageToken,
              showDeleted: true,
            });

        for (const event of page.items ?? []) {
          const cancelled = event.status === "cancelled";
          const managed = managedByGoogleId.get(event.id);
          if (managed) {
            if (managedEventCancelIsConflict(cancelled, managed.status)) {
              await supabase
                .from("appointments")
                .update({
                  sync_status: "conflict",
                  sync_error:
                    "Este compromisso foi alterado no Google Agenda e no VirgíniaPsi.",
                })
                .eq("id", managed.id)
                .eq("organization_id", organizationId);
            }
            continue;
          }

          if (
            !shouldUpsertExternalGoogleEvent(event.id, cancelled, managedIds, knownIds)
          ) {
            continue;
          }

          const window = cancelled
            ? {
                startIso: new Date().toISOString(),
                endIso: new Date(Date.now() + 60_000).toISOString(),
              }
            : googleEventWindowIso(event, timeZone);
          if (!cancelled && !window) {
            continue;
          }

          await supabase.rpc("upsert_external_appointment", {
            org_id: organizationId,
            p_google_calendar_id: connection.calendar_id,
            p_google_event_id: event.id,
            p_google_etag: event.etag ?? null,
            p_starts_at: window?.startIso,
            p_ends_at: window?.endIso,
            p_summary_snapshot: event.summary ?? "Evento Google",
            p_status: cancelled ? "cancelled" : "scheduled",
          });

          if (cancelled) {
            cancelledCount += 1;
          } else if (knownIds.has(event.id)) {
            updatedCount += 1;
          } else {
            importedCount += 1;
            knownIds.add(event.id);
          }
        }

        pageToken = page.nextPageToken;
        if (page.nextSyncToken) {
          tokenForNext = page.nextSyncToken;
        }
      } while (pageToken);
      return tokenForNext;
    };

    try {
      if (nextSyncToken) {
        nextSyncToken = (await runList(true)) ?? nextSyncToken;
      } else {
        nextSyncToken = (await runList(false)) ?? nextSyncToken;
      }
    } catch (error) {
      if (error instanceof GoogleApiError && error.status === 410) {
        await supabase
          .from("google_calendar_connections")
          .update({ next_sync_token: null })
          .eq("organization_id", organizationId);
        nextSyncToken = (await runList(false)) ?? null;
      } else {
        throw error;
      }
    }

    const lastSyncedAt = new Date().toISOString();
    await supabase
      .from("google_calendar_connections")
      .update({
        last_synced_at: lastSyncedAt,
        last_sync_error: null,
        next_sync_token: nextSyncToken,
        status: "connected",
      })
      .eq("organization_id", organizationId);

    await logSyncEvent({
      organizationId,
      direction: "pull",
      action: "google_calendar_sync_completed",
      requestPayload: {
        importedCount,
        updatedCount,
        cancelledCount,
        incremental: Boolean(connection.next_sync_token),
      },
      responseStatus: "200",
    });

    return {
      syncedCount: importedCount + updatedCount + cancelledCount,
      importedCount,
      updatedCount,
      cancelledCount,
      lastSyncedAt,
    };
  } catch (error) {
    const message = googleCalendarSyncErrorMessage(error);
    if (isRevokedGoogleGrant(error)) {
      await markGoogleConnectionError(organizationId, message);
    } else {
      await supabase
        .from("google_calendar_connections")
        .update({ last_sync_error: message })
        .eq("organization_id", organizationId);
    }
    await logSyncEvent({
      organizationId,
      direction: "pull",
      action: "google_calendar_sync_failed",
      requestPayload: googleErrorContext(error, {
        organization_id: organizationId,
        operation: "pull",
      }),
      errorMessage: message,
    });
    return { error: message };
  }
}

async function pushPendingManagedAppointments(
  organizationId: string,
  timeZone: string,
): Promise<Pick<SyncActionResult, "pushedCount" | "pushErrors">> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, google_event_id, sync_status, status")
    .eq("organization_id", organizationId)
    .eq("origin", "TESSELI");

  let pushedCount = 0;
  let pushErrors = 0;
  for (const row of data ?? []) {
    const needsPush =
      row.sync_status === "not_synced" ||
      row.sync_status === "error" ||
      (row.status === "cancelled" && Boolean(row.google_event_id) && row.sync_status !== "synced");
    if (!needsPush) {
      continue;
    }
    const result = await pushAppointmentToGoogle(organizationId, row.id as string, timeZone);
    pushedCount += result.pushedCount ?? 0;
    pushErrors += result.pushErrors ?? 0;
  }
  return { pushedCount, pushErrors };
}

export async function syncGoogleCalendarPull(
  organizationId: string,
  timeZone = "America/Sao_Paulo",
): Promise<SyncActionResult> {
  return pullGoogleEvents(organizationId, resolveTimeZone(timeZone));
}

/** Bidirectional "Sincronizar agora": Google → VirgíniaPsi + pendências locais → Google. */
export async function syncGoogleCalendarAction(): Promise<SyncActionResult> {
  const { organizationId, timezone } = await requireOrgContext();
  const timeZone = resolveTimeZone(timezone);

  await logSyncEvent({
    organizationId,
    direction: "pull",
    action: "google_calendar_sync_started",
  });

  const pull = await pullGoogleEvents(organizationId, timeZone);
  if (pull.error && pull.error.startsWith("Conecte")) {
    return pull;
  }

  const push = await pushPendingManagedAppointments(organizationId, timeZone);
  revalidateCalendarSurfaces();

  if (pull.error) {
    return { ...pull, ...push };
  }

  return {
    ...pull,
    ...push,
    syncedCount:
      (pull.importedCount ?? 0) +
      (pull.updatedCount ?? 0) +
      (pull.cancelledCount ?? 0) +
      (push.pushedCount ?? 0),
  };
}

export async function resolveCalendarConflictAction(
  appointmentId: string,
  side: "local" | "google",
): Promise<SyncActionResult> {
  const { organizationId, timezone } = await requireOrgContext();
  const appointment = await getAppointment(organizationId, appointmentId);
  if (!appointment || appointment.origin !== "TESSELI") {
    return { error: "Consulta não encontrada ou não gerenciada pelo VirgíniaPsi." };
  }

  if (side === "local") {
    await persistAppointmentSyncState(appointmentId, organizationId, {
      sync_status: "not_synced",
      sync_error: null,
    });
    const result = await pushAppointmentToGoogle(
      organizationId,
      appointmentId,
      resolveTimeZone(timezone),
    );
    revalidateCalendarSurfaces();
    return result;
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      sync_status: "not_synced",
      sync_error: null,
    })
    .eq("id", appointmentId)
    .eq("organization_id", organizationId);

  const result = await pushAppointmentToGoogle(
    organizationId,
    appointmentId,
    resolveTimeZone(timezone),
  );
  revalidateCalendarSurfaces();
  return result;
}
