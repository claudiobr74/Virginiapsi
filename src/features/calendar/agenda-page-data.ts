import "server-only";

import { z } from "zod";
import {
  listAppointments,
  type AppointmentWindow,
} from "@/features/calendar/appointment-queries";
import type { AppointmentRow, ConnectionRow } from "@/features/calendar/contracts";
import { getConnection } from "@/features/calendar/connection-queries";
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
  const [appointments, connection, patients] = await Promise.all([
    listAppointments(organizationId, window).catch((): AppointmentRow[] => []),
    getConnection(organizationId).catch((): ConnectionRow | null => null),
    listAgendaPatientOptions(organizationId).catch(
      (): AgendaPatientOption[] => [],
    ),
  ]);

  return { appointments, connection, patients };
}
