"use server";

import { revalidatePath } from "next/cache";
import { getConnection } from "@/features/calendar/connection-queries";
import { isPsychologistAdmin } from "@/features/organizations/roles";
import { getClinicalSession } from "@/features/sessions/queries";
import type {
  SessionMeetActionResult,
  SessionMeetTranscriptSyncResult,
} from "@/features/sessions/session-meet-contracts";
import { getSessionMeetBinding } from "@/features/sessions/session-meet-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { getValidAccessToken } from "@/lib/integrations/google/connection";
import {
  GoogleMeetApiError,
  GoogleMeetClient,
  type GoogleMeetSpace,
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

async function createMeetSpaceWithBestEffortTranscription(
  client: GoogleMeetClient,
): Promise<{ space: GoogleMeetSpace; autoTranscriptionEnabled: boolean }> {
  try {
    const space = await client.createSpace({ autoTranscription: true });
    return { space, autoTranscriptionEnabled: true };
  } catch (error) {
    // Workspace edition/admin policy can still refuse automatic transcription
    // even when the OAuth token has the settings scope. Keep Meet usable and
    // continue watching for a transcription started manually by the clinician.
    if (!(error instanceof GoogleMeetApiError) || ![400, 403].includes(error.status)) {
      throw error;
    }

    const space = await client.createSpace();
    return { space, autoTranscriptionEnabled: false };
  }
}

async function auditReadyMeet(input: {
  organizationId: string;
  sessionId: string;
  meetSpaceName: string;
  autoTranscriptionEnabled: boolean;
}): Promise<void> {
  try {
    await logAuditEvent({
      organizationId: input.organizationId,
      action: "clinical_session.meet.create",
      resourceType: "clinical_session",
      resourceId: input.sessionId,
      metadata: {
        meetSpaceName: input.meetSpaceName,
        autoTranscriptionEnabled: input.autoTranscriptionEnabled,
      },
    });
  } catch {
    // The external room and its deterministic local binding are already
    // confirmed. An audit sink failure must never downgrade a usable Meet or
    // cause a second room to be created on retry.
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
  if (!connection || connection.status !== "connected") {
    return { error: "Conecte sua conta Google nas configurações para criar o Meet." };
  }

  const supabase = await createSupabaseServerClient();
  let binding = await getSessionMeetBinding(organizationId, sessionId);

  if (binding?.status === "ready" && binding.meet_url) {
    return {
      status: "ready",
      meetUrl: binding.meet_url,
      autoTranscriptionEnabled: binding.auto_transcription_enabled,
    };
  }

  if (binding?.status === "creating" && isFreshCreating(binding.updated_at)) {
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
      transcript_status: "not_started",
    });

    if (claimError) {
      // A concurrent click may have won the unique session_id claim. Re-read
      // rather than ever creating a second room for the same clinical session.
      binding = await getSessionMeetBinding(organizationId, sessionId);
      if (binding?.status === "ready" && binding.meet_url) {
        return {
          status: "ready",
          meetUrl: binding.meet_url,
          autoTranscriptionEnabled: binding.auto_transcription_enabled,
        };
      }
      if (binding?.status === "creating" && isFreshCreating(binding.updated_at)) {
        return {
          status: "creating",
          error: "A sala do Google Meet já está sendo preparada. Tente novamente em instantes.",
        };
      }
      if (!binding) {
        return { error: "Não foi possível reservar o vínculo desta sessão com o Google Meet." };
      }
    }
  }

  if (binding) {
    const { error: retryClaimError } = await supabase
      .from("session_meet_bindings")
      .update({ status: "creating", last_error: null })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);
    if (retryClaimError) {
      return { error: "Não foi possível preparar o Google Meet agora." };
    }
  }

  try {
    const accessToken = await getValidAccessToken(organizationId);
    const client = new GoogleMeetClient({ accessToken });
    const { space, autoTranscriptionEnabled } =
      await createMeetSpaceWithBestEffortTranscription(client);

    const { error: persistError } = await supabase
      .from("session_meet_bindings")
      .update({
        status: "ready",
        meet_space_name: space.name,
        meeting_code: space.meetingCode,
        meet_url: space.meetingUri,
        auto_transcription_enabled: autoTranscriptionEnabled,
        // Even when automatic transcription is unavailable, keep watching:
        // the clinician may start Meet transcription manually in the call.
        transcript_status: "awaiting_artifact",
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
      meetSpaceName: space.name,
      autoTranscriptionEnabled,
    });

    revalidatePath(`/session/${sessionId}`);
    return {
      status: "ready",
      meetUrl: space.meetingUri,
      autoTranscriptionEnabled,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await supabase
      .from("session_meet_bindings")
      .update({ status: "failed", last_error: message, transcript_status: "failed" })
      .eq("session_id", sessionId)
      .eq("organization_id", organizationId);

    if (error instanceof GoogleMeetApiError && error.status === 403) {
      return {
        status: "failed",
        error:
          "A conexão Google ainda não autorizou a criação direta de salas Meet. Reconecte o Google nas configurações e tente novamente.",
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

  if (!session || !binding || binding.status !== "ready" || !binding.meet_space_name) {
    return { status: "not_started" };
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

      // FILE_GENERATED can precede the entries endpoint becoming populated.
      // Never mark the clinical artifact imported until actual speech exists.
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
