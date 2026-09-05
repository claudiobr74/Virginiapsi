"use server";

import { revalidatePath } from "next/cache";
import { getAppointment } from "@/features/calendar/appointment-queries";
import { getConnection } from "@/features/calendar/connection-queries";
import { pushAppointmentToGoogleAction } from "@/features/calendar/sync-actions";
import { isPsychologistAdmin } from "@/features/organizations/roles";
import { getClinicalSession } from "@/features/sessions/queries";
import type {
  SessionMeetActionResult,
  SessionMeetTranscriptSyncResult,
} from "@/features/sessions/session-meet-contracts";
import { getSessionMeetBinding } from "@/features/sessions/session-meet-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import {
  getCalendarClientForOrganization,
  getValidAccessToken,
} from "@/lib/integrations/google/connection";
import {
  GoogleApiError,
  type GoogleCalendarEvent,
} from "@/lib/integrations/google/calendar-client";
import {
  inspectExistingMeet,
  requestMeetForEvent,
  type MeetOutcome,
} from "@/lib/integrations/google/meet";
import {
  GoogleMeetApiError,
  GoogleMeetClient,
  type GoogleMeetTranscript,
} from "@/lib/integrations/google/meet-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CREATING_STALE_AFTER_MS = 45_000;
const ACTIVE_CONFERENCE_POLL_MS = 120_000;
const TRANSCRIPT_ARTIFACT_POLL_MS = 30_000;
const FORBIDDEN_ROLE_MESSAGE = "Somente a psicóloga administradora conduz esta sessão clínica.";

function isFreshCreating(updatedAt: string): boolean {
  const updated = new Date(updatedAt).getTime();
  return Number.isFinite(updated) && Date.now() - updated < CREATING_STALE_AFTER_MS;
}

function meetingCodeFromUrl(meetUrl: string): string | null {
  try {
    const parts = new URL(meetUrl).pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

async function auditReadyMeet(input: {
  organizationId: string;
  sessionId: string;
  googleCalendarId: string;
  googleEventId: string;
}): Promise<void> {
  try {
    await logAuditEvent({
      organizationId: input.organizationId,
      action: "clinical_session.meet.create",
      resourceType: "clinical_session",
      resourceId: input.sessionId,
      metadata: {
        provider: "google_calendar",
        googleCalendarId: input.googleCalendarId,
        googleEventId: input.googleEventId,
        autoTranscriptionEnabled: false,
      },
    });
  } catch {
    console.error("failed to audit clinical_session.meet.create");
  }
}

async function auditMeetTranscriptImport(input: {
  organizationId: string;
  sessionId: string;
  conferenceRecordName: string;
  transcriptCount: number;
  entryCount: number;
}): Promise<void> {
  try {
    await logAuditEvent({
      organizationId: input.organizationId,
      action: "clinical_session.meet_transcript.import",
      resourceType: "clinical_session",
      resourceId: input.sessionId,
      metadata: {
        conferenceRecordName: input.conferenceRecordName,
        transcriptCount: input.transcriptCount,
        entryCount: input.entryCount,
      },
    });
  } catch {
    console.error("failed to audit clinical_session.meet_transcript.import");
  }
}

async function waitForExistingMeet(
  client: Awaited<ReturnType<typeof getCalendarClientForOrganization>>,
  calendarId: string,
  eventId: string,
  initialEvent: GoogleCalendarEvent,
): Promise<MeetOutcome> {
  let event = initialEvent;
  let existing = inspectExistingMeet(event);
  const requestId = existing.requestId ?? "existing-request";

  for (let attempt = 1; existing.status === "pending" && attempt <= 3; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(500 * attempt, 1500)));
    event = await client.getEvent(calendarId, eventId);
    existing = inspectExistingMeet(event);
  }

  if (existing.status === "success") {
    return {
      status: "success",
      requestId: existing.requestId ?? requestId,
      meetUrl: existing.meetUrl,
      event,
    };
  }
  if (existing.status === "failure") {
    return {
      status: "failure",
      requestId: existing.requestId ?? requestId,
      meetUrl: null,
      event,
    };
  }
  return {
    status: "pending",
    requestId: existing.requestId ?? requestId,
    meetUrl: null,
    event,
  };
}

