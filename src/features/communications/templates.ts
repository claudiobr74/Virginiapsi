export const TEMPLATE_KEYS = [
  "confirmation",
  "reminder_24h",
  "reminder_2h",
  "welcome",
  "billing",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateVars {
  patientName: string;
  startsAt?: string;
}

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body
    .replaceAll("{{patient_name}}", vars.patientName)
    .replaceAll("{{starts_at}}", vars.startsAt ?? "");
}

/**
 * Conservative inbound parser. Ambiguous text never confirms, declines or
 * reschedules an appointment on its own (docs/06-integrations.md §2).
 */
export type InboundIntent = "confirm" | "decline_pending" | "reschedule_pending" | "unknown";

export function parseInboundIntent(body: string | null | undefined): InboundIntent {
  const text = (body ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  if (!text) {
    return "unknown";
  }
  if (/^(sim|confirmo|confirmado|confirmar)(\b|[!.]?$)/.test(text)) {
    return "confirm";
  }
  if (/\b(remarcar|reagendar|outro horario|outra data)\b/.test(text)) {
    return "reschedule_pending";
  }
  if (/^(nao|cancelar|desmarcar)(\b|[!.]?$)/.test(text)) {
    return "decline_pending";
  }
  return "unknown";
}

export function redactInboundBody(body: string | null | undefined): string {
  const intent = parseInboundIntent(body);
  return intent;
}
