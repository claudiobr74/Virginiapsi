export const PARTIAL_SYNC_FAILURE = "PARTIAL_SYNC_FAILURE";
export const GOOGLE_SYNC_USER_ERROR = "Não foi possível sincronizar com Google.";
export const LOCAL_MIRROR_UPDATE_ERROR =
  "Não foi possível atualizar o espelho local do agendamento.";
export const LOCAL_MIRROR_DELETE_ERROR = "Não foi possível remover o agendamento local.";

export type GoogleCreateLinkResult =
  | { ok: true }
  | { ok: false; syncError: string; compensated: true }
  | {
      ok: false;
      syncError: string;
      compensated: false;
      partialFailure: { appointmentId: string; googleEventId: string };
    };

/**
 * After Google events.insert succeeds, persist the link locally.
 * On persist failure, try to delete the Google event so retry does not duplicate.
 */
export async function persistGoogleCreateLink(input: {
  appointmentId: string;
  googleEventId: string;
  persist: () => Promise<{ error: unknown }>;
  compensateDelete: () => Promise<{ ok: boolean }>;
  markLocalError: () => Promise<{ error: unknown }>;
}): Promise<GoogleCreateLinkResult> {
  const persisted = await input.persist();
  if (!persisted.error) {
    return { ok: true };
  }

  const compensated = await input.compensateDelete();
  if (compensated.ok) {
    await input.markLocalError();
    return { ok: false, syncError: GOOGLE_SYNC_USER_ERROR, compensated: true };
  }

  return {
    ok: false,
    syncError: `${PARTIAL_SYNC_FAILURE} appointment_id=${input.appointmentId} google_event_id=${input.googleEventId}`,
    compensated: false,
    partialFailure: {
      appointmentId: input.appointmentId,
      googleEventId: input.googleEventId,
    },
  };
}

export function resultAfterGooglePatchAndLocal(localError: unknown): { error?: string } {
  if (localError) {
    return { error: LOCAL_MIRROR_UPDATE_ERROR };
  }
  return {};
}

export function resultAfterGoogleDeleteAndLocal(localError: unknown): { error?: string } {
  if (localError) {
    return { error: LOCAL_MIRROR_DELETE_ERROR };
  }
  return {};
}