async function resolveMeetForCalendarEvent(input: {
  organizationId: string;
  calendarId: string;
  eventId: string;
}): Promise<MeetOutcome> {
  const client = await getCalendarClientForOrganization(input.organizationId);
  const event = await client.getEvent(input.calendarId, input.eventId);
  const existing = inspectExistingMeet(event);

  if (existing.status === "success") {
    return {
      status: "success",
      requestId: existing.requestId ?? "existing-conference",
      meetUrl: existing.meetUrl,
      event,
    };
  }

  if (existing.status === "pending") {
    return waitForExistingMeet(client, input.calendarId, input.eventId, event);
  }

  return requestMeetForEvent({
    calendarId: input.calendarId,
    eventId: input.eventId,
    client,
  });
}

async function createTechnicalSessionEvent(input: {
  organizationId: string;
  calendarId: string;
  sessionStartedAt: string | null;
}): Promise<GoogleCalendarEvent> {
  const client = await getCalendarClientForOrganization(input.organizationId);
  const now = new Date();
  const sessionStart = input.sessionStartedAt ? new Date(input.sessionStartedAt) : now;
  const start = Number.isFinite(sessionStart.getTime()) ? sessionStart : now;
  const minimumEnd = new Date(now.getTime() + 15 * 60_000);
  const normalEnd = new Date(start.getTime() + 60 * 60_000);
  const end = normalEnd.getTime() > minimumEnd.getTime() ? normalEnd : minimumEnd;

  return client.insertEvent(input.calendarId, {
    summary: "Sessão VirgíniaPsi",
    description: "Evento técnico do VirgíniaPsi para videoconferência da sessão clínica.",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  });
}

