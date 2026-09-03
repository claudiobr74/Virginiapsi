"use server";

import { revalidatePath } from "next/cache";
import { getConnection } from "@/features/calendar/connection-queries";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { getClinicalSession } from "@/features/sessions/queries";
import type { SessionMeetActionResult } from "@/features/sessions/session-meet-contracts";
import { getSessionMeetBinding } from "@/features/sessions/session-meet-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { getValidAccessToken } from "@/lib/integrations/google/connection";
import {
  GoogleMeetApiError,
  GoogleMeetClient,
  type GoogleMeetSpace,
} from "@/lib/integrations/google/meet-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CREATING_STALE_AFTER_MS = 45_000;
const FORBIDDEN_ROLE_MESSAGE = "Somente a psicóloga responsável conduz sessão clínica.";

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
    // Some Workspace editions/admin policies can allow Meet creation while
    // refusing auto-transcription. Do not make the consultation fail because
    // of that optional artifact; retry room creation without the setting.
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

export async function requestMeetForSessionAction(
  sessionId: string,
): Promise<SessionMeetActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: FORBIDDEN_ROLE_MESSAGE };
  }

  const [session, connection] = await Promise.all([
    getClinicalSession(organizationId, sessionId),
    getConnection(organizationId),
  ]);

  if (!session) {
    return { error: "Sessão clínica não encontrada." };
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
        transcript_status: autoTranscriptionEnabled ? "awaiting_artifact" : "unavailable",
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
