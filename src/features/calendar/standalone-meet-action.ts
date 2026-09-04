"use server";

import { getConnection } from "@/features/calendar/connection-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { getCalendarClientForOrganization } from "@/lib/integrations/google/connection";
import {
  inspectExistingMeet,
  requestMeetForEvent,
} from "@/lib/integrations/google/meet";

export interface StandaloneMeetActionResult {
  error?: string;
  meetUrl?: string;
}

async function waitForStandaloneMeet(
  organizationId: string,
  calendarId: string,
  eventId: string,
): Promise<string | null> {
  const client = await getCalendarClientForOrganization(organizationId);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(500 * attempt, 1500)),
    );
    const event = await client.getEvent(calendarId, eventId);
    const existing = inspectExistingMeet(event);
    if (existing.status === "success" && existing.meetUrl) {
      return existing.meetUrl;
    }
    if (existing.status === "failure") {
      return null;
    }
  }

  return null;
}

/**
 * Creates an ad-hoc Google Meet from Meu Dia without requiring a patient,
 * appointment or online modality. Calendar owns the conference because this
 * is also compatible with the connected personal Gmail account.
 */
export async function createStandaloneMeetAction(): Promise<StandaloneMeetActionResult> {
  const { organizationId } = await requireOrgContext();
  const connection = await getConnection(organizationId);

  if (!connection || connection.status !== "connected" || !connection.calendar_id) {
    return { error: "Conecte e selecione um calendário do Google primeiro." };
  }

  const calendarId = connection.calendar_id;
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60_000);

  try {
    const client = await getCalendarClientForOrganization(organizationId);
    const event = await client.insertEvent(calendarId, {
      summary: "Sala Google Meet — VirgíniaPsi",
      description: "Sala avulsa criada pelo VirgíniaPsi.",
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() },
    });

    const outcome = await requestMeetForEvent({
      calendarId,
      eventId: event.id,
      client,
    });

    if (outcome.status === "success" && outcome.meetUrl) {
      return { meetUrl: outcome.meetUrl };
    }

    if (outcome.status === "pending") {
      const meetUrl = await waitForStandaloneMeet(
        organizationId,
        calendarId,
        event.id,
      );
      if (meetUrl) {
        return { meetUrl };
      }
    }

    return {
      error: "O Google não concluiu a criação da sala Meet. Tente novamente.",
    };
  } catch {
    return { error: "Não foi possível criar a sala Google Meet agora." };
  }
}
