import "server-only";

import { computeAgendaWindow, todayInTimeZone } from "@/features/calendar/date-window";
import {
  attendanceRatePercent,
  isoDateInTimeZone,
  occupancyPercent,
  WEEKLY_CAPACITY_HOURS,
} from "@/features/dashboard/metrics";
import { monthBounds, todayIsoDate } from "@/features/finance/contracts";
import {
  buildChargeViews,
  getFinanceAccess,
  listCharges,
  listPayments,
} from "@/features/finance/queries";
import { listPatients } from "@/features/patients/queries";
import type { OrganizationRole } from "@/features/organizations/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addCents } from "@/lib/finance/money";
import { isValidCountableSession } from "@/features/calendar/google-event-status";
import type { AppointmentStatus } from "@/features/calendar/contracts";

export interface WeeklyPoint {
  label: string;
  count: number;
}

export interface MonthlyPoint {
  label: string;
  percent: number;
}

export interface IndicatorSnapshot {
  activePatients: number;
  newPatientsThisMonth: number;
  sessionsThisMonth: number;
  attendancePercent: number;
  weeklySessions: WeeklyPoint[];
  monthlyCancellations: MonthlyPoint[];
  occupancyPercent: number;
  filledHours: number;
  capacityHours: number;
  overdueCents: number;
  overduePatients: number;
}

interface AppointmentMetricRow {
  starts_at: string;
  ends_at: string;
  status: string;
  origin?: string;
  summary_snapshot?: string | null;
}

function isCountableMetricRow(row: AppointmentMetricRow): boolean {
  return isValidCountableSession({
    status: row.status as AppointmentStatus,
    summary_snapshot: row.summary_snapshot,
  });
}

function addDaysIso(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function monthLabel(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    timeZone: "UTC",
  });
}

export async function getIndicatorSnapshot(
  organizationId: string,
  timezone: string,
  role: OrganizationRole,
): Promise<IndicatorSnapshot> {
  const today = todayInTimeZone(timezone);
  const todayIso = todayIsoDate(timezone);
  const month = monthBounds(todayIso);
  const week = computeAgendaWindow("week", today, timezone);
  const lookbackStart = addDaysIso(today, -56);

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, patients, access] = await Promise.all([
    supabase
      .from("appointments")
      .select("starts_at, ends_at, status, origin, summary_snapshot")
      .eq("organization_id", organizationId)
      .gte("starts_at", `${lookbackStart}T00:00:00.000Z`),
    listPatients(organizationId),
    getFinanceAccess(organizationId, role),
  ]);

  const appointments = (error ? [] : (data as AppointmentMetricRow[] | null) ?? []).map(
    (row) => ({
      ...row,
      date: isoDateInTimeZone(row.starts_at, timezone),
    }),
  );

  const activePatients = patients.filter((patient) => patient.status === "active").length;
  const newPatientsThisMonth = patients.filter((patient) => {
    const created = isoDateInTimeZone(patient.created_at, timezone);
    return created >= month.start && created <= month.end;
  }).length;

  const monthAppointments = appointments.filter(
    (row) => row.date >= month.start && row.date <= month.end && isCountableMetricRow(row),
  );
  const completed = appointments.filter(
    (row) => row.date >= month.start && row.date <= month.end && row.status === "completed",
  ).length;
  const missed = appointments.filter(
    (row) =>
      row.date >= month.start &&
      row.date <= month.end &&
      (row.status === "no_show" || row.status === "cancelled"),
  ).length;

  const weeklySessions: WeeklyPoint[] = [];
  for (let index = 7; index >= 0; index -= 1) {
    const start = addDaysIso(today, -index * 7);
    const end = addDaysIso(start, 6);
    const count = appointments.filter(
      (row) => row.date >= start && row.date <= end && isCountableMetricRow(row),
    ).length;
    weeklySessions.push({ label: `S${8 - index}`, count });
  }

  const monthlyCancellations: MonthlyPoint[] = [];
  for (let index = 5; index >= 0; index -= 1) {
    const ref = addDaysIso(today, -index * 30);
    const bounds = monthBounds(ref.slice(0, 7) + "-15");
    const bucket = appointments.filter(
      (row) => row.date >= bounds.start && row.date <= bounds.end,
    );
    const cancelled = bucket.filter(
      (row) => row.status === "cancelled" || row.status === "no_show",
    ).length;
    monthlyCancellations.push({
      label: monthLabel(bounds.start),
      percent:
        bucket.length === 0 ? 0 : Math.round((cancelled / bucket.length) * 100),
    });
  }

  const weekAppointments = appointments.filter(
    (row) =>
      row.starts_at >= week.fromIso &&
      row.starts_at < week.toIso &&
      isCountableMetricRow(row),
  );
  const filledHours =
    weekAppointments.reduce((sum, row) => {
      const ms = new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime();
      return sum + Math.max(0, ms) / (60 * 60 * 1000);
    }, 0);

  let overdueCents = 0;
  let overduePatients = 0;
  if (access !== "none") {
    const [charges, payments] = await Promise.all([
      listCharges(organizationId),
      listPayments(organizationId),
    ]);
    const names = new Map(patients.map((patient) => [patient.id, patient.preferred_name]));
    const overdue = buildChargeViews(charges, payments, names).filter(
      (charge) => charge.row.status === "overdue",
    );
    overdueCents = overdue.length ? addCents(...overdue.map((charge) => charge.remainingCents)) : 0;
    overduePatients = new Set(
      overdue.map((charge) => charge.row.patient_id).filter(Boolean),
    ).size;
  }

  return {
    activePatients,
    newPatientsThisMonth,
    sessionsThisMonth: monthAppointments.length,
    attendancePercent: attendanceRatePercent(completed, missed),
    weeklySessions,
    monthlyCancellations,
    occupancyPercent: occupancyPercent(filledHours, WEEKLY_CAPACITY_HOURS),
    filledHours: Math.round(filledHours * 10) / 10,
    capacityHours: WEEKLY_CAPACITY_HOURS,
    overdueCents,
    overduePatients,
  };
}
