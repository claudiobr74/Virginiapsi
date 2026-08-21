import type { ChargeView } from "@/features/finance/contracts";
import type { MyDayAppointment } from "@/features/dashboard/contracts";
import { addCents } from "@/lib/finance/money";
import { formatInTimeZone } from "@/lib/utils/timezone";

export function sessionCountLabel(count: number): string {
  return count === 1 ? "1 sessão" : `${count} sessões`;
}

export function daySpanLabel(
  timeline: MyDayAppointment[],
  timeZone: string,
): string {
  if (timeline.length === 0) {
    return "Nenhum agendamento";
  }
  const first = formatInTimeZone(timeline[0].startsAt, timeZone);
  const last = formatInTimeZone(timeline[timeline.length - 1].endsAt, timeZone);
  return `${first} - ${last}`;
}

export function nextSessionStatTime(
  next: MyDayAppointment | null,
  timeZone: string,
): string {
  if (!next) {
    return "—";
  }
  return formatInTimeZone(next.startsAt, timeZone);
}

export function nextSessionStatName(next: MyDayAppointment | null): string {
  if (!next) {
    return "Sem atendimentos";
  }
  return next.patientPreferredName?.trim() || next.summarySnapshot || "Sem paciente vinculado";
}

export function finalizeCountLabel(count: number): string {
  if (count === 1) {
    return "1 prontuário";
  }
  return `${count} prontuários`;
}

export function pendingTotalCents(charges: ChargeView[]): number {
  if (charges.length === 0) {
    return 0;
  }
  return addCents(...charges.map((charge) => charge.remainingCents));
}

export function meetHostLabel(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function heroPatientName(appointment: MyDayAppointment): string {
  return appointment.patientPreferredName?.trim() || appointment.summarySnapshot || "Sem paciente vinculado";
}
