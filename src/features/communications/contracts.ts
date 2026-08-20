import { z } from "zod";
import { TEMPLATE_KEYS } from "@/features/communications/templates";

export const OUTBOX_STATES = [
  "scheduled",
  "claimed",
  "sending",
  "sent",
  "retryable_failed",
  "permanent_failed",
  "canceled",
] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];

export const REMINDER_TYPES = ["reminder_24h", "reminder_2h"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const preferenceRowSchema = z.object({
  patient_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  whatsapp_enabled: z.boolean(),
  consent_id: z.string().uuid().nullable(),
  quiet_hours_start: z.string().nullable(),
  quiet_hours_end: z.string().nullable(),
});
export type PreferenceRow = z.infer<typeof preferenceRowSchema>;

export const templateRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  template_key: z.enum(TEMPLATE_KEYS),
  body: z.string(),
  twilio_content_sid: z.string().nullable(),
});
export type TemplateRow = z.infer<typeof templateRowSchema>;

export const outboxRowSchema = z.object({
  id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  reminder_type: z.enum(REMINDER_TYPES),
  scheduled_for: z.string(),
  state: z.enum(OUTBOX_STATES),
  attempt_count: z.number().int(),
  last_error_code: z.string().nullable(),
  sent_at: z.string().nullable(),
});
export type OutboxRow = z.infer<typeof outboxRowSchema>;

export const messageRowSchema = z.object({
  id: z.string().uuid(),
  template_key: z.enum(TEMPLATE_KEYS).nullable(),
  status: z.string(),
  to_number: z.string(),
  sent_at: z.string().nullable(),
  created_at: z.string(),
  body_redacted: z.string().nullable(),
});
export type MessageRow = z.infer<typeof messageRowSchema>;

export const inboundRowSchema = z.object({
  id: z.string().uuid(),
  intent: z.enum(["confirm", "decline_pending", "reschedule_pending", "unknown"]),
  processed: z.boolean(),
  created_at: z.string(),
  body_redacted: z.string().nullable(),
});
export type InboundRow = z.infer<typeof inboundRowSchema>;

export const setPreferenceSchema = z.object({
  patientId: z.string().uuid(),
  enabled: z.boolean(),
});
export type SetPreferenceValues = z.infer<typeof setPreferenceSchema>;

export const sendMessageSchema = z.object({
  patientId: z.string().uuid(),
  templateKey: z.enum(TEMPLATE_KEYS),
  appointmentId: z.string().uuid().optional(),
});
export type SendMessageValues = z.infer<typeof sendMessageSchema>;

export const TEMPLATE_LABELS: Record<(typeof TEMPLATE_KEYS)[number], string> = {
  confirmation: "Confirmação de agendamento",
  reminder_24h: "Lembrete 24h",
  reminder_2h: "Lembrete 2h",
  welcome: "Boas-vindas",
  billing: "Cobrança administrativa",
};

export const OUTBOX_STATE_LABELS: Record<OutboxState, string> = {
  scheduled: "Agendado",
  claimed: "Em processamento",
  sending: "Enviando",
  sent: "Enviado",
  retryable_failed: "Falha (nova tentativa)",
  permanent_failed: "Falha permanente",
  canceled: "Cancelado",
};

export interface PatientWhatsAppSnapshot {
  preference: PreferenceRow | null;
  hasWhatsappConsent: boolean;
  whatsappConsentId: string | null;
  allowed: boolean;
  phoneE164: string | null;
  templates: TemplateRow[];
  outbox: OutboxRow[];
  messages: MessageRow[];
  inbound: InboundRow[];
}
