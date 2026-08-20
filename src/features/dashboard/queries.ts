import "server-only";

import {
  DEFAULT_GREETING_PREFIX,
  DEFAULT_QUOTE,
  PHASE_AVAILABILITY,
  myDayAppointmentSchema,
  practiceTaskSchema,
  selectNextSession,
  type MyDayAppointment,
  type MyDaySnapshot,
  type PracticeTask,
} from "@/features/dashboard/contracts";
import type { ShellSettings } from "@/features/organizations/contracts";
import { listRecentDocuments } from "@/features/documents/queries";
import { computeAgendaWindow, todayInTimeZone } from "@/features/calendar/date-window";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface AppointmentJoinRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  modality: string;
  origin: string;
  summary_snapshot: string | null;
  meet_url: string | null;
  meet_status: string;
  patient_id: string | null;
  patients:
    | {
        preferred_name: string;
        public_code: string;
        phone: string | null;
      }
    | {
        preferred_name: string;
        public_code: string;
        phone: string | null;
      }[]
    | null;
}

function toMyDayAppointment(row: AppointmentJoinRow): MyDayAppointment {
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
  return myDayAppointmentSchema.parse({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    modality: row.modality,
    origin: row.origin,
    summarySnapshot: row.summary_snapshot,
    meetUrl: row.meet_url,
    meetStatus: row.meet_status,
    patientId: row.patient_id,
    patientPreferredName: patient?.preferred_name ?? null,
    patientPublicCode: patient?.public_code ?? null,
    patientPhone: patient?.phone ?? null,
  });
}

async function listTodayManagedAppointments(
  organizationId: string,
  timezone: string,
): Promise<MyDayAppointment[]> {
  const today = todayInTimeZone(timezone);
  const window = computeAgendaWindow("day", today, timezone);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, starts_at, ends_at, status, modality, origin, summary_snapshot, meet_url, meet_status, patient_id, patients(preferred_name, public_code, phone)",
    )
    .eq("organization_id", organizationId)
    .eq("origin", "TESSELI")
    .neq("status", "cancelled")
    .lt("starts_at", window.toIso)
    .gt("ends_at", window.fromIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`failed to load today's appointments: ${error.message}`);
  }

  return (data as AppointmentJoinRow[] | null)?.map(toMyDayAppointment) ?? [];
}

export async function listOpenTasks(
  organizationId: string,
): Promise<PracticeTask[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practice_tasks")
    .select("id, organization_id, title, notes, due_at, completed_at, created_at")
    .eq("organization_id", organizationId)
    .is("completed_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`failed to list tasks: ${error.message}`);
  }

  return practiceTaskSchema.array().parse(data ?? []);
}

export async function getMyDaySnapshot(input: {
  organizationId: string;
  timezone: string;
  professionalName: string;
  settings: ShellSettings | null;
}): Promise<MyDaySnapshot> {
  const [timeline, tasks, documents] = await Promise.all([
    listTodayManagedAppointments(input.organizationId, input.timezone),
    listOpenTasks(input.organizationId),
    listRecentDocuments(input.organizationId),
  ]);

  const greetingPrefix =
    input.settings?.greeting_prefix?.trim() || DEFAULT_GREETING_PREFIX;
  const quote = input.settings?.quote?.trim() || DEFAULT_QUOTE;

  return {
    greeting: {
      prefix: greetingPrefix,
      professionalName: input.professionalName,
      quote,
    },
    timezone: input.timezone,
    nextSession: selectNextSession(timeline),
    timeline,
    sessionsToFinalize: {
      available: false,
      phase: 6,
      title: "Sessões a finalizar",
      description:
        "O fechamento de sessões clínicas e o rascunho DPEP chegam na Fase 6.",
    },
    financialPending: {
      available: false,
      phase: 10,
      title: "Pendências financeiras",
      description:
        "Cobranças do dia, recebimentos e ações rápidas de financeiro chegam na Fase 10.",
    },
    recentDocuments: documents.map((document) => ({
      id: document.id,
      title: document.title,
      documentKind: document.document_kind,
      status: document.status,
      createdAt: document.created_at,
    })),
    tasks,
    phases: PHASE_AVAILABILITY,
  };
}
