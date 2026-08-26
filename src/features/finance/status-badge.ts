import type { ChargeStatus, ExpenseStatus, PlanStatus } from "@/features/finance/contracts";
import type { StatusBadgeStatus } from "@/components/ui/status-badge";

export function chargeBadgeStatus(status: ChargeStatus): StatusBadgeStatus {
  switch (status) {
    case "paid":
      return "completed";
    case "pending":
      return "pending";
    case "partially_paid":
      return "attention";
    case "overdue":
      return "failed";
    case "canceled":
    case "refunded":
      return "cancelled";
    default:
      return "info";
  }
}

export function expenseBadgeStatus(status: ExpenseStatus): StatusBadgeStatus {
  switch (status) {
    case "paid":
      return "completed";
    case "pending":
      return "pending";
    case "overdue":
      return "failed";
    case "canceled":
      return "cancelled";
    default:
      return "info";
  }
}

export function planBadgeStatus(status: PlanStatus): StatusBadgeStatus {
  switch (status) {
    case "active":
      return "active";
    case "exhausted":
      return "attention";
    case "expired":
    case "canceled":
      return "cancelled";
    default:
      return "info";
  }
}
