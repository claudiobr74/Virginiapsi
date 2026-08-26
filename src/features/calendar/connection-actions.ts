"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { syncGoogleCalendarPull } from "@/features/calendar/sync-actions";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { envIssueKeyNames, isLoopbackHttpUrl } from "@/lib/env/schema";
import { getGoogleCalendarEnv } from "@/lib/env/server";
import {
  disconnectGoogleCalendar,
  listAvailableCalendars,
  selectOrganizationCalendar,
} from "@/lib/integrations/google/connection";
import { googleCalendarListErrorMessage } from "@/lib/integrations/google/errors";
import { signOAuthState } from "@/lib/integrations/google/oauth";

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
  "Não foi possível iniciar a conexão com o Google Calendar. No Preview da Vercel, confira GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_TOKEN_ENCRYPTION_KEY. O endereço de retorno da Agenda é gerado automaticamente se ainda estiver apontando para localhost.";

const GOOGLE_CALENDAR_LOCALHOST_ERROR =
  "O retorno do Google Calendar ainda aponta para o computador (localhost). Na Vercel, NEXT_PUBLIC_APP_URL e GOOGLE_OAUTH_REDIRECT_URI precisam ser o endereço HTTPS deste site, não localhost.";

const GOOGLE_CALENDAR_KEYS_ERROR =
  "Faltam as chaves do Google Calendar na Vercel (Client ID e Client Secret). Importe do .env em Preview e Production.";

function toGoogleCalendarStartError(error: unknown): string {
  const keys = envIssueKeyNames(error);
  if (
    keys.includes("GOOGLE_CLIENT_ID") ||
    keys.includes("GOOGLE_CLIENT_SECRET")
  ) {
    return GOOGLE_CALENDAR_KEYS_ERROR;
  }
  if (keys.includes("GOOGLE_TOKEN_ENCRYPTION_KEY")) {
    return "Falta a chave de criptografia do Google Calendar na Vercel (GOOGLE_TOKEN_ENCRYPTION_KEY).";
  }
  if (
    keys.includes("GOOGLE_OAUTH_REDIRECT_URI") ||
    keys.includes("NEXT_PUBLIC_APP_URL")
  ) {
    return GOOGLE_CALENDAR_ENV_ERROR;
  }
  if (keys.length > 0) {
    return `Faltam estas variáveis na Vercel (Preview e Production): ${keys.join(", ")}. Cole do arquivo .env, sem aspas, e faça Redeploy.`;
  }
  return "Faltam configurações do servidor na Vercel para conectar o Google Calendar. Confira se as variáveis do .env existem em Preview e Production.";
}

export async function startGoogleConnectionAction(): Promise<CalendarActionResult> {
  const { organizationId, role, user } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return { error: "Apenas a psicóloga administradora conecta o Google Calendar." };
  }

  let env;
  try {
    env = getGoogleCalendarEnv();
  } catch (error) {
    return { error: toGoogleCalendarStartError(error) };
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
        summary: calendar.summary || calendar.id,
        primary: Boolean(calendar.primary),
      })),
    };
  } catch (error) {
    return {
      error: googleCalendarListErrorMessage(error),
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

  try {
    await syncGoogleCalendarPull(organizationId);
  } catch {
    // Calendar is already selected; the operator can retry sync from the panel.
  }

  return {};
}
