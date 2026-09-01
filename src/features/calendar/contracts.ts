import { z } from "zod";

export const GOOGLE_CONNECTION_STATUS_VALUES = [
  "connected",
  "disconnected",
  "error",
] as const;
export type GoogleConnectionStatus = (typeof GOOGLE_CONNECTION_STATUS_VALUES)[number];

export const connectionRowSchema = z.object({
  organization_id: z.string().uuid(),
  status: z.enum(GOOGLE_CONNECTION_STATUS_VALUES),
  google_account_email: z.string().nullable(),
  calendar_id: z.string().nullable(),
  calendar_summary: z.string().nullable(),
  scopes: z.array(z.string()).catch([]),
  last_synced_at: z.string().nullable(),
  last_sync_error: z.string().nullable(),
  cancelled_google_color_ids: z.array(z.string()).nullish(),
});
export type ConnectionRow = z.infer<typeof connectionRowSchema>;

export const APPOINTMENT_STATUS_VALUES = [
  "scheduled",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS_VALUES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Concluída",
  no_show: "Faltou",
};

export const APPOINTMENT_STATUS_BADGE: Record<
  AppointmentStatus,
  "active" | "confirmed" | "cancelled" | "completed" | "attention"
> = {
  scheduled: "active",
  confirmed: "confirmed",
  cancelled: "cancelled",
  completed: "completed",
  no_show: "attention",
};

export const APPOINTMENT_ORIGIN_VALUES = ["TESSELI", "GOOGLE_EXTERNAL"] as const;
export type AppointmentOrigin = (typeof APPOINTMENT_ORIGIN_VALUES)[number];

export const MEET_STATUS_VALUES = ["none", "pending", "success", "failure"] as const;
export type MeetStatus = (typeof MEET_STATUS_VALUES)[number];

// Reuses the same modality vocabulary as patients (docs/04-data-model.md
// does not define a separate one for appointments).
export const APPOINTMENT_MODALITY_VALUES = ["in_person", "online", "hybrid"] as const;
export type AppointmentModality = (typeof APPOINTMENT_MODALITY_VALUES)[number];

export const appointmentRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patient_id: z.string().uuid().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.enum(APPOINTMENT_STATUS_VALUES),
  modality: z.enum(APPOINTMENT_MODALITY_VALUES),
  origin: z.enum(APPOINTMENT_ORIGIN_VALUES),
  managed_by_tesseli: z.boolean(),
  google_calendar_id: z.string().nullable(),
  google_event_id: z.string().nullable(),
  meet_url: z.string().nullable(),
  meet_status: z.enum(MEET_STATUS_VALUES),
  summary_snapshot: z.string().nullable(),
  google_etag: z.string().nullable().optional(),
  google_color_id: z.string().nullable().optional(),
  google_event_type: z.string().nullable().optional(),
  cancelled_google_color_ids: z.array(z.string()).nullish(),
  last_synced_at: z.string().nullable().optional(),
  sync_status: z.string(),
});
export type AppointmentRow = z.infer<typeof appointmentRowSchema>;

export const appointmentFormSchema = z
  .object({
    title: z.string().max(300, "Título muito longo."),
    patientId: z.string().uuid().optional().or(z.literal("")),
    date: z.string().min(1, "Informe a data."),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Informe um horário válido."),
    durationMinutes: z
      .string()
      .min(1, "Informe a duração.")
      .refine((value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 10 && parsed <= 480;
      }, "Duração deve ser entre 10 e 480 minutos."),
    modality: z.enum(APPOINTMENT_MODALITY_VALUES),
    createMeet: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!value.patientId && !value.title.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o título.",
        path: ["title"],
      });
    }
  });

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
