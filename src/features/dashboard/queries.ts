import "server-only";

import {
  DEFAULT_GREETING_PREFIX,
  DEFAULT_QUOTE,
  PHASE_AVAILABILITY,
  myDayAppointmentSchema,
  practiceTaskSchema,
  selectNextSession,
  sessionToFinalizeSchema,
  type MyDayAppointment,
  type MyDaySnapshot,
  type PracticeTask,
  type SessionToFinalize,
} from "@/features/dashboard/contracts";
import type { OrganizationRole, ShellSettings } from "@/features/organizations/contracts";
import { ROLE_LABELS } from "@/features/organizations/labels";
import { listRecentDocuments } from "@/features/documents/queries";
import { getFinanceAccess, listCharges, listPayments, buildChargeViews } from "@/features/finance/queries";
import { todayIsoDate } from "@/features/finance/contracts";
import { monthReceiptsCents } from "@/features/dashboard/metrics";
import { listPatients } from "@/features/patients/queries";
import { isClinicalPractitioner } from "@/features/organizations/roles";
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

interface SessionJoinRow {
  id: string;
  status: string;
  started_at: string | null;
  created_at: string;
  patient_id: string;
  patients:
    | { preferred_name: string; public_code: string }
    | { preferred_name: string; public_code: string }[]
    | null;
}

export async function listSessionsToFinalize(
  organizationId: string,
): Promise<SessionToFinalize[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinical_sessions")
    .select(
      "id, status, started_at, created_at, patient_id, patients(preferred_name, public_code)",
    )
    .eq("organization_id", organizationId)
    .in("status", ["draft", "in_progress"])
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(12);

  if (error) {
    return [];
  }

  return (data as SessionJoinRow[] | null ?? []).flatMap((row) => {
    const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
    const parsed = sessionToFinalizeSchema.safeParse({
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      createdAt: row.created_at,
      patientId: row.patient_id,
      patientPreferredName: patient?.preferred_name ?? null,
      patientPublicCode: patient?.public_code ?? null,
    });
    return parsed.success ? [parsed.data] : [];
  });
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

async function countWeekSessions(
  organizationId: string,
  timezone: string,
): Promise<number> {
  const today = todayInTimeZone(timezone);
  const window = computeAgendaWindow("week", today, timezone);
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("origin", "TESSELI")
    .neq("status", "cancelled")
    .gte("starts_at", window.fromIso)
    .lt("starts_at", window.toIso);

  if (error) {
    return 0;
  }
  return count ?? 0;
}

export async function getMyDaySnapshot(input: {
  organizationId: string;
  timezone: string;
  professionalName: string;
  settings: ShellSettings | null;
  role: OrganizationRole;
}): Promise<MyDaySnapshot> {
  const [timeline, tasks, documents, sessionsToFinalize, patients, sessionsThisWeek] =
    await Promise.all([
      listTodayManagedAppointments(input.organizationId, input.timezone),
      listOpenTasks(input.organizationId),
      listRecentDocuments(input.organizationId),
      isClinicalPractitioner(input.role)
        ? listSessionsToFinalize(input.organizationId)
        : Promise.resolve([]),
      listPatients(input.organizationId),
      countWeekSessions(input.organizationId, input.timezone),
    ]);

  const greetingPrefix =
    input.settings?.greeting_prefix?.trim() || DEFAULT_GREETING_PREFIX;
  const quote = input.settings?.quote?.trim() || DEFAULT_QUOTE;

  const access = await getFinanceAccess(input.organizationId, input.role);
  let financialPending: MyDaySnapshot["financialPending"] = [];
  let monthReceiptsCentsValue = 0;
  if (access !== "none") {
    const [charges, payments] = await Promise.all([
      listCharges(input.organizationId),
      listPayments(input.organizationId),
    ]);
    const names = new Map(patients.map((patient) => [patient.id, patient.preferred_name]));
    const today = todayIsoDate(input.timezone);
    financialPending = buildChargeViews(charges, payments, names).filter(
      (charge) =>
        ["pending", "partially_paid", "overdue"].includes(charge.row.status) &&
        (charge.row.status === "overdue" ||
          charge.row.due_date === today ||
          charge.row.competence_date === today),
    );
    monthReceiptsCentsValue = monthReceiptsCents(payments, input.timezone, today);
  }

  return {
    greeting: {
      prefix: greetingPrefix,
      professionalName: input.professionalName,
      quote,
    },
    timezone: input.timezone,
    roleLabel: ROLE_LABELS[input.role],
    clinicName: input.settings?.clinic_name?.trim() || null,
    canStartSession: isClinicalPractitioner(input.role),
    nextSession: selectNextSession(timeline),
    timeline,
    sessionsToFinalize,
    financialPending,
    recentDocuments: documents.map((document) => ({
      id: document.id,
      title: document.title,
      documentKind: document.document_kind,
      status: document.status,
      createdAt: document.created_at,
    })),
    tasks,
    phases: PHASE_AVAILABILITY,
    metrics: {
      sessionsThisWeek,
      activePatients: patients.filter((patient) => patient.status === "active").length,
      clinicalPendencies: sessionsToFinalize.length + tasks.length,
      monthReceiptsCents: monthReceiptsCentsValue,
    },
  };
}
