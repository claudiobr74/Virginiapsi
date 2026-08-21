import { z } from "zod";
import type { ChargeView } from "@/features/finance/contracts";
import {
  APPOINTMENT_MODALITY_VALUES,
  APPOINTMENT_STATUS_VALUES,
  type AppointmentModality,
  type AppointmentStatus,
} from "@/features/calendar/contracts";

export const PHASE_AVAILABILITY = {
  clinicalSessions: true,
  finance: true,
  documents: true,
  twilioReminders: true,
} as const;

export type PhaseAvailability = typeof PHASE_AVAILABILITY;

export const myDayAppointmentSchema = z.object({
  id: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(APPOINTMENT_STATUS_VALUES),
  modality: z.enum(APPOINTMENT_MODALITY_VALUES),
  origin: z.enum(["TESSELI", "GOOGLE_EXTERNAL"]),
  summarySnapshot: z.string().nullable(),
  meetUrl: z.string().nullable(),
  meetStatus: z.enum(["none", "pending", "success", "failure"]),
  patientId: z.string().uuid().nullable(),
  patientPreferredName: z.string().nullable(),
  patientPublicCode: z.string().nullable(),
  patientPhone: z.string().nullable(),
});

export type MyDayAppointment = z.infer<typeof myDayAppointmentSchema>;

export const sessionToFinalizeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "in_progress"]),
  startedAt: z.string().nullable(),
  createdAt: z.string(),
  patientId: z.string().uuid(),
  patientPreferredName: z.string().nullable(),
  patientPublicCode: z.string().nullable(),
});

export type SessionToFinalize = z.infer<typeof sessionToFinalizeSchema>;

export const practiceTaskSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  due_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
});

export type PracticeTask = z.infer<typeof practiceTaskSchema>;

export const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Informe o título da tarefa.")
    .max(200, "Título muito longo."),
});

export type CreateTaskValues = z.infer<typeof createTaskSchema>;

export interface FutureModuleSection {
  available: false;
  phase: number;
  title: string;
  description: string;
}

export interface MyDayGreeting {
  prefix: string;
  professionalName: string;
  quote: string | null;
}

export interface RecentDocumentItem {
  id: string;
  title: string;
  documentKind: string;
  status: "draft" | "issued" | "signed" | "canceled";
  createdAt: string;
}

export interface MyDaySnapshot {
  greeting: MyDayGreeting;
  timezone: string;
  nextSession: MyDayAppointment | null;
  timeline: MyDayAppointment[];
  sessionsToFinalize: SessionToFinalize[];
  financialPending: ChargeView[];
  recentDocuments: RecentDocumentItem[];
  tasks: PracticeTask[];
  phases: PhaseAvailability;
}

export type { AppointmentModality, AppointmentStatus };

export const DEFAULT_GREETING_PREFIX = "Olá";
export const DEFAULT_QUOTE =
  "Um dia de cada vez — presença e cuidado na rotina clínica.";

export function sessionToFinalizeLabel(session: SessionToFinalize): string {
  const name = session.patientPreferredName?.trim() || "";
  const code = session.patientPublicCode?.trim() || "";
  if (name && code) {
    return `${name} • ${code}`;
  }
  return name || code || "Sessão clínica";
}

export function patientDisplayLabel(appointment: MyDayAppointment): string {
  if (appointment.patientPreferredName && appointment.patientPublicCode) {
    return `${appointment.patientPreferredName} • ${appointment.patientPublicCode}`;
  }
  return appointment.summarySnapshot ?? "Sem paciente vinculado";
}

/** The next session is the first that has not yet ended; otherwise null. */
export function selectNextSession(
  timeline: MyDayAppointment[],
  nowMs: number = Date.now(),
): MyDayAppointment | null {
  return (
    timeline.find((appointment) => new Date(appointment.endsAt).getTime() > nowMs) ??
    null
  );
}

/**
 * Builds a WhatsApp deep-link entry point for a confirmation/reminder from
 * Meu Dia. Automated 24h/2h reminders go through the Twilio outbox (Fase 11).
 */
export function buildWhatsAppReminderUrl(
  phone: string,
  patientLabel: string,
  startsAtIso: string,
  timeZone: string,
): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }

  const e164 = digits.startsWith("55") ? digits : `55${digits}`;
  const when = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAtIso));

  const text = `Olá${patientLabel ? `, ${patientLabel}` : ""}! Passando para confirmar sua sessão em ${when}. Qualquer imprevisto, me avise por favor.`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(text)}`;
}
