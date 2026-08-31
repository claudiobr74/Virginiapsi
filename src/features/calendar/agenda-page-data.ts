import "server-only";

import { z } from "zod";
import {
  listAppointments,
  type AppointmentWindow,
} from "@/features/calendar/appointment-queries";
import type { AppointmentRow, ConnectionRow } from "@/features/calendar/contracts";
import { getConnection } from "@/features/calendar/connection-queries";
import {
  googleConnectionIsLive,
  visibleAgendaAppointments,
} from "@/features/calendar/display";
import { ensureGoogleCalendarReady } from "@/features/calendar/ensure-calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const agendaPatientOptionSchema = z.object({
  id: z.string().uuid(),
  preferred_name: z.string(),
  public_code: z.string(),
});

export type AgendaPatientOption = z.infer<typeof agendaPatientOptionSchema>;

async function listAgendaPatientOptions(
  organizationId: string,
): Promise<AgendaPatientOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, preferred_name, public_code")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("preferred_name", { ascending: true });

  if (error) {
    return [];
  }

  const parsed = agendaPatientOptionSchema.array().safeParse(data ?? []);
  return parsed.success ? parsed.data : [];
}

export interface AgendaPageData {
  appointments: AppointmentRow[];
  connection: ConnectionRow | null;
  patients: AgendaPatientOption[];
}

/**
 * Agenda must render disconnected (empty board + banner). A thrown query
 * previously hit `error.tsx` ("Não foi possível carregar esta página").
 */
export async function loadAgendaPageData(
  organizationId: string,
  window: AppointmentWindow,
): Promise<AgendaPageData> {
  const initialConnection = await getConnection(organizationId).catch(
    (): ConnectionRow | null => null,
  );
  const connection = await ensureGoogleCalendarReady(
    organizationId,
    initialConnection,
  ).catch((): ConnectionRow | null => initialConnection);

  const managedOnly = !googleConnectionIsLive(connection);

  const [appointments, patients] = await Promise.all([
    listAppointments(organizationId, window, { managedOnly }).catch(
      (): AppointmentRow[] => [],
    ),
    listAgendaPatientOptions(organizationId).catch(
      (): AgendaPatientOption[] => [],
    ),
  ]);

  return {
    appointments: visibleAgendaAppointments(appointments, connection),
    connection,
    patients,
  };
}
