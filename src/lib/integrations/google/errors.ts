import { GoogleApiError } from "@/lib/integrations/google/calendar-client";

function googleErrorBlob(error: GoogleApiError): string {
  try {
    return `${error.message} ${JSON.stringify(error.body ?? "")}`;
  } catch {
    return error.message;
  }
}

export function googleCalendarListErrorMessage(error: unknown): string {
  if (error instanceof GoogleApiError) {
    const blob = googleErrorBlob(error);
    if (error.status === 403 || error.status === 404) {
      if (/has not been used|disabled|not been enabled|accessNotConfigured/i.test(blob)) {
        return "A API Google Calendar ainda não está ativada neste projeto. No Google Cloud, abra Google Calendar API e clique em Ativar. Espere um minuto e selecione o calendário de novo.";
      }
      if (
        /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient authentication/i.test(
          blob,
        )
      ) {
        return "O Google não autorizou a leitura da agenda. Desconecte e conecte de novo, aceitando a permissão do Calendar.";
      }
      return "O Google recusou o acesso à lista de calendários. Ative a API Google Calendar no Google Cloud ou reconecte a conta.";
    }
    if (error.status === 401) {
      return "A conexão com o Google expirou. Desconecte e conecte de novo.";
    }
    if (error.status === 504) {
      return "O Google demorou para responder. Feche esta janela e tente selecionar o calendário de novo.";
    }
  }

  if (error instanceof Error) {
    if (error.message === "google_calendar_not_connected") {
      return "A conexão ainda não está completa. Conecte com o Google de novo.";
    }
    if (
      /malformed encrypted token|unable to authenticate|Unsupported state/i.test(
        error.message,
      )
    ) {
      return "Não foi possível ler o token do Google. Desconecte e conecte de novo.";
    }
  }

  return "Não foi possível listar os calendários agora. Verifique a conexão e tente novamente.";
}

export function googleCalendarSyncErrorMessage(error: unknown): string {
  if (error instanceof GoogleApiError) {
    if (error.status === 401) {
      return "A conexão com o Google expirou. Reconecte a conta em Integrações.";
    }
    if (error.status === 403) {
      return "O Google recusou a sincronização. Reconecte a conta e aceite a permissão do Calendar.";
    }
    if (error.status === 410) {
      return "O Google pediu um sync completo. Tente sincronizar de novo.";
    }
    if (error.status === 404) {
      return "O evento não existe mais no Google Agenda.";
    }
    if (error.status === 504) {
      return "O Google demorou para responder. Tente sincronizar de novo.";
    }
    return "Não foi possível atualizar o evento no Google Agenda.";
  }

  if (error instanceof Error) {
    if (error.message === "google_calendar_not_connected") {
      return "A conexão ainda não está completa. Conecte o Google Agenda de novo.";
    }
    if (/token refresh failed: 4(00|01)/i.test(error.message)) {
      return "A conexão com o Google expirou. Reconecte a conta em Integrações.";
    }
  }

  return "Não foi possível sincronizar com o Google Agenda agora.";
}

export function isRevokedGoogleGrant(error: unknown): boolean {
  if (error instanceof GoogleApiError) {
    return error.status === 401;
  }
  return error instanceof Error && /token refresh failed: 4(00|01)/i.test(error.message);
}
