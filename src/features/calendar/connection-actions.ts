"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import {
  disconnectGoogleCalendar,
  listAvailableCalendars,
  selectOrganizationCalendar,
} from "@/lib/integrations/google/connection";
import { signOAuthState } from "@/lib/integrations/google/oauth";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { isLoopbackHttpUrl } from "@/lib/env/schema";
import { getServerEnv } from "@/lib/env/server";

export interface CalendarActionResult {
  error?: string;
}

/**
 * Builds the sign-in URL for `/api/integrations/google/start` to redirect
 * through. Kept as a server action (not a plain <a href>) so we can enforce
 * the admin-only check before ever touching Google, with a friendly error
 * instead of a 403 from the route handler.
 */
const GOOGLE_CALENDAR_ENV_ERROR =
  "Não foi possível iniciar a conexão com o Google Calendar. Confira o endereço de retorno https://seu-site/api/integrations/google/callback na Vercel e o mesmo endereço no Google Cloud (é diferente do login).";

const GOOGLE_CALENDAR_LOCALHOST_ERROR =
  "O retorno do Google Calendar ainda aponta para o computador (localhost). Na Vercel, use https://seu-site/api/integrations/google/callback e cadastre esse mesmo endereço no Google Cloud.";

export async function startGoogleConnectionAction(): Promise<CalendarActionResult> {
  const { organizationId, role, user } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return { error: "Apenas a psicóloga administradora conecta o Google Calendar." };
  }

  let env;
  try {
    env = getServerEnv();
  } catch {
    return { error: GOOGLE_CALENDAR_ENV_ERROR };
  }

  if (isLoopbackHttpUrl(env.GOOGLE_OAUTH_REDIRECT_URI)) {
    return { error: GOOGLE_CALENDAR_LOCALHOST_ERROR };
  }

  const state = signOAuthState(
    { organizationId, userId: user.id, nonce: randomUUID(), issuedAt: Date.now() },
    env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );

  redirect(`/api/integrations/google/start?state=${encodeURIComponent(state)}`);
}

export async function disconnectGoogleAction(): Promise<CalendarActionResult> {
  const { organizationId, role } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return { error: "Apenas a psicóloga administradora desconecta o Google Calendar." };
  }

  try {
    await disconnectGoogleCalendar(organizationId);
  } catch {
    return { error: "Não foi possível desconectar agora. Tente novamente." };
  }

  await logAuditEvent({
    organizationId,
    action: "google_calendar.disconnect",
    resourceType: "google_calendar_connection",
  });

  return {};
}

export interface CalendarOption {
  id: string;
  summary: string;
  primary: boolean;
}

export async function listCalendarsAction(): Promise<{
  calendars?: CalendarOption[];
  error?: string;
}> {
  const { organizationId } = await requireOrgContext();

  try {
    const calendars = await listAvailableCalendars(organizationId);
    return {
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        summary: calendar.summary,
        primary: Boolean(calendar.primary),
      })),
    };
  } catch {
    return {
      error:
        "Não foi possível listar os calendários agora. Verifique a conexão e tente novamente.",
    };
  }
}

export async function selectCalendarAction(
  calendarId: string,
  calendarSummary: string,
): Promise<CalendarActionResult> {
  const { organizationId } = await requireOrgContext();

  try {
    await selectOrganizationCalendar(organizationId, calendarId, calendarSummary);
  } catch {
    return { error: "Não foi possível selecionar o calendário agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "google_calendar.select_calendar",
    resourceType: "google_calendar_connection",
    metadata: { calendar_id: calendarId },
  });

  return {};
}
