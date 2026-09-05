import "server-only";

import { appointmentRowSchema, type AppointmentRow } from "@/features/calendar/contracts";
import { isMissingPublicTable } from "@/lib/supabase/postgrest-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AppointmentWindow {
  fromIso: string;
  toIso: string;
}

export interface ListAppointmentsOptions {
  /** When Google Agenda is disconnected, load only VirgíniaPsi-managed rows. */
  managedOnly?: boolean;
}

export async function listAppointments(
  organizationId: string,
  window: AppointmentWindow,
  options?: ListAppointmentsOptions,
): Promise<AppointmentRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("appointments")
    .select("*")
    .eq("organization_id", organizationId)
    .is("google_deleted_at", null)
    .lt("starts_at", window.toIso)
    .gt("ends_at", window.fromIso);

  if (options?.managedOnly) {
    query = query.eq("origin", "TESSELI");
  }

  const { data, error } = await query.order("starts_at", { ascending: true });

  if (error) {
    if (isMissingPublicTable(error)) {
      return [];
    }
    return [];
  }

  const parsed = appointmentRowSchema.array().safeParse(data ?? []);
  return parsed.success ? parsed.data : [];
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
    .not("status", "in", "(cancelled,no_show)")
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