export async function requestMeetForSessionAction(
  sessionId: string,
): Promise<SessionMeetActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isPsychologistAdmin(role)) {
    return { error: FORBIDDEN_ROLE_MESSAGE };
  }

  const [session, connection] = await Promise.all([
    getClinicalSession(organizationId, sessionId),
    getConnection(organizationId),
  ]);

  if (!session) {
    return { error: "Sessão clínica não encontrada." };
  }
  if (session.status === "finalized" || session.status === "canceled") {
    return { error: "Não é possível criar uma nova sala Meet para uma sessão encerrada." };
  }
  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google para criar o Meet." };
  }

  const supabase = await createSupabaseServerClient();
  let binding = await getSessionMeetBinding(organizationId, sessionId);

  if (binding?.status === "ready" && binding.meet_url) {
    return {
      status: "ready",
      meetUrl: binding.meet_url,
      autoTranscriptionEnabled: false,
    };
  }

  if (
    binding?.status === "creating" &&
    isFreshCreating(binding.updated_at) &&
    !binding.google_event_id
  ) {
    return {
      status: "creating",
      error: "A sala do Google Meet já está sendo preparada. Tente novamente em instantes.",
    };
  }

  if (!binding) {
    const { error: claimError } = await supabase.from("session_meet_bindings").insert({
      session_id: sessionId,
      organization_id: organizationId,
      status: "creating",
      transcript_status: "unavailable",
    });

    if (claimError) {
      binding = await getSessionMeetBinding(organizationId, sessionId);
      if (binding?.status === "ready" && binding.meet_url) {
        return {
          status: "ready",
          meetUrl: binding.meet_url,
          autoTranscriptionEnabled: false,
        };
      }
      if (!binding) {
        return { error: "Não foi possível reservar o vínculo desta sessão com o Google Meet." };
      }
    }
  } else {
    const { error: retryClaimError } = await supabase
      .from("session_meet_bindings")
      .update({ status: "creating", last_error: null, transcript_status: "unavailable" })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);
    if (retryClaimError) {
      return { error: "Não foi possível preparar o Google Meet agora." };
    }
  }

  binding = await getSessionMeetBinding(organizationId, sessionId);

  try {
    let calendarId = binding?.google_calendar_id ?? null;
    let eventId = binding?.google_event_id ?? null;
    let managedAppointment = session.appointment_id
      ? await getAppointment(organizationId, session.appointment_id)
      : null;

    if ((!calendarId || !eventId) && managedAppointment?.origin === "TESSELI") {
      if (!managedAppointment.google_event_id) {
        const pushed = await pushAppointmentToGoogleAction(managedAppointment.id);
        if (pushed.error) {
          throw new Error(pushed.error);
        }
        managedAppointment = await getAppointment(organizationId, managedAppointment.id);
      }

      if (managedAppointment?.google_event_id) {
        calendarId = managedAppointment.google_calendar_id ?? connection.calendar_id;
        eventId = managedAppointment.google_event_id;
      }
    }

    if (!calendarId || !eventId) {
      calendarId = connection.calendar_id;
      const technicalEvent = await createTechnicalSessionEvent({
        organizationId,
        calendarId,
        sessionStartedAt: session.started_at,
      });
      eventId = technicalEvent.id;
    }

    const { error: eventBindingError } = await supabase
      .from("session_meet_bindings")
      .update({
        google_calendar_id: calendarId,
        google_event_id: eventId,
        transcript_status: "unavailable",
        last_error: null,
      })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);
    if (eventBindingError) {
      throw new Error("Não foi possível vincular o evento do Google Calendar à sessão.");
    }

    const outcome = await resolveMeetForCalendarEvent({
      organizationId,
      calendarId,
      eventId,
    });

    if (managedAppointment?.origin === "TESSELI") {
      const { error: appointmentMeetError } = await supabase
        .from("appointments")
        .update({
          meet_status: outcome.status,
          meet_request_id: outcome.requestId,
          meet_url:
            outcome.status === "success" && outcome.meetUrl
              ? outcome.meetUrl
              : managedAppointment.meet_url,
        })
        .eq("id", managedAppointment.id)
        .eq("organization_id", organizationId);
      if (appointmentMeetError) {
        throw new Error("Não foi possível atualizar o Meet do agendamento.");
      }
    }

    if (outcome.status === "pending") {
      await supabase
        .from("session_meet_bindings")
        .update({
          status: "creating",
          last_error: null,
          transcript_status: "unavailable",
        })
        .eq("session_id", sessionId)
        .eq("organization_id", organizationId);

      revalidatePath(`/session/${sessionId}`);
      revalidatePath("/app");
      return {
        status: "creating",
        error: "O Google está preparando a sala Meet. Tente novamente em instantes.",
      };
    }

    if (outcome.status === "failure" || !outcome.meetUrl) {
      await supabase
        .from("session_meet_bindings")
        .update({
          status: "failed",
          last_error: "Google Calendar conference creation failed",
          transcript_status: "unavailable",
        })
        .eq("session_id", sessionId)
        .eq("organization_id", organizationId);
      return {
        status: "failed",
        error: "O Google não conseguiu criar o Meet. Tente novamente.",
      };
    }

    const { error: persistError } = await supabase
      .from("session_meet_bindings")
      .update({
        status: "ready",
        google_calendar_id: calendarId,
        google_event_id: eventId,
        meet_space_name: null,
        meeting_code: meetingCodeFromUrl(outcome.meetUrl),
        meet_url: outcome.meetUrl,
        auto_transcription_enabled: false,
        transcript_status: "unavailable",
        last_error: null,
      })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);

    if (persistError) {
      return {
        error:
          "O Google criou a sala, mas o VirgíniaPsi não conseguiu vincular o Meet à sessão com segurança.",
      };
    }

    await auditReadyMeet({
      organizationId,
      sessionId,
      googleCalendarId: calendarId,
      googleEventId: eventId,
    });

    revalidatePath(`/session/${sessionId}`);
    revalidatePath("/app");
    revalidatePath("/app/agenda");
    return {
      status: "ready",
      meetUrl: outcome.meetUrl,
      autoTranscriptionEnabled: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await supabase
      .from("session_meet_bindings")
      .update({ status: "failed", last_error: message, transcript_status: "unavailable" })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);

    if (error instanceof GoogleApiError && error.status === 403) {
      return {
        status: "failed",
        error:
          "O Google Calendar recusou a criação da videoconferência. Verifique a permissão do calendário conectado.",
      };
    }

    return {
      status: "failed",
      error: "Não foi possível criar o Google Meet agora. Tente novamente.",
    };
  }
}

