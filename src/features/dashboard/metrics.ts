import { monthBounds } from "@/features/finance/contracts";
import type { PaymentRow } from "@/features/finance/contracts";
import { centsFromCanonical } from "@/lib/finance/money";

export function isoDateInTimeZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function monthReceiptsCents(
  payments: PaymentRow[],
  timeZone: string,
  todayIso: string,
): number {
  const { start, end } = monthBounds(todayIso);
  return payments.reduce((sum, payment) => {
    if (payment.voided_at) {
      return sum;
    }
    const paidOn = isoDateInTimeZone(payment.paid_at, timeZone);
    if (paidOn < start || paidOn > end) {
      return sum;
    }
    return sum + centsFromCanonical(payment.amount);
  }, 0);
}

export function attendanceRatePercent(completed: number, missed: number): number {
  const total = completed + missed;
  if (total === 0) {
    return 0;
  }
  return Math.round((completed / total) * 100);
}

export function occupancyPercent(filledHours: number, capacityHours: number): number {
  if (capacityHours <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((filledHours / capacityHours) * 100)));
}

export const WEEKLY_CAPACITY_HOURS = 28;
