import type { StatusBadgeStatus } from "@/components/ui/status-badge";
import type { DocumentStatus } from "@/features/documents/contracts";

export function documentStatusTone(status: DocumentStatus): StatusBadgeStatus {
  switch (status) {
    case "draft":
    case "under_review":
    case "signature_pending":
      return "pending";
    case "reviewed":
      return "attention";
    case "issued":
    case "signed":
    case "externally_signed":
    case "delivered":
      return "completed";
    case "canceled":
      return "cancelled";
    default:
      return "info";
  }
}
