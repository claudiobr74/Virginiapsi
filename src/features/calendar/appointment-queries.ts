import "server-only";

import { appointmentRowSchema, type AppointmentRow } from "@/features/calendar/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AppointmentWindow {
  fromIso: string;
  toIso: string;
}

export async function listAppointments(
  organizationId: string,
  window: AppointmentWindow,
): Promise<AppointmentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .lt("starts_at", window.toIso)
    .gt("ends_at", window.fromIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`failed to list appointments: ${error.message}`);
  }

  return appointmentRowSchema.array().parse(data ?? []);
}

export async function getAppointment(
  organizationId: string,
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load appointment: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const appointment = appointmentRowSchema.parse(data);
  return appointment.organization_id === organizationId ? appointment : null;
}

/**
 * Conflict detection scoped to Tesseli-managed appointments only: two
 * external Google events overlapping is not this app's problem to flag, and
 * an external event overlapping a managed one is shown as a soft warning by
 * the UI rather than blocking the save.
 */
export async function findOverlappingManagedAppointment(
  organizationId: string,
  startsAtIso: string,
  endsAtIso: string,
  excludeAppointmentId?: string,
): Promise<AppointmentRow | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("appointments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("origin", "TESSELI")
    .not("status", "in", "(cancelled)")
    .lt("starts_at", endsAtIso)
    .gt("ends_at", startsAtIso)
    .limit(1);

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`failed to check appointment conflicts: ${error.message}`);
  }

  const rows = appointmentRowSchema.array().parse(data ?? []);
  return rows[0] ?? null;
}