export async function syncMeetTranscriptForSessionAction(
  sessionId: string,
): Promise<SessionMeetTranscriptSyncResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isPsychologistAdmin(role)) {
    return { status: "failed", error: FORBIDDEN_ROLE_MESSAGE };
  }

  const [session, binding] = await Promise.all([
    getClinicalSession(organizationId, sessionId),
    getSessionMeetBinding(organizationId, sessionId),
  ]);

  if (!session || !binding || binding.status !== "ready") {
    return { status: "not_started" };
  }

  if (!binding.meet_space_name) {
    return { status: "unavailable" };
  }

  if (binding.transcript_status === "imported") {
    return { status: "imported" };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const accessToken = await getValidAccessToken(organizationId);
    const client = new GoogleMeetClient({ accessToken });
    const records = (await client.listConferenceRecordsForSpace(binding.meet_space_name)).sort(
      (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime(),
    );

    if (records.length === 0) {
      return {
        status: "awaiting_artifact",
        nextPollMs: ACTIVE_CONFERENCE_POLL_MS,
      };
    }

    let hasActiveConference = false;
    let hasPendingArtifact = false;
    let generatedTranscriptCount = 0;
    let latestTranscriptName: string | null = null;
    const rows: Array<{
      session_id: string;
      organization_id: string;
      conference_record_name: string;
      transcript_name: string;
      google_entry_name: string;
      participant_resource: string | null;
      text: string;
      language_code: string | null;
      start_time: string;
      end_time: string;
    }> = [];

    for (const conference of records) {
      if (!conference.endTime) {
        hasActiveConference = true;
        continue;
      }

      const transcripts = await client.listTranscripts(conference.name);
      const generated = transcripts.filter(
        (transcript): transcript is GoogleMeetTranscript => transcript.state === "FILE_GENERATED",
      );

      if (generated.length === 0) {
        hasPendingArtifact = true;
        continue;
      }

      generatedTranscriptCount += generated.length;
      let conferenceHasEntries = false;

      for (const transcript of generated) {
        const entries = await client.listTranscriptEntries(transcript.name);
        latestTranscriptName = transcript.name;

        const validRows = entries
          .filter((entry) => entry.name && entry.text && entry.startTime && entry.endTime)
          .map((entry) => ({
            session_id: sessionId,
            organization_id: organizationId,
            conference_record_name: conference.name,
            transcript_name: transcript.name,
            google_entry_name: entry.name,
            participant_resource: entry.participant ?? null,
            text: entry.text,
            language_code: entry.languageCode ?? null,
            start_time: entry.startTime,
            end_time: entry.endTime,
          }));

        if (validRows.length > 0) {
          conferenceHasEntries = true;
          rows.push(...validRows);
        }
      }

      if (!conferenceHasEntries) {
        hasPendingArtifact = true;
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("session_meet_transcript_entries")
        .upsert(rows, {
          onConflict: "google_entry_name",
          ignoreDuplicates: true,
        });
      if (insertError) {
        throw new Error(`failed to persist Meet transcript entries: ${insertError.message}`);
      }
    }

    const latestConference = records[records.length - 1];
    const shouldKeepWatching = hasActiveConference || hasPendingArtifact || rows.length === 0;
    const nextStatus = shouldKeepWatching ? "awaiting_artifact" : "imported";
    const { error: bindingUpdateError } = await supabase
      .from("session_meet_bindings")
      .update({
        conference_record_id: latestConference?.name ?? binding.conference_record_id,
        transcript_id: latestTranscriptName ?? binding.transcript_id,
        transcript_status: nextStatus,
        last_error: null,
      })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);

    if (bindingUpdateError) {
      throw new Error(`failed to update Meet transcript state: ${bindingUpdateError.message}`);
    }

    if (shouldKeepWatching) {
      return {
        status: "awaiting_artifact",
        nextPollMs: hasActiveConference
          ? ACTIVE_CONFERENCE_POLL_MS
          : TRANSCRIPT_ARTIFACT_POLL_MS,
      };
    }

    await auditMeetTranscriptImport({
      organizationId,
      sessionId,
      conferenceRecordName: latestConference!.name,
      transcriptCount: generatedTranscriptCount,
      entryCount: rows.length,
    });

    revalidatePath(`/session/${sessionId}`);
    return { status: "imported", importedCount: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await supabase
      .from("session_meet_bindings")
      .update({ last_error: message })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);

    if (error instanceof GoogleMeetApiError && error.status === 403) {
      return {
        status: "failed",
        error:
          "A conexão Google precisa ser reconectada para permitir a leitura da transcrição do Meet.",
      };
    }

    return {
      status: "awaiting_artifact",
      nextPollMs: TRANSCRIPT_ARTIFACT_POLL_MS,
      error: "A transcrição do Meet ainda não pôde ser consultada.",
    };
  }
}
